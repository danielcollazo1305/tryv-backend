"""Exclusao de conta (hard delete, irreversivel): `delete_user_account(db, user)`.

Reutilizavel (o endpoint POST /users/me/delete e um futuro job de limpeza em lote chamam a mesma funcao). Ordem:
  a. trava a linha do usuario (FOR UPDATE: duas exclusoes simultaneas nao se atropelam; a segunda ve o usuario sumido);
  b. pre-checagens (ultimo admin; profissional com alunos/desafios/planos ativos ou conta Stripe Connect) -> Blocked;
  c. Stripe: cancela as assinaturas do usuario (Pro e `trainer_addon` como aluno); falha -> StripeError e NADA e apagado;
  d. coleta as URLs do S3 (sem apagar), descartando as que outra pessoa referencia (`media_url` e texto livre);
  e. UMA transacao no banco (squads, participant_ids, denuncias, apagar na ordem das FKs); erro -> rollback total;
  f. commit;
  g. DEPOIS do commit, best-effort (falha so loga o id do usuario): apaga o customer no Stripe e as midias no S3.
Logs: so ids do usuario; nunca e-mail, senha, hash, texto, URL, chave do S3 nem ids do Stripe.
"""
import logging
import uuid
from datetime import datetime

import stripe
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.avatar_generation import AvatarGeneration
from app.models.challenge import Challenge, ChallengeCheckin
from app.models.content_filter_event import ContentFilterEvent
from app.models.creatine_log import CreatineLog
from app.models.daily_insight import DailyInsight
from app.models.diet_plan import DietPlan
from app.models.equipment import Equipment
from app.models.heart_rate import HeartRateSample
from app.models.live_activity import LiveActivity
from app.models.manual_activity import ManualActivity
from app.models.media_upload import MediaUpload
from app.models.meal import Meal
from app.models.moderation import PostReport, UserBlock
from app.models.password_reset import PasswordResetToken
from app.models.points_event import PointsEvent
from app.models.readiness_score import ReadinessScore
from app.models.run import Run
from app.models.saved_meal import SavedMeal
from app.models.smartwatch import SmartwatchData
from app.models.social import Comment, Follow, Like, Post
from app.models.squad import Squad, SquadMembership
from app.models.subscription import Subscription
from app.models.trainer import Trainer
from app.models.user import User
from app.models.waitlist_email import WaitlistEmail
from app.models.water_log import WaterLog
from app.models.weight_log import WeightLog
from app.models.workout import WorkoutPlan, WorkoutSession
from app.services.post_removal import purge_post
from app.services.storage import delete_user_media_by_url
from app.services.stripe_client import get_client

logger = logging.getLogger(__name__)

CONFIRMATION_WORD = "EXCLUIR"


class AccountDeletionBlocked(Exception):
    """Pendencia que impede a exclusao (409). A mensagem ja e o texto para a pessoa, em portugues."""


class AccountDeletionStripeError(Exception):
    """Falha ao cancelar a assinatura no Stripe (502). Nada foi apagado."""


class AccountAlreadyGone(Exception):
    """O usuario ja nao existe (exclusao concorrente ja concluida)."""


# ---------------------------------------------------------------------------------------------------------------
# Rede de seguranca: toda tabela com FK para users precisa estar aqui OU em FK_ACTION_TABLES (testado por introspeccao
# em try_exclusao_conta.py). Ao criar uma tabela nova que aponte para users, inclua-a na exclusao e neste conjunto.
# ---------------------------------------------------------------------------------------------------------------
# Apagadas, transferidas ou anonimizadas EXPLICITAMENTE por _delete_database_rows (linhas da pessoa).
# (Tabelas SEM usuario, como image_moderation_usage -- contador global diario --, nao tem FK para users, nao aparecem na
# introspeccao e por isso nao entram aqui.)
USER_OWNED_TABLES = frozenset(
    {
        "posts", "likes", "comments", "follows", "user_blocks", "challenge_checkins", "workout_sessions", "workout_plans",
        "diet_plans", "meals", "saved_meals", "water_logs", "creatine_logs", "weight_logs", "heart_rate_samples",
        "smartwatch_data", "readiness_scores", "daily_insights", "runs", "manual_activities", "live_activities",
        "equipment", "points_events", "avatar_generations", "password_reset_tokens", "subscriptions",
        "squad_memberships", "squads", "trainers", "content_filter_events",
        "media_uploads",
    }
)
# Tratadas pelo ON DELETE do proprio banco (so CASCADE/SET NULL sao aceitos), com a justificativa:
FK_ACTION_TABLES = {
    "post_reports": "reporter_id/target_author_id/reviewed_by = SET NULL: a denuncia fica anonima como trilha de moderacao "
    "(target_excerpt e zerado explicitamente)",
}

