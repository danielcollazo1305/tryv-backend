import base64
import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, and_, cast, func, literal, null, or_, select, union_all
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.manual_activity import ManualActivity
from app.models.run import Run
from app.models.user import User
from app.models.workout import WorkoutSession
from app.schemas.activity_history import ActivityHistoryItem, ActivityHistoryPage

router = APIRouter(prefix="/users", tags=["activity-history"])

HISTORY_DEFAULT_LIMIT = 20
HISTORY_MAX_LIMIT = 50

ACTIVITY_TITLES = {
    "run": "Corrida",
    "bike": "Pedalada",
    "swim": "Natação",
    "fight": "Luta",
    "walk": "Caminhada",
    "hiit": "HIIT",
    "other": "Outra atividade",
    "workout": "Treino",
}
HistoryType = Literal["run", "bike", "swim", "fight", "walk", "hiit", "other", "workout"]


def _encode_cursor(occurred_at: datetime, kind: str, item_id: str) -> str:
    raw = f"{occurred_at.isoformat()}|{kind}|{item_id}"
    return base64.urlsafe_b64encode(raw.encode("ascii")).decode("ascii").rstrip("=")


def _decode_cursor(cursor: str) -> tuple[datetime, str, str]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        stamp, kind, item_id = base64.urlsafe_b64decode(padded.encode("ascii")).decode("ascii").split("|")
        uuid.UUID(item_id)
        if kind not in ("run", "workout", "manual"):
            raise ValueError(kind)
        return datetime.fromisoformat(stamp), kind, item_id
    except (ValueError, UnicodeError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Cursor invalido")


@router.get("/me/activities", response_model=ActivityHistoryPage)
def my_activity_history(
    cursor: str | None = Query(None, max_length=200),
    limit: int = Query(HISTORY_DEFAULT_LIMIT, ge=1, le=HISTORY_MAX_LIMIT),
    type: HistoryType | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Historico do PROPRIO usuario: corridas/pedaladas/caminhadas (Run), treinos (WorkoutSession) e atividades manuais
    (ManualActivity) numa lista so, mais recentes primeiro, por cursor. Lista LEVE: nunca devolve a rota (coordenadas) nem notas.
    Ordem total e estavel: (data DESC, tipo DESC, id DESC), entao dois itens no mesmo instante nao se repetem nem se perdem
    entre paginas. Filtro opcional `type` (modalidade, ou 'workout' para treinos)."""
    uid = current_user.id
    runs = select(
        literal("run").label("kind"),
        cast(Run.id, String).label("item_id"),
        Run.activity_type.label("activity_type"),
        null().label("fight_style"),
        Run.started_at.label("occurred_at"),
        Run.duration_seconds.label("duration_seconds"),
        Run.distance_meters.label("distance_meters"),
        Run.calories_burned.label("calories_burned"),
    ).where(Run.user_id == uid, Run.started_at.is_not(None))
    workouts = select(
        literal("workout").label("kind"),
        cast(WorkoutSession.id, String).label("item_id"),
        literal("workout").label("activity_type"),
        null().label("fight_style"),
        WorkoutSession.completed_at.label("occurred_at"),
        (WorkoutSession.duration_minutes * 60).label("duration_seconds"),
        null().label("distance_meters"),
        WorkoutSession.calories_burned.label("calories_burned"),
    ).where(WorkoutSession.user_id == uid, WorkoutSession.completed_at.is_not(None))
    manuals = select(
        literal("manual").label("kind"),
        cast(ManualActivity.id, String).label("item_id"),
        ManualActivity.activity_type.label("activity_type"),
        ManualActivity.fight_style.label("fight_style"),
        ManualActivity.performed_at.label("occurred_at"),
        (ManualActivity.duration_minutes * 60).label("duration_seconds"),
        null().label("distance_meters"),
        ManualActivity.calories_burned.label("calories_burned"),
    ).where(ManualActivity.user_id == uid, ManualActivity.performed_at.is_not(None))

    u = union_all(runs, workouts, manuals).subquery("history")
    kind_c = u.c.kind.collate("C")
    id_c = u.c.item_id.collate("C")
    query = select(u)
    if type is not None:
        query = query.where(u.c.activity_type == type)
    if cursor:
        c_at, c_kind, c_id = _decode_cursor(cursor)
        query = query.where(
            or_(
                u.c.occurred_at < c_at,
                and_(
                    u.c.occurred_at == c_at,
                    or_(kind_c < c_kind, and_(kind_c == c_kind, id_c < c_id)),
                ),
            )
        )
    rows = db.execute(query.order_by(u.c.occurred_at.desc(), kind_c.desc(), id_c.desc()).limit(limit + 1)).all()

    has_more = len(rows) > limit
    rows = rows[:limit]
    items = [
        ActivityHistoryItem(
            id=uuid.UUID(r.item_id),
            kind=r.kind,
            activity_type=r.activity_type,
            title=ACTIVITY_TITLES.get(r.activity_type, "Atividade"),
            fight_style=r.fight_style,
            occurred_at=r.occurred_at,
            duration_seconds=int(r.duration_seconds) if r.duration_seconds is not None else None,
            distance_meters=r.distance_meters,
            calories_burned=r.calories_burned,
        )
        for r in rows
    ]
    next_cursor = _encode_cursor(rows[-1].occurred_at, rows[-1].kind, rows[-1].item_id) if has_more and rows else None
    return ActivityHistoryPage(items=items, next_cursor=next_cursor)
