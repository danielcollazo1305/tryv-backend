import calendar
import logging
import uuid
from datetime import date, datetime, timedelta

import anthropic
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_pro_subscription
from app.models.meal import Meal
from app.models.user import User
from app.schemas.meal import (
    MealAnalysisOut,
    MealCreate,
    MealDailySummary,
    MealOut,
    MealsSummaryOut,
    MealsSummaryPeriod,
)
from app.services.meal_analysis import analyze_meal_photo

router = APIRouter(prefix="/meals", tags=["meals"])
logger = logging.getLogger(__name__)


@router.post("/analyze", response_model=MealAnalysisOut)
async def analyze(
    file: UploadFile = File(...),
    current_user: User = Depends(require_pro_subscription),
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


def _resolve_summary_window(period: MealsSummaryPeriod, offset: int) -> tuple[date, date, str]:
    """
    Retorna (start_date, end_date, granularity) da janela pedida.
    offset conta janelas inteiras pra tras (offset=1 = janela anterior),
    pra dar suporte a navegacao "<" ">" entre periodos.

    1y usa granularidade MENSAL (12 meses), nao diaria — listar/plotar 365
    linhas diarias seria impraticavel; a propria tela de referencia (Apple
    Health) tambem agrega por mes na aba de 1 ano. As demais (1d/7d/4w)
    sao granularidade diaria.
    """
    today = date.today()

    if period == "1d":
        end = today - timedelta(days=offset)
        return end, end, "day"

    if period == "7d":
        end = today - timedelta(days=offset * 7)
        return end - timedelta(days=6), end, "day"

    if period == "4w":
        end = today - timedelta(days=offset * 28)
        return end - timedelta(days=27), end, "day"

    # 1y — janela de 12 meses civis terminando no mes atual (ou 12*offset meses atras)
    end_ordinal = today.year * 12 + (today.month - 1) - offset * 12
    start_ordinal = end_ordinal - 11
    end_year, end_month = divmod(end_ordinal, 12)
    start_year, start_month = divmod(start_ordinal, 12)
    end_month += 1
    start_month += 1
    end = date(end_year, end_month, calendar.monthrange(end_year, end_month)[1])
    start = date(start_year, start_month, 1)
    return start, end, "month"


@router.get("/summary", response_model=MealsSummaryOut)
def get_meals_summary(
    period: MealsSummaryPeriod = Query("7d"),
    offset: int = Query(0, ge=0, description="Numero de janelas inteiras pra tras (navegacao < >)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Agregacao historica de refeicoes por dia (1d/7d/4w) ou mes (1y) —
    kcal e os 3 macros somados por bucket, mais as medias do periodo
    (so sobre buckets com dado real, has_data=True — dias/meses sem
    registro nao entram na media nem viram 0).
    """
    start_date, end_date, granularity = _resolve_summary_window(period, offset)
    start_datetime = datetime.combine(start_date, datetime.min.time())
    end_datetime = datetime.combine(end_date, datetime.max.time())

    daily: list[MealDailySummary] = []

    if granularity == "day":
        rows = (
            db.query(
                func.date(Meal.logged_at).label("bucket"),
                func.sum(Meal.calories).label("calories"),
                func.sum(Meal.protein).label("protein"),
                func.sum(Meal.carbs).label("carbs"),
                func.sum(Meal.fat).label("fat"),
            )
            .filter(
                Meal.user_id == current_user.id,
                Meal.logged_at >= start_datetime,
                Meal.logged_at <= end_datetime,
            )
            .group_by(func.date(Meal.logged_at))
            .all()
        )
        by_bucket = {row.bucket: row for row in rows}

        cursor = start_date
        while cursor <= end_date:
            row = by_bucket.get(cursor)
            if row:
                daily.append(
                    MealDailySummary(
                        date=cursor,
                        has_data=True,
                        calories=row.calories or 0,
                        protein=row.protein or 0,
                        carbs=row.carbs or 0,
                        fat=row.fat or 0,
                    )
                )
            else:
                daily.append(MealDailySummary(date=cursor, has_data=False))
            cursor += timedelta(days=1)
    else:
        rows = (
            db.query(
                extract("year", Meal.logged_at).label("y"),
                extract("month", Meal.logged_at).label("m"),
                func.sum(Meal.calories).label("calories"),
                func.sum(Meal.protein).label("protein"),
                func.sum(Meal.carbs).label("carbs"),
                func.sum(Meal.fat).label("fat"),
            )
            .filter(
                Meal.user_id == current_user.id,
                Meal.logged_at >= start_datetime,
                Meal.logged_at <= end_datetime,
            )
            .group_by(extract("year", Meal.logged_at), extract("month", Meal.logged_at))
            .all()
        )
        by_bucket = {(int(row.y), int(row.m)): row for row in rows}

        cursor_year, cursor_month = start_date.year, start_date.month
        while (cursor_year, cursor_month) <= (end_date.year, end_date.month):
            row = by_bucket.get((cursor_year, cursor_month))
            bucket_date = date(cursor_year, cursor_month, 1)
            if row:
                daily.append(
                    MealDailySummary(
                        date=bucket_date,
                        has_data=True,
                        calories=row.calories or 0,
                        protein=row.protein or 0,
                        carbs=row.carbs or 0,
                        fat=row.fat or 0,
                    )
                )
            else:
                daily.append(MealDailySummary(date=bucket_date, has_data=False))
            cursor_month += 1
            if cursor_month > 12:
                cursor_month = 1
                cursor_year += 1

    data_points = [d for d in daily if d.has_data]

    def _avg(attr: str) -> float | None:
        values = [getattr(d, attr) for d in data_points if getattr(d, attr) is not None]
        return round(sum(values) / len(values), 1) if values else None

    return MealsSummaryOut(
        period=period,
        granularity=granularity,
        offset=offset,
        start_date=start_date,
        end_date=end_date,
        daily=daily,
        avg_calories=_avg("calories"),
        avg_protein=_avg("protein"),
        avg_carbs=_avg("carbs"),
        avg_fat=_avg("fat"),
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