# Apagadas por "DELETE ... WHERE coluna = :uid", NESTA ordem (filhos antes dos pais; sessoes antes dos planos).
_SIMPLE_DELETIONS = [
    (ChallengeCheckin, ChallengeCheckin.user_id),
    (WorkoutSession, WorkoutSession.user_id),
    (WorkoutPlan, WorkoutPlan.user_id),
    (DietPlan, DietPlan.user_id),
    (Meal, Meal.user_id),
    (SavedMeal, SavedMeal.user_id),
    (WaterLog, WaterLog.user_id),
    (CreatineLog, CreatineLog.user_id),
    (WeightLog, WeightLog.user_id),
    (HeartRateSample, HeartRateSample.user_id),
    (SmartwatchData, SmartwatchData.user_id),
    (ReadinessScore, ReadinessScore.user_id),
    (DailyInsight, DailyInsight.user_id),
    (Run, Run.user_id),
    (ManualActivity, ManualActivity.user_id),
    (LiveActivity, LiveActivity.user_id),
    (Equipment, Equipment.user_id),
    (PointsEvent, PointsEvent.user_id),
    (AvatarGeneration, AvatarGeneration.user_id),
    (PasswordResetToken, PasswordResetToken.user_id),
    (Subscription, Subscription.user_id),
    (ContentFilterEvent, ContentFilterEvent.user_id),
    (MediaUpload, MediaUpload.user_id),
]


def find_blocking_reason(db: Session, user: User) -> str | None:
    """Texto (portugues) da primeira pendencia que impede a exclusao, ou None."""
    if user.is_admin:
        others = db.query(User.id).filter(User.is_admin.is_(True), User.id != user.id).count()
        if others == 0:
            return "Você é o único administrador. Transfira a administração antes de excluir a conta."
    trainer = db.query(Trainer).filter(Trainer.user_id == user.id).first()
    if trainer is not None:
        active_students = (
            db.query(Subscription.id)
            .filter(
                Subscription.trainer_id == trainer.id,
                Subscription.type == "trainer_addon",
                Subscription.status.in_(("active", "past_due")),
            )
            .count()
        )
        active_diets = db.query(DietPlan.id).filter(DietPlan.trainer_id == trainer.id, DietPlan.status == "active").count()
        if active_students or active_diets:
            return "Você ainda tem alunos ativos. Encerre as assinaturas e os planos dos seus alunos antes de excluir a conta."
        if db.query(Challenge.id).filter(Challenge.trainer_id == trainer.id, Challenge.end_date >= datetime.utcnow()).count():
            return "Você ainda tem desafios ativos. Aguarde o término deles ou fale com o suporte antes de excluir a conta."
        if trainer.stripe_account_id:
            return "Sua conta de recebimentos (Stripe) ainda está vinculada. Fale com o suporte para encerrá-la antes de excluir a conta."
    return None


def _stripe_already_gone(client, subscription_id: str, error: Exception) -> bool:
    """True se o erro do Stripe significa 'ja cancelada / nao existe' (idempotente)."""
    if getattr(error, "code", None) == "resource_missing":
        return True
    try:
        current = client.subscriptions.retrieve(subscription_id)
        return getattr(current, "status", None) == "canceled"
    except stripe.StripeError as retrieve_error:
        return getattr(retrieve_error, "code", None) == "resource_missing"


def _cancel_stripe_subscriptions(db: Session, user_id: uuid.UUID) -> None:
    """Cancela NA HORA (sem reembolso) todas as assinaturas ainda nao canceladas do usuario (Pro e trainer_addon como
    aluno). Ja cancelada/inexistente no Stripe = sucesso. Qualquer outra falha -> AccountDeletionStripeError."""
    ids = [
        sid
        for (sid,) in db.query(Subscription.stripe_subscription_id).filter(
            Subscription.user_id == user_id,
            Subscription.stripe_subscription_id.isnot(None),
            or_(Subscription.status.is_(None), Subscription.status != "canceled"),
        )
    ]
    if not ids:
        return
    try:
        client = get_client()
        for subscription_id in ids:
            try:
                client.subscriptions.cancel(subscription_id)
            except stripe.StripeError as error:
                if not _stripe_already_gone(client, subscription_id, error):
                    raise
    except Exception as error:  # noqa: BLE001 -- qualquer falha (Stripe, rede, chave ausente) aborta antes de apagar
        logger.error("account_deletion_stripe_cancel_failed user_id=%s (%s)", user_id, type(error).__name__)
        raise AccountDeletionStripeError() from error


