import logging
import uuid

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.equipment_categories import EQUIPMENT_CATEGORIES, RUN_ACTIVITY_EQUIPMENT_CATEGORY
from app.models.equipment import Equipment
from app.models.manual_activity import ManualActivity
from app.models.run import Run
from app.models.workout import WorkoutSession
from app.schemas.equipment import EquipmentOut

logger = logging.getLogger(__name__)


def _log_ignored(user_id: uuid.UUID, activity: str, equipment_id: uuid.UUID | None, reason: str) -> None:
    logger.info(
        "equipment_ignored user_id=%s activity=%s equipment_id=%s reason=%s", user_id, activity, equipment_id, reason
    )


def resolve_run_equipment(
    db: Session,
    user_id: uuid.UUID,
    activity_type: str,
    equipment_id_provided: bool,
    equipment_id: uuid.UUID | None,
) -> uuid.UUID | None:
    """
    Equipamento FINAL de uma Run nova (nunca levanta erro -- politica de compatibilidade com app antigo).

    - run/walk aceitam so `tenis`; bike aceita so `bike`; os demais tipos de Run nao aceitam equipamento.
    - `equipment_id` ENVIADO (provided=True):
        * null explicito = o usuario escolheu "Nenhum": nao aplica o padrao;
        * id valido pra esse tipo (do usuario, nao aposentado, categoria certa): usa;
        * qualquer outro caso (id inexistente/apagado/de outro usuario, aposentado, categoria errada,
          ex: tenis numa pedalada, faixa_cardiaca numa corrida): IGNORADO -> None, com log INFO.
    - `equipment_id` AUSENTE do payload: aplica o equipamento PADRAO ativo da categoria do tipo (tenis
      padrao pra run/walk, bike padrao pra bike); sem padrao, None. Vale tambem pra corridas importadas
      do hub de saude (o app so manda equipment_id quando o usuario escolhe).
    """
    category = RUN_ACTIVITY_EQUIPMENT_CATEGORY.get(activity_type)

    if equipment_id_provided:
        if equipment_id is None:
            return None
        item = db.query(Equipment).filter(Equipment.id == equipment_id, Equipment.user_id == user_id).first()
        if item is None:
            _log_ignored(user_id, f"run:{activity_type}", equipment_id, "not_found")
            return None
        if item.retired_at is not None:
            _log_ignored(user_id, f"run:{activity_type}", equipment_id, "retired")
            return None
        if category is None or item.category != category:
            _log_ignored(user_id, f"run:{activity_type}", equipment_id, f"category_{item.category}_not_allowed")
            return None
        return item.id

    if category is None:
        return None
    default = (
        db.query(Equipment.id)
        .filter(
            Equipment.user_id == user_id,
            Equipment.category == category,
            Equipment.is_default.is_(True),
            Equipment.retired_at.is_(None),
        )
        .first()
    )
    return default[0] if default else None


def ignore_equipment_for_activity(user_id: uuid.UUID, activity: str, equipment_id: uuid.UUID | None) -> None:
    """ManualActivity e WorkoutSession NAO aceitam mais equipamento: qualquer equipment_id (app antigo) e
    ignorado -- a atividade salva normalmente, sem vinculo e sem bonus."""
    if equipment_id is not None:
        _log_ignored(user_id, activity, equipment_id, "activity_does_not_accept_equipment")


def unset_default(db: Session, user_id: uuid.UUID, category: str, except_id: uuid.UUID | None = None) -> None:
    """Desmarca o padrao ATIVO anterior da categoria (mesma transacao de quem vai marcar o novo; o indice
    unico parcial uq_equipment_user_category_default garante o resto)."""
    query = db.query(Equipment).filter(
        Equipment.user_id == user_id,
        Equipment.category == category,
        Equipment.is_default.is_(True),
        Equipment.retired_at.is_(None),
    )
    if except_id is not None:
        query = query.filter(Equipment.id != except_id)
    query.update({"is_default": False}, synchronize_session=False)
    db.flush()


def is_equipment_used(db: Session, equipment_id: uuid.UUID) -> bool:
    """Alguma Run vinculada, ou vinculo legado em atividade manual / treino."""
    return any(
        db.query(model.id).filter(model.equipment_id == equipment_id).first() is not None
        for model in (Run, ManualActivity, WorkoutSession)
    )


def _round(value: float | None, digits: int) -> float | None:
    return None if value is None else round(value, digits)


def list_equipment_with_stats(
    db: Session,
    user_id: uuid.UUID,
    include_retired: bool = False,
    equipment_id: uuid.UUID | None = None,
) -> list[EquipmentOut]:
    """
    Itens do usuario (so categorias ATIVAS -- luva_faixa/suplemento antigos ficam de fora) com os campos
    calculados, em UMA consulta: Equipment LEFT JOIN runs GROUP BY equipment.id (usa o indice parcial
    ix_runs_equipment_id), sem N+1.

    - total_distance_km (tenis/bike) = initial_distance_km + soma de Run.distance_meters/1000 vinculadas;
    - uses_count / last_used_at (UTC) = quantidade e maior started_at das corridas vinculadas;
    - wear_percent (tenis) = total / vida util * 100, SEM clamp (vida util NULL -> padrao das settings);
    - bike: km_since_maintenance = initial + todas as pedaladas se NUNCA houve revisao, senao a soma das
      pedaladas com started_at >= last_maintenance_at; maintenance_percent = isso / intervalo * 100.
    """
    total_m = func.coalesce(func.sum(Run.distance_meters), 0.0)
    since_m = func.coalesce(
        func.sum(case((Run.started_at >= Equipment.last_maintenance_at, Run.distance_meters), else_=0.0)), 0.0
    )
    query = (
        db.query(Equipment, total_m, func.count(Run.id), func.max(Run.started_at), since_m)
        .outerjoin(Run, Run.equipment_id == Equipment.id)
        .filter(Equipment.user_id == user_id, Equipment.category.in_(EQUIPMENT_CATEGORIES))
        .group_by(Equipment.id)
        .order_by(Equipment.created_at.desc())
    )
    if equipment_id is not None:
        query = query.filter(Equipment.id == equipment_id)
    if not include_retired:
        query = query.filter(Equipment.retired_at.is_(None))

    result: list[EquipmentOut] = []
    for item, runs_total_m, uses_count, last_used_at, runs_since_m in query.all():
        out = EquipmentOut.model_validate(item)
        out.uses_count = int(uses_count or 0)
        out.last_used_at = last_used_at
        initial = item.initial_distance_km or 0.0
        if item.category == "tenis":
            total_km = initial + (runs_total_m or 0.0) / 1000
            lifespan = item.lifespan_km or settings.default_shoe_lifespan_km
            out.lifespan_km = lifespan
            out.total_distance_km = _round(total_km, 2)
            out.wear_percent = _round(total_km / lifespan * 100, 1)
        elif item.category == "bike":
            total_km = initial + (runs_total_m or 0.0) / 1000
            if item.last_maintenance_at is None:
                since_km = total_km
            else:
                since_km = (runs_since_m or 0.0) / 1000
            interval = item.maintenance_interval_km or settings.default_bike_maintenance_km
            out.maintenance_interval_km = interval
            out.total_distance_km = _round(total_km, 2)
            out.km_since_maintenance = _round(since_km, 2)
            out.maintenance_percent = _round(since_km / interval * 100, 1)
        result.append(out)
    return result
