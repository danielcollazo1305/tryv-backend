import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.challenge import Challenge, ChallengeCheckin
from app.models.subscription import Subscription
from app.models.trainer import Trainer
from app.models.user import User
from app.schemas.challenge import (
    ChallengeCategory,
    ChallengeCheckinCreate,
    ChallengeCheckinOut,
    ChallengeCreate,
    ChallengeOut,
)
from app.schemas.social import UserBrief

router = APIRouter(tags=["challenges"])

# Professor "ativo na criacao de desafios" (>=1 desafio nos ultimos N dias)
# paga uma comissao menor. Ver _maybe_lower_platform_fee mais abaixo.
_CHALLENGE_ACTIVE_WINDOW_DAYS = 30
_CHALLENGE_ACTIVE_FEE_PERCENT = 12.0


def _challenge_out(db: Session, challenge: Challenge) -> ChallengeOut:
    participants_count = len(challenge.participant_ids or [])

    # % dos participantes com check-in HOJE — consulta por desafio (N+1 nas
    # listagens), aceitavel no volume atual do app (poucos desafios ativos
    # por vez); otimizar com uma query agregada em lote so se isso virar
    # gargalo de verdade.
    if participants_count > 0:
        checkins_today = (
            db.query(ChallengeCheckin)
            .filter(ChallengeCheckin.challenge_id == challenge.id, ChallengeCheckin.date == date.today())
            .count()
        )
        community_progress_percent = round(min(checkins_today, participants_count) / participants_count * 100)
    else:
        community_progress_percent = 0

    return ChallengeOut(
        id=challenge.id,
        trainer_id=challenge.trainer_id,
        title=challenge.title,
        description=challenge.description,
        start_date=challenge.start_date,
        end_date=challenge.end_date,
        participants_count=participants_count,
        is_official=challenge.is_official,
        category=challenge.category,
        community_progress_percent=community_progress_percent,
        created_at=challenge.created_at,
    )


def _get_verified_trainer(db: Session, current_user: User) -> Trainer:
    trainer = db.query(Trainer).filter(Trainer.user_id == current_user.id).first()
    if not trainer or not trainer.cref_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas profissionais verificados podem criar desafios",
        )
    # Decisao deliberada da v1, nao limitacao tecnica: o conceito de
    # "desafio" e toda a copy em volta (ex: TrainersHighlight) pressupoem
    # contexto de treino. Fica restrito a personal trainer por ora — pode
    # reavaliar depois se fizer sentido ter desafios de nutricao tambem.
    if trainer.professional_type != "personal_trainer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Desafios sao exclusivos de personal trainers nesta versao",
        )
    return trainer