def _collect_media_urls(db: Session, user: User) -> list[str]:
    """URLs de midia (S3) ligadas ao usuario, SEM apagar, menos as que outra pessoa referencia (media_url e texto livre:
    alguem pode apontar para a imagem de outro; essa NAO pode ser apagada)."""
    uid = user.id
    urls: set[str] = {u for u in (user.avatar_url, user.avatar_thumb_url) if u}
    urls.update(u for (u,) in db.query(Post.media_url).filter(Post.user_id == uid, Post.media_url.isnot(None)))
    # fotos de post aprovadas no upload (mesmo as nunca publicadas): saem do S3 junto com a conta
    urls.update(u for (u,) in db.query(MediaUpload.url).filter(MediaUpload.user_id == uid))
    for column in (Meal.photo_url, Meal.photo_thumb_url):
        urls.update(u for (u,) in db.query(column).filter(Meal.user_id == uid, column.isnot(None)))
    urls.update(u for (u,) in db.query(SavedMeal.photo_url).filter(SavedMeal.user_id == uid, SavedMeal.photo_url.isnot(None)))
    urls.update(u for (u,) in db.query(ChallengeCheckin.photo_url).filter(ChallengeCheckin.user_id == uid, ChallengeCheckin.photo_url.isnot(None)))
    urls.discard("")
    if not urls:
        return []

    shared: set[str] = set()
    shared.update(u for (u,) in db.query(Post.media_url).filter(Post.media_url.in_(urls), Post.user_id != uid))
    for column in (Meal.photo_url, Meal.photo_thumb_url):
        shared.update(u for (u,) in db.query(column).filter(column.in_(urls), Meal.user_id != uid))
    shared.update(u for (u,) in db.query(SavedMeal.photo_url).filter(SavedMeal.photo_url.in_(urls), SavedMeal.user_id != uid))
    shared.update(u for (u,) in db.query(ChallengeCheckin.photo_url).filter(ChallengeCheckin.photo_url.in_(urls), ChallengeCheckin.user_id != uid))
    for column in (User.avatar_url, User.avatar_thumb_url):
        shared.update(u for (u,) in db.query(column).filter(column.in_(urls), User.id != uid))
    return sorted(urls - shared)


def _handle_squads(db: Session, user_id: uuid.UUID) -> None:
    """Dono com outros membros: posse vai para o membro mais antigo; sem outros membros: apaga o squad (memberships
    antes). Depois remove a membership da propria pessoa."""
    for squad in db.query(Squad).filter(Squad.created_by == user_id).all():
        successor = (
            db.query(SquadMembership)
            .filter(SquadMembership.squad_id == squad.id, SquadMembership.user_id != user_id)
            .order_by(SquadMembership.joined_at.asc(), SquadMembership.id.asc())
            .first()
        )
        if successor is not None:
            squad.created_by = successor.user_id
            db.flush()
        else:
            db.query(SquadMembership).filter(SquadMembership.squad_id == squad.id).delete(synchronize_session=False)
            db.delete(squad)
            db.flush()
    db.query(SquadMembership).filter(SquadMembership.user_id == user_id).delete(synchronize_session=False)


def _release_trainer(db: Session, user_id: uuid.UUID) -> None:
    """Profissional SEM pendencias ativas: solta as referencias historicas que outras pessoas ainda tem e apaga o perfil."""
    trainer = db.query(Trainer).filter(Trainer.user_id == user_id).first()
    if trainer is None:
        return
    db.query(Subscription).filter(Subscription.trainer_id == trainer.id).update({"trainer_id": None}, synchronize_session=False)
    db.query(WorkoutPlan).filter(WorkoutPlan.trainer_id == trainer.id).update({"trainer_id": None}, synchronize_session=False)
    db.query(Challenge).filter(Challenge.trainer_id == trainer.id).update({"trainer_id": None}, synchronize_session=False)
    # diet_plans.trainer_id e NOT NULL: so restam planos ENCERRADOS (os ativos bloquearam a exclusao); sao apagados.
    db.query(DietPlan).filter(DietPlan.trainer_id == trainer.id).delete(synchronize_session=False)
    db.delete(trainer)
    db.flush()


