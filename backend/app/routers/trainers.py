import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.trainer import Trainer
from app.models.user import User
from app.schemas.trainer import TrainerOut, TrainerRegister, TrainerUpdate

router = APIRouter(prefix="/trainers", tags=["trainers"])
logger = logging.getLogger(__name__)


@router.post("/register", response_model=TrainerOut, status_code=status.HTTP_201_CREATED)
def register(
    payload: TrainerRegister,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(Trainer).filter(Trainer.user_id == current_user.id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuario ja esta cadastrado como professor",
        )

    trainer = Trainer(
        user_id=current_user.id,
        cref_number=payload.cref_number,
        bio=payload.bio,
        price=payload.price,
    )
    db.add(trainer)
    db.commit()
    db.refresh(trainer)
    return trainer


@router.get("/me", response_model=TrainerOut)
def get_my_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trainer = db.query(Trainer).filter(Trainer.user_id == current_user.id).first()
    if not trainer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario nao esta cadastrado como professor",
        )
    return trainer


@router.patch("/me", response_model=TrainerOut)
def update_my_profile(
    payload: TrainerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trainer = db.query(Trainer).filter(Trainer.user_id == current_user.id).first()
    if not trainer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario nao esta cadastrado como professor",
        )

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(trainer, field, value)

    db.commit()
    db.refresh(trainer)
    return trainer


@router.get("/", response_model=list[TrainerOut])
def list_trainers(db: Session = Depends(get_db)):
    """Lista publica — so professores verificados e ativos aparecem na busca."""
    return (
        db.query(Trainer)
        .filter(Trainer.cref_verified.is_(True), Trainer.active.is_(True))
        .order_by(Trainer.created_at.desc())
        .all()
    )


@router.get("/{trainer_id}", response_model=TrainerOut)
def get_trainer(trainer_id: str, db: Session = Depends(get_db)):
    """Perfil publico de um professor — mesma regra da lista: so verificado e ativo."""
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
    return trainer


@router.patch("/{trainer_id}/verify", response_model=TrainerOut)
def verify_trainer(
    trainer_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Aprovacao manual de CREF — restrita a administradores (User.is_admin)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a administradores")

    try:
        parsed_id = uuid.UUID(trainer_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor nao encontrado")

    trainer = db.query(Trainer).filter(Trainer.id == parsed_id).first()
    if not trainer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor nao encontrado")

    trainer.cref_verified = True
    db.commit()
    db.refresh(trainer)
    return trainer
