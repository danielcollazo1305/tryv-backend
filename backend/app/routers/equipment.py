import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.equipment import Equipment
from app.models.user import User
from app.schemas.equipment import EquipmentCreate, EquipmentOut

router = APIRouter(prefix="/equipment", tags=["equipment"])


@router.post("/", response_model=EquipmentOut, status_code=status.HTTP_201_CREATED)
def create_equipment(
    payload: EquipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = Equipment(user_id=current_user.id, category=payload.category, name=payload.name)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/", response_model=list[EquipmentOut])
def list_equipment(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Todos os itens do usuario, mais recentes primeiro -- category ja vem em
    cada item (ver EquipmentOut), o agrupamento por categoria fica a
    criterio do cliente (mobile), sem precisar de um formato de resposta
    aninhado aqui.
    """
    return (
        db.query(Equipment)
        .filter(Equipment.user_id == current_user.id)
        .order_by(Equipment.created_at.desc())
        .all()
    )


def _get_equipment_or_404(db: Session, current_user: User, equipment_id: str) -> Equipment:
    try:
        parsed_id = uuid.UUID(equipment_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipamento nao encontrado")

    item = (
        db.query(Equipment)
        .filter(Equipment.id == parsed_id, Equipment.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipamento nao encontrado")
    return item


@router.delete("/{equipment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_equipment(
    equipment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_equipment_or_404(db, current_user, equipment_id)
    db.delete(item)
    db.commit()
