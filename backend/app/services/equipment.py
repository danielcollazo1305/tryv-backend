import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.equipment_categories import ALLOWED_CATEGORIES_BY_ACTIVITY_MODEL
from app.models.equipment import Equipment
from app.models.user import User


def validate_equipment_for_activity(
    db: Session,
    current_user: User,
    equipment_id: uuid.UUID,
    activity_model: str,
) -> None:
    """
    Confere que equipment_id pertence ao usuario atual e que a category dele
    e permitida pra essa tabela de atividade (ver
    ALLOWED_CATEGORIES_BY_ACTIVITY_MODEL). Levanta HTTPException 400 se
    qualquer uma das duas falhar -- chamada pelos 4 endpoints de criacao
    (runs.py, activities.py, workout_sessions.py, workout_plans.py) antes
    de gravar a atividade. activity_model e uma chave de
    ALLOWED_CATEGORIES_BY_ACTIVITY_MODEL ("run" | "manual_activity" |
    "workout_session"), nao o nome da tabela SQL.
    """
    equipment = (
        db.query(Equipment)
        .filter(Equipment.id == equipment_id, Equipment.user_id == current_user.id)
        .first()
    )
    if not equipment:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Equipamento nao encontrado")

    allowed = ALLOWED_CATEGORIES_BY_ACTIVITY_MODEL.get(activity_model, [])
    if equipment.category not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Categoria '{equipment.category}' nao e valida para esta atividade (permitidas: {', '.join(allowed)})",
        )
