import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.meal import Meal
from app.models.saved_meal import SavedMeal
from app.models.user import User
from app.routers.meals import _award_daily_goal_points
from app.schemas.meal import MealOut
from app.schemas.saved_meal import SavedMealCreate, SavedMealOut

router = APIRouter(prefix="/saved-meals", tags=["saved-meals"])


def _get_own_saved_meal(db: Session, saved_meal_id: uuid.UUID, user: User) -> SavedMeal:
    """404 tanto pra favorito inexistente quanto pra favorito de outro usuario,
    sem distinguir os dois casos (mesmo padrao dos outros recursos do usuario)."""
    saved_meal = (
        db.query(SavedMeal).filter(SavedMeal.id == saved_meal_id, SavedMeal.user_id == user.id).first()
    )
    if not saved_meal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Refeicao salva nao encontrada")
    return saved_meal


@router.post("/", response_model=SavedMealOut, status_code=status.HTTP_201_CREATED)
def create_saved_meal(
    payload: SavedMealCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    saved_meal = SavedMeal(user_id=current_user.id, **payload.model_dump())
    db.add(saved_meal)
    db.commit()
    db.refresh(saved_meal)
    return saved_meal


@router.get("/", response_model=list[SavedMealOut])
def list_saved_meals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(SavedMeal)
        .filter(SavedMeal.user_id == current_user.id)
        .order_by(SavedMeal.created_at.desc())
        .all()
    )


@router.delete("/{saved_meal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_meal(
    saved_meal_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    saved_meal = _get_own_saved_meal(db, saved_meal_id, current_user)
    db.delete(saved_meal)
    db.commit()


@router.post("/{saved_meal_id}/log", response_model=MealOut, status_code=status.HTTP_201_CREATED)
def log_saved_meal(
    saved_meal_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Usa o favorito: cria uma Meal de verdade (logged_at = agora) com os mesmos
    campos dele. Mesmo fluxo de POST /meals/ -- depois do commit da Meal,
    chama _award_daily_goal_points (meals.py), a MESMA funcao que o create de
    refeicao usa pra checar meta de calorias/proteina do dia e gerar XP, sem
    duplicar essa logica aqui.
    """
    saved_meal = _get_own_saved_meal(db, saved_meal_id, current_user)

    meal = Meal(
        user_id=current_user.id,
        photo_url=saved_meal.photo_url,
        description=saved_meal.description,
        calories=saved_meal.calories,
        protein=saved_meal.protein,
        carbs=saved_meal.carbs,
        fat=saved_meal.fat,
    )
    db.add(meal)
    db.commit()
    db.refresh(meal)

    _award_daily_goal_points(db, current_user, meal.logged_at)

    return meal
