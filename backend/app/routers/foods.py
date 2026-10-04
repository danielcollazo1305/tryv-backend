from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.search_text import normalize_search_text
from app.models.food import Food
from app.models.meal import Meal
from app.models.user import User
from app.routers.meals import _award_daily_goal_points
from app.schemas.food import FoodLogIn, FoodOut
from app.schemas.meal import MealOut

# Sem require_pro_subscription de proposito: buscar alimento e registrar a
# refeicao faz parte do registro manual, que e gratuito.
router = APIRouter(prefix="/foods", tags=["foods"])


def _escape_like(token: str) -> str:
    """Escapa %, _ e a propria barra pra o token valer como texto literal no LIKE
    (apos normalize_search_text eles nem aparecem, mas nao dependemos disso)."""
    return token.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/search", response_model=list[FoodOut])
def search_foods(
    q: str = Query(..., min_length=2),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Busca na TACO. A consulta e normalizada (minuscula, sem acento, pontuacao
    vira espaco) e quebrada em tokens; TODOS precisam aparecer como substring
    de search_name, em qualquer ordem ("cozido arroz" acha "Arroz, integral,
    cozido"). Ranking: nome que COMECA com o primeiro token, depois nome mais
    curto, depois alfabetico.
    """
    tokens = normalize_search_text(q).split()
    if not tokens:
        return []

    query = db.query(Food)
    for token in tokens:
        query = query.filter(Food.search_name.ilike(f"%{_escape_like(token)}%", escape="\\"))

    starts_with_first = case(
        (Food.search_name.ilike(f"{_escape_like(tokens[0])}%", escape="\\"), 0),
        else_=1,
    )
    return query.order_by(starts_with_first, func.length(Food.name), Food.name).limit(limit).all()


def _scaled(value_per_100g: float | None, grams: float) -> float:
    """Macro nulo conta como 0 (so o kcal nulo e barrado antes, no handler)."""
    return round((value_per_100g or 0) * grams / 100, 1)


@router.post("/{food_id}/log", response_model=MealOut, status_code=status.HTTP_201_CREATED)
def log_food(
    food_id: int,
    payload: FoodLogIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Registra `grams` gramas do alimento como refeicao de hoje (valores da TACO
    por 100 g, proporcionais). Mesmo fluxo de POST /saved-meals/{id}/log: cria a
    Meal, da commit e roda _award_daily_goal_points (meals.py) pra meta/XP do dia.
    """
    food = db.query(Food).filter(Food.id == food_id).first()
    if not food:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alimento nao encontrado")
    if food.kcal is None:
        # Nao grava 0 kcal onde a TACO nao tem dado -- seria um numero falso.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Dados de calorias indisponiveis para este alimento",
        )

    meal = Meal(
        user_id=current_user.id,
        description=f"{food.name} ({payload.grams:g}g)",
        calories=_scaled(food.kcal, payload.grams),
        protein=_scaled(food.protein, payload.grams),
        carbs=_scaled(food.carbohydrates, payload.grams),
        fat=_scaled(food.lipids, payload.grams),
    )
    db.add(meal)
    db.commit()
    db.refresh(meal)

    _award_daily_goal_points(db, current_user, meal.logged_at)

    return meal