def _delete_user_row(db: Session, user_id: uuid.UUID) -> None:
    db.query(User).filter(User.id == user_id).delete(synchronize_session=False)


def _delete_database_rows(db: Session, user: User) -> None:
    uid, email = user.id, user.email

    # Curtidas e comentarios da pessoa (em posts de qualquer um), depois os posts dela com tudo que e dos outros neles.
    db.query(Like).filter(Like.user_id == uid).delete(synchronize_session=False)
    db.query(Comment).filter(Comment.user_id == uid).delete(synchronize_session=False)
    for post in db.query(Post).filter(Post.user_id == uid).all():
        purge_post(db, post)  # a midia e tratada por _collect_media_urls (o retorno e ignorado de proposito)
    db.flush()  # purge_post usa db.delete(post) (adiado): precisa sair para o banco antes dos DELETEs em massa abaixo
    db.query(Follow).filter(or_(Follow.follower_id == uid, Follow.following_id == uid)).delete(synchronize_session=False)
    db.query(UserBlock).filter(or_(UserBlock.blocker_id == uid, UserBlock.blocked_id == uid)).delete(synchronize_session=False)

    _handle_squads(db, uid)
    db.execute(
        text("UPDATE challenges SET participant_ids = array_remove(participant_ids, CAST(:uid AS uuid)) WHERE CAST(:uid AS uuid) = ANY(participant_ids)"),
        {"uid": str(uid)},
    )
    # Denuncias CONTRA a pessoa ficam (motivo, estado, revisor, datas), sem o texto dela; as FEITAS por ela ficam anonimas
    # (reporter_id vira NULL pelo ON DELETE SET NULL ao apagar a linha de users).
    db.query(PostReport).filter(PostReport.target_author_id == uid).update({"target_excerpt": None}, synchronize_session=False)

    _release_trainer(db, uid)
    for model, column in _SIMPLE_DELETIONS:
        db.query(model).filter(column == uid).delete(synchronize_session=False)
    db.query(WaitlistEmail).filter(func.lower(WaitlistEmail.email) == email.lower()).delete(synchronize_session=False)
    _delete_user_row(db, uid)


def _delete_stripe_customer(customer_id: str | None, user_id: uuid.UUID) -> None:
    if not customer_id:
        return
    try:
        get_client().customers.delete(customer_id)
    except Exception as error:  # noqa: BLE001 -- best-effort, depois do commit
        logger.warning("account_deletion_stripe_customer_failed user_id=%s (%s)", user_id, type(error).__name__)


def _delete_media(urls: list[str], user_id: uuid.UUID) -> None:
    failures = 0
    for url in urls:
        try:
            ok = delete_user_media_by_url(url)
        except Exception:  # noqa: BLE001
            ok = False
        if not ok:
            failures += 1
    if failures:
        logger.warning("account_deletion_s3_delete_failed user_id=%s count=%s", user_id, failures)


def delete_user_account(db: Session, user: User) -> None:
    """Exclui a conta e os dados da pessoa (ver o docstring do modulo para a ordem). Levanta AccountAlreadyGone,
    AccountDeletionBlocked ou AccountDeletionStripeError (nada apagado) ou qualquer erro de banco (rollback total)."""
    uid = user.id
    customer_id = user.stripe_customer_id

    locked = db.query(User).filter(User.id == uid).with_for_update().first()
    if locked is None:
        raise AccountAlreadyGone()

    reason = find_blocking_reason(db, locked)
    if reason:
        raise AccountDeletionBlocked(reason)

    _cancel_stripe_subscriptions(db, uid)
    media_urls = _collect_media_urls(db, locked)

    try:
        _delete_database_rows(db, locked)
        db.commit()
    except Exception as error:
        db.rollback()
        logger.error("account_deletion_failed user_id=%s (%s)", uid, type(error).__name__)
        raise

    # Daqui para baixo a conta JA foi apagada: tudo e best-effort e so loga o id do usuario.
    _delete_stripe_customer(customer_id, uid)
    _delete_media(media_urls, uid)
    logger.info("account_deleted user_id=%s", uid)
