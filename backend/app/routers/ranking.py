from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.points_event import PointsEvent
from app.models.squad import Squad, SquadMembership
from app.models.user import User
from app.schemas.squad import IndividualRankingEntryOut, SquadRankingEntryOut, TerritoryCityOut

router = APIRouter(tags=["ranking"])


def _week_start() -> datetime:
    """Segunda 00h da semana atual -- mesmo criterio de getWeekPeriodInfo em app/(tabs)/ranking.tsx (mobile)."""
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    return datetime.combine(monday, time.min)


@router.get("/ranking/individual", response_model=list[IndividualRankingEntryOut])
def ranking_individual(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    week_start = _week_start()

    total_xp_subq = (
        db.query(PointsEvent.user_id, func.sum(PointsEvent.amount).label("total_xp"))
        .group_by(PointsEvent.user_id)
        .subquery()
    )
    weekly_xp_subq = (
        db.query(PointsEvent.user_id, func.sum(PointsEvent.amount).label("weekly_xp"))
        .filter(PointsEvent.created_at >= week_start)
        .group_by(PointsEvent.user_id)
        .subquery()
    )

    rows = (
        db.query(
            User.id,
            User.name,
            total_xp_subq.c.total_xp,
            weekly_xp_subq.c.weekly_xp,
            Squad.name.label("squad_name"),
        )
        .join(total_xp_subq, total_xp_subq.c.user_id == User.id)
        .outerjoin(weekly_xp_subq, weekly_xp_subq.c.user_id == User.id)
        .outerjoin(SquadMembership, SquadMembership.user_id == User.id)
        .outerjoin(Squad, Squad.id == SquadMembership.squad_id)
        .order_by(total_xp_subq.c.total_xp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [
        IndividualRankingEntryOut(
            position=offset + index + 1,
            user_id=row.id,
            name=row.name,
            squad_name=row.squad_name,
            total_xp=int(row.total_xp or 0),
            weekly_xp=int(row.weekly_xp or 0),
        )
        for index, row in enumerate(rows)
    ]


@router.get("/ranking/squads", response_model=list[SquadRankingEntryOut])
def ranking_squads(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    week_start = _week_start()

    member_count_subq = (
        db.query(SquadMembership.squad_id, func.count(SquadMembership.id).label("member_count"))
        .group_by(SquadMembership.squad_id)
        .subquery()
    )
    total_xp_subq = (
        db.query(SquadMembership.squad_id, func.sum(PointsEvent.amount).label("total_xp"))
        .join(PointsEvent, PointsEvent.user_id == SquadMembership.user_id)
        .group_by(SquadMembership.squad_id)
        .subquery()
    )
    weekly_xp_subq = (
        db.query(SquadMembership.squad_id, func.sum(PointsEvent.amount).label("weekly_xp"))
        .join(PointsEvent, PointsEvent.user_id == SquadMembership.user_id)
        .filter(PointsEvent.created_at >= week_start)
        .group_by(SquadMembership.squad_id)
        .subquery()
    )

    rows = (
        db.query(
            Squad.id,
            Squad.name,
            member_count_subq.c.member_count,
            total_xp_subq.c.total_xp,
            weekly_xp_subq.c.weekly_xp,
        )
        .join(total_xp_subq, total_xp_subq.c.squad_id == Squad.id)
        .outerjoin(member_count_subq, member_count_subq.c.squad_id == Squad.id)
        .outerjoin(weekly_xp_subq, weekly_xp_subq.c.squad_id == Squad.id)
        .order_by(total_xp_subq.c.total_xp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [
        SquadRankingEntryOut(
            position=offset + index + 1,
            squad_id=row.id,
            name=row.name,
            member_count=int(row.member_count or 0),
            total_xp=int(row.total_xp or 0),
            weekly_xp=int(row.weekly_xp or 0),
        )
        for index, row in enumerate(rows)
    ]


@router.get("/territory", response_model=list[TerritoryCityOut])
def territory(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Por cidade (users.city, texto livre -- ver risco de fragmentacao ja
    documentado na Fase 1), qual squad tem a maior % do total de pontos
    gerado por TODOS os usuarios daquela cidade (squad ou Solo -- Solo
    conta pro denominador mas nunca pro numerador de squad nenhum, mesma
    definicao aprovada na Fase 1). Cidade sem nenhum membro de squad
    retorna dominant_squad=None (so usuarios Solo la).
    """
    city_totals = dict(
        db.query(User.city, func.sum(PointsEvent.amount).label("total_points"))
        .join(PointsEvent, PointsEvent.user_id == User.id)
        .filter(User.city.isnot(None))
        .group_by(User.city)
        .all()
    )

    squad_points_by_city = (
        db.query(
            User.city,
            Squad.id.label("squad_id"),
            Squad.name.label("squad_name"),
            func.sum(PointsEvent.amount).label("squad_points"),
        )
        .join(PointsEvent, PointsEvent.user_id == User.id)
        .join(SquadMembership, SquadMembership.user_id == User.id)
        .join(Squad, Squad.id == SquadMembership.squad_id)
        .filter(User.city.isnot(None))
        .group_by(User.city, Squad.id, Squad.name)
        .all()
    )

    best_by_city: dict[str, tuple] = {}
    for row in squad_points_by_city:
        current_best = best_by_city.get(row.city)
        if current_best is None or row.squad_points > current_best[2]:
            best_by_city[row.city] = (row.squad_id, row.squad_name, row.squad_points)

    results = []
    for city, total_points in city_totals.items():
        total_points = int(total_points or 0)
        best = best_by_city.get(city)
        if best is None or total_points <= 0:
            results.append(TerritoryCityOut(city=city, total_points=total_points))
            continue

        squad_id, squad_name, squad_points = best
        percent = round((squad_points / total_points) * 100, 1)
        results.append(
            TerritoryCityOut(
                city=city,
                total_points=total_points,
                dominant_squad_id=squad_id,
                dominant_squad_name=squad_name,
                dominant_squad_percent=percent,
            )
        )

    results.sort(key=lambda r: r.total_points, reverse=True)
    return results
