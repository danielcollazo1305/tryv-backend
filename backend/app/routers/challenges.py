import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.challenge import Challenge
from app.models.subscription import Subscription
from app.models.trainer import Trainer
from app.models.user import User
from app.schemas.challenge import ChallengeCreate, ChallengeOut
from app.schemas.social import UserBrief

router = APIRouter(tags=["challenges"])

# Professor "ativo na criacao de desafios" (>=1 desafio nos ultimos N dias)
# paga uma comissao menor. Ver _maybe_lower_platform_fee mais abaixo.
_CHALLENGE_ACTIVE_WINDOW_DAYS = 30
_CHALLENGE_ACTIVE_FEE_PERCENT = 12.0


def _challenge_out(challenge: Challenge) -> ChallengeOut:
    return ChallengeOut(
        id=challenge.id,
        trainer_id=challenge.trainer_id,
        title=challenge.title,
        description=challenge.description,
        start_date=challenge.start_date,
        end_date=challenge.end_date,
        participants_count=len(challenge.participant_ids or []),
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


@router.post("/challenges", response_model=ChallengeOut, status_code=status.HTTP_201_CREATED)
def create_challenge(
    payload: ChallengeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trainer = _get_verified_trainer(db, current_user)

    if payload.end_date <= payload.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date deve ser posterior a start_date",
        )

    challenge = Challenge(
        trainer_id=trainer.id,
        title=payload.title,
        description=payload.description,
        start_date=payload.start_date,
        end_date=payload.end_date,
        participant_ids=[],
    )
    db.add(challenge)
    db.commit()
    db.refresh(challenge)

    _maybe_lower_platform_fee(db, trainer)

    return _challenge_out(challenge)


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
    return [_challenge_out(c) for c in challenges]


@router.get("/challenges/{challenge_id}", response_model=ChallengeOut)
def get_challenge(challenge_id: str, db: Session = Depends(get_db)):
    return _challenge_out(_get_challenge_or_404(db, challenge_id))


@router.post("/challenges/{challenge_id}/join", response_model=ChallengeOut, status_code=status.HTTP_201_CREATED)
def join_challenge(
    challenge_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    challenge = _get_challenge_or_404(db, challenge_id)

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

    return _challenge_out(challenge)


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

    trainer = db.query(Trainer).filter(Trainer.id == challenge.trainer_id).first()
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
