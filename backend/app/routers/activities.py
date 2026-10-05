import logging
import uuid

import anthropic
import openai
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.manual_activity import ManualActivity
from app.models.user import User
from app.schemas.activity_insight import ActivityInsightOut
from app.schemas.manual_activity import ManualActivityCreate, ManualActivityOut
from app.services.activity_insight import generate_activity_insight
from app.services.equipment import ignore_equipment_for_activity
from app.services.points import award_points, manual_activity_points

router = APIRouter(prefix="/activities", tags=["activities"])
logger = logging.getLogger(__name__)


def _find_by_external_id(
    db: Session, current_user: User, payload: ManualActivityCreate
) -> ManualActivity | None:
    """
    Atividade ja importada desta mesma origem externa, se houver. Ver o
    equivalente em routers/runs.py e o comentario em models/run.py.
    """
    if not payload.external_id:
        return None
    return (
        db.query(ManualActivity)
        .filter(
            ManualActivity.user_id == current_user.id,
            ManualActivity.external_source == payload.external_source,
            ManualActivity.external_id == payload.external_id,
        )
        .first()
    )


@router.post("/manual", response_model=ManualActivityOut, status_code=status.HTTP_201_CREATED)
def create_manual_activity(
    payload: ManualActivityCreate,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    IDEMPOTENTE quando o payload traz external_source/external_id (importacao
    do Apple Health / Health Connect): repetir a mesma importacao devolve a
    atividade ja existente em vez de criar outra, com 200 em vez de 201 — e
    assim que o cliente sabe que nada foi criado agora. Ver app/models/run.py
    e createManualActivityFromImport em mobile/services/activities.ts.
    """
    if payload.fight_style is not None and payload.activity_type != "fight":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="fight_style so vale para luta")

    existing = _find_by_external_id(db, current_user, payload)
    if existing:
        response.status_code = status.HTTP_200_OK
        return existing

    # Atividade manual nao aceita mais equipamento: o equipment_id de um app antigo e ignorado (log INFO).
    ignore_equipment_for_activity(current_user.id, "manual_activity", payload.equipment_id)

    activity = ManualActivity(user_id=current_user.id, **payload.model_dump(exclude={"equipment_id"}))
    db.add(activity)
    try:
        db.commit()
    except IntegrityError:
        # Duas importacoes simultaneas do mesmo treino — ver comentario
        # equivalente em routers/runs.py.
        db.rollback()
        existing = _find_by_external_id(db, current_user, payload)
        if existing:
            response.status_code = status.HTTP_200_OK
            return existing
        raise
    db.refresh(activity)

    points = manual_activity_points(activity.calories_burned)
    award_points(db, current_user.id, points, "manual_activity", source_id=activity.id)

    return activity


@router.get("/manual", response_model=list[ManualActivityOut])
def list_manual_activities(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(ManualActivity)
        .filter(ManualActivity.user_id == current_user.id)
        .order_by(ManualActivity.performed_at.desc())
        .all()
    )


def _get_manual_activity_or_404(db: Session, current_user: User, activity_id: str) -> ManualActivity:
    try:
        parsed_id = uuid.UUID(activity_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atividade nao encontrada")

    activity = (
        db.query(ManualActivity)
        .filter(ManualActivity.id == parsed_id, ManualActivity.user_id == current_user.id)
        .first()
    )
    if not activity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Atividade nao encontrada")
    return activity


@router.get("/manual/{activity_id}", response_model=ManualActivityOut)
def get_manual_activity(
    activity_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_manual_activity_or_404(db, current_user, activity_id)


@router.get("/manual/{activity_id}/insight", response_model=ActivityInsightOut)
def get_manual_activity_insight(
    activity_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Interpretacao da atividade manual via IA, gerada sob demanda (nao e salva)."""
    activity = _get_manual_activity_or_404(db, current_user, activity_id)

    activity_data = {
        "activity_type": activity.activity_type,
        "duration_minutes": activity.duration_minutes,
        "calories_burned": activity.calories_burned,
        "notes": activity.notes,
    }

    try:
        return generate_activity_insight(activity_data)
    except (anthropic.APIError, openai.APIError, ValueError) as e:
        logger.error("Falha ao gerar insight de atividade manual (activity_id=%s): %s", activity.id, e)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nao foi possivel gerar a interpretacao desta atividade, tente novamente",
        )
