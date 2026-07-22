import logging
import uuid

import anthropic
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.meal import Meal
from app.models.user import User
from app.schemas.meal import MealAnalysisOut, MealCreate, MealOut
from app.services.meal_analysis import analyze_meal_photo

router = APIRouter(prefix="/meals", tags=["meals"])
logger = logging.getLogger(__name__)


@router.post("/analyze", response_model=MealAnalysisOut)
async def analyze(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Analisa uma foto de refeicao e retorna calorias/macros estimados.
    Nao grava nada no banco — o cliente confirma os valores e chama
    POST /meals para registrar de verdade.
    """
    image_bytes = await file.read()
    media_type = file.content_type or "image/jpeg"
    try:
        return analyze_meal_photo(image_bytes, media_type=media_type)
    except (anthropic.APIError, ValueError) as e:
        logger.error("Falha ao analisar foto de refeicao (user_id=%s): %s", current_user.id, e)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nao foi possivel analisar a foto, tente novamente com uma imagem mais nitida",
        )


@router.post("/", response_model=MealOut, status_code=status.HTTP_201_CREATED)
def create_meal(
    payload: MealCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    meal = Meal(user_id=current_user.id, **payload.model_dump())
    db.add(meal)
    db.commit()
    db.refresh(meal)
    return meal


@router.get("/", response_model=list[MealOut])
def list_meals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Meal)
        .filter(Meal.user_id == current_user.id)
        .order_by(Meal.logged_at.desc())
        .all()
    )


@router.get("/{meal_id}", response_model=MealOut)
def get_meal(
    meal_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        parsed_id = uuid.UUID(meal_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Refeicao nao encontrada")

    meal = (
        db.query(Meal)
        .filter(Meal.id == parsed_id, Meal.user_id == current_user.id)
        .first()
    )
    if not meal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Refeicao nao encontrada")
    return meal
