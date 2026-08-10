import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.subscription import Subscription
from app.models.trainer import Trainer
from app.models.user import User
from app.schemas.subscription import TeamBadge, UserBadgesOut
from app.schemas.user import UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


def _parse_user_id(user_id: str, db: Session) -> uuid.UUID:
    try:
        parsed_id = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")

    if not db.query(User).filter(User.id == parsed_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")

    return parsed_id


@router.get("/me", response_model=UserOut)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
def update_current_user(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(current_user, field, value)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/{user_id}/badges", response_model=UserBadgesOut)
def get_user_badges(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Selo Pro (assinatura da plataforma) e selos "Team [Professor]" (um por
    professor/nutricionista com assinatura ativa — sem prioridade unica entre
    eles, um aluno pode ter Team Personal e Team Nutri ao mesmo tempo).
    Publico pra qualquer usuario autenticado ver, tanto no proprio perfil
    quanto no perfil de terceiros — e informacao que faz sentido como prova
    social.
    """
    parsed_id = _parse_user_id(user_id, db)

    is_pro = (
        db.query(Subscription)
        .filter(
            Subscription.user_id == parsed_id,
            Subscription.type == "base",
            Subscription.status == "active",
        )
        .first()
        is not None
    )

    team_rows = (
        db.query(Trainer.professional_type, User.name)
        .select_from(Subscription)
        .join(Trainer, Subscription.trainer_id == Trainer.id)
        .join(User, Trainer.user_id == User.id)
        .filter(
            Subscription.user_id == parsed_id,
            Subscription.type == "trainer_addon",
            Subscription.status == "active",
        )
        .all()
    )
    teams = [
        TeamBadge(trainer_name=name, professional_type=professional_type)
        for professional_type, name in team_rows
    ]

    return UserBadgesOut(is_pro=is_pro, teams=teams)