def _get_challenge_or_404(db: Session, challenge_id: str) -> Challenge:
    try:
        parsed_id = uuid.UUID(challenge_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Desafio nao encontrado")

    challenge = db.query(Challenge).filter(Challenge.id == parsed_id).first()
    if not challenge:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Desafio nao encontrado")
    return challenge


def _maybe_lower_platform_fee(db: Session, trainer: Trainer) -> None:
    """
    Regra de negocio: a comissao da plataforma cai de 20% para 12% quando o
    professor esta "ativo na criacao de desafios" — ter criado pelo menos 1
    desafio nos ultimos _CHALLENGE_ACTIVE_WINDOW_DAYS dias.

    Por ora isso so e reavaliado (e so pode BAIXAR a taxa) no momento em que
    um novo desafio e criado. Nao ha job periodico para subir a taxa de
    volta quando os 30 dias se passarem sem novo desafio — isso fica para
    uma tarefa futura (ex: um cron diario que reavalia todos os
    professores e ajusta platform_fee_percent nos dois sentidos).
    """
    cutoff = datetime.utcnow() - timedelta(days=_CHALLENGE_ACTIVE_WINDOW_DAYS)
    is_active_in_challenges = (
        db.query(Challenge)
        .filter(Challenge.trainer_id == trainer.id, Challenge.created_at >= cutoff)
        .first()
        is not None
    )
    if is_active_in_challenges and trainer.platform_fee_percent != _CHALLENGE_ACTIVE_FEE_PERCENT:
        trainer.platform_fee_percent = _CHALLENGE_ACTIVE_FEE_PERCENT
        db.commit()


@router.get("/challenges", response_model=list[ChallengeOut])
def list_challenges(
    is_official: bool | None = Query(None),
    category: ChallengeCategory | None = Query(None),
    db: Session = Depends(get_db),
):
    """
    Listagem geral com filtros — usada pela aba "App" (is_official=true +
    category), que antes nao tinha nenhum jeito de buscar desafios que nao
    fossem de UM trainer especifico. A aba "Personal" continua usando a
    mesma limitacao ja documentada (deriva de trainers "conhecidos" no
    cliente, ver app/(tabs)/challenges.tsx) — nao existe conceito de "todos
    os profissionais" nem "meus profissionais" no backend ainda.
    """
    query = db.query(Challenge)
    if is_official is not None:
        query = query.filter(Challenge.is_official.is_(is_official))
    if category is not None:
        query = query.filter(Challenge.category == category)
    challenges = query.order_by(Challenge.created_at.desc()).all()
    return [_challenge_out(db, c) for c in challenges]


@router.get("/challenges/mine", response_model=list[ChallengeOut])
def list_my_active_challenges(
    is_official: bool | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Desafios ATIVOS (end_date no futuro) que o usuario logado participa —
    usado pela previa de progresso no card Desafios da Home (is_official=true,
    pega o mais recente) e pela secao de progresso em desafios de
    profissional no Perfil (is_official=false).
    """
    challenges = (
        db.query(Challenge)
        .filter(Challenge.participant_ids.any(current_user.id), Challenge.end_date >= datetime.utcnow())
        .order_by(Challenge.created_at.desc())
        .all()
    )
    if is_official is not None:
        challenges = [c for c in challenges if c.is_official == is_official]
    return [_challenge_out(db, c) for c in challenges]


@router.post("/challenges", response_model=ChallengeOut, status_code=status.HTTP_201_CREATED)
def create_challenge(
    payload: ChallengeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.end_date <= payload.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date deve ser posterior a start_date",
        )

    if payload.is_official:
        # Desafio oficial ("App") — restrito a administradores, mesmo
        # padrao ja usado pra aprovacao de CREF (trainers.py:293). Nao ha
        # tela de criacao no app pra isso ainda (fora do escopo desta
        # tarefa, que e sobre consumir/participar) — criacao e feita
        # diretamente via API por um admin por ora.
        if not current_user.is_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a administradores")
        if payload.category is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="category e obrigatorio para desafios oficiais",
            )
        challenge = Challenge(
            trainer_id=None,
            title=payload.title,
            description=payload.description,
            start_date=payload.start_date,
            end_date=payload.end_date,
            participant_ids=[],
            is_official=True,
            category=payload.category,
        )
        db.add(challenge)
        db.commit()
        db.refresh(challenge)
        return _challenge_out(db, challenge)

    trainer = _get_verified_trainer(db, current_user)

    challenge = Challenge(
        trainer_id=trainer.id,
        title=payload.title,
        description=payload.description,
        start_date=payload.start_date,
        end_date=payload.end_date,
        participant_ids=[],
        is_official=False,
        category=None,
    )
    db.add(challenge)
    db.commit()
    db.refresh(challenge)

    _maybe_lower_platform_fee(db, trainer)

    return _challenge_out(db, challenge)


@router.get("/trainers/{trainer_id}/challenges", response_model=list[ChallengeOut])
def list_trainer_challenges(trainer_id: str, db: Session = Depends(get_db)):
    """Vitrine publica — visivel mesmo para quem nao e aluno do professor."""
    try:
        parsed_id = uuid.UUID(trainer_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor nao encontrado")

    trainer = (
        db.query(Trainer)
        .filter(
            Trainer.id == parsed_id,
            Trainer.cref_verified.is_(True),
            Trainer.active.is_(True),
        )
        .first()
    )
    if not trainer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor nao encontrado")

    challenges = (
        db.query(Challenge)
        .filter(Challenge.trainer_id == parsed_id)
        .order_by(Challenge.created_at.desc())
        .all()
    )
    return [_challenge_out(db, c) for c in challenges]


@router.get("/challenges/{challenge_id}", response_model=ChallengeOut)
def get_challenge(challenge_id: str, db: Session = Depends(get_db)):
    return _challenge_out(db, _get_challenge_or_404(db, challenge_id))


@router.post("/challenges/{challenge_id}/join", response_model=ChallengeOut, status_code=status.HTTP_201_CREATED)
def join_challenge(
    challenge_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    challenge = _get_challenge_or_404(db, challenge_id)

    # Desafio oficial ("App") nao tem professor nenhum por tras — nao ha
    # assinatura pra exigir, e aberto a qualquer usuario logado (mesma
    # exigencia de acesso que a listagem/aba "App" ja tem: nenhuma, so
    # estar logado).
    if not challenge.is_official:
        has_active_subscription = (
            db.query(Subscription)
            .filter(
                Subscription.user_id == current_user.id,
                Subscription.trainer_id == challenge.trainer_id,
                Subscription.type == "trainer_addon",
                Subscription.status == "active",
            )
            .first()
            is not None
        )
        if not has_active_subscription:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="E necessario ser aluno deste professor para entrar no desafio",
            )

    participants = list(challenge.participant_ids or [])
    if current_user.id in participants:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Voce ja esta participando deste desafio",
        )

    participants.append(current_user.id)
    challenge.participant_ids = participants
    db.commit()
    db.refresh(challenge)

    return _challenge_out(db, challenge)


@router.delete("/challenges/{challenge_id}/join", status_code=status.HTTP_204_NO_CONTENT)
def leave_challenge(
    challenge_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    challenge = _get_challenge_or_404(db, challenge_id)

    participants = list(challenge.participant_ids or [])
    if current_user.id not in participants:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Voce nao esta participando deste desafio",
        )

    participants.remove(current_user.id)
    challenge.participant_ids = participants
    db.commit()


@router.get("/challenges/{challenge_id}/participants", response_model=list[UserBrief])
def list_participants(
    challenge_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    challenge = _get_challenge_or_404(db, challenge_id)

    trainer = db.query(Trainer).filter(Trainer.id == challenge.trainer_id).first() if challenge.trainer_id else None
    is_owner = trainer is not None and trainer.user_id == current_user.id
    is_participant = current_user.id in (challenge.participant_ids or [])

    if not (is_owner or is_participant):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Voce nao tem permissao para ver os participantes deste desafio",
        )

    participant_ids = challenge.participant_ids or []
    if not participant_ids:
        return []

    rows = db.query(User.id, User.name).filter(User.id.in_(participant_ids)).all()
    return [UserBrief(id=row.id, name=row.name) for row in rows]


@router.post(
    "/challenges/{challenge_id}/checkins",
    response_model=ChallengeCheckinOut,
    status_code=status.HTTP_201_CREATED,
)
def create_checkin(
    challenge_id: str,
    payload: ChallengeCheckinCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    challenge = _get_challenge_or_404(db, challenge_id)

    if current_user.id not in (challenge.participant_ids or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="E necessario estar participando do desafio para fazer check-in",
        )

    today = date.today()
    existing = (
        db.query(ChallengeCheckin)
        .filter(
            ChallengeCheckin.user_id == current_user.id,
            ChallengeCheckin.challenge_id == challenge.id,
            ChallengeCheckin.date == today,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voce ja fez check-in hoje")

    checkin = ChallengeCheckin(
        user_id=current_user.id,
        challenge_id=challenge.id,
        date=today,
        photo_url=payload.photo_url,
        shared_publicly=payload.shared_publicly,
    )
    db.add(checkin)
    db.commit()
    db.refresh(checkin)
    return checkin


@router.get("/challenges/{challenge_id}/checkins/me", response_model=list[ChallengeCheckinOut])
def list_my_checkins(
    challenge_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Historico de check-in do proprio usuario nesse desafio — alimenta o heatmap de consistencia na tela de detalhe."""
    challenge = _get_challenge_or_404(db, challenge_id)
    checkins = (
        db.query(ChallengeCheckin)
        .filter(ChallengeCheckin.user_id == current_user.id, ChallengeCheckin.challenge_id == challenge.id)
        .order_by(ChallengeCheckin.date.asc())
        .all()
    )
    return checkins
