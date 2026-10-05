import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import timezone as tz
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.equipment_categories import DEFAULT_ELIGIBLE_CATEGORIES, DISCONTINUED_EQUIPMENT_CATEGORIES
from app.models.equipment import Equipment
from app.models.shoe_model import ShoeModel
from app.models.user import User
from app.schemas.equipment import EquipmentCreate, EquipmentOut, EquipmentUpdate
from app.services.equipment import is_equipment_used, list_equipment_with_stats, unset_default

router = APIRouter(prefix="/equipment", tags=["equipment"])

_DEFAULT_CONFLICT = "Nao foi possivel definir o equipamento padrao agora, tente novamente"


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _check_applicable_fields(category: str, provided: set[str], is_default: bool | None) -> None:
    """Campos que so fazem sentido pra certas categorias: de tenis so p/ tenis, de manutencao so p/ bike,
    quilometragem inicial pra tenis e bike, padrao so pra tenis e bike. Relogio/fita: so nome."""
    tenis_only = {"brand", "model", "shoe_model_id", "lifespan_km"} & provided
    if tenis_only and category != "tenis":
        raise _bad_request(f"Campos de tenis ({', '.join(sorted(tenis_only))}) so valem para a categoria tenis")
    if "maintenance_interval_km" in provided and category != "bike":
        raise _bad_request("maintenance_interval_km so vale para a categoria bike")
    if "initial_distance_km" in provided and category not in DEFAULT_ELIGIBLE_CATEGORIES:
        raise _bad_request("initial_distance_km so vale para tenis e bike")
    if is_default and category not in DEFAULT_ELIGIBLE_CATEGORIES:
        raise _bad_request("Somente tenis e bike podem ser o equipamento padrao")


@router.post("/", response_model=EquipmentOut, status_code=status.HTTP_201_CREATED)
def create_equipment(
    payload: EquipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.category in DISCONTINUED_EQUIPMENT_CATEGORIES:
        raise _bad_request("categoria descontinuada")

    # So conta como "fornecido" o campo enviado com valor (um cliente pode mandar null nos opcionais).
    provided = {f for f in payload.model_fields_set - {"category", "name", "is_default"} if getattr(payload, f) is not None}
    _check_applicable_fields(payload.category, provided, payload.is_default)

    brand, model = payload.brand, payload.model
    lifespan_km = maintenance_interval_km = None
    shoe_model_id = None

    if payload.category == "tenis":
        shoe = None
        if payload.shoe_model_id is not None:
            shoe = db.query(ShoeModel).filter(ShoeModel.id == payload.shoe_model_id, ShoeModel.active.is_(True)).first()
            if shoe is None:
                raise _bad_request("Modelo de tenis nao encontrado no catalogo")
            shoe_model_id = shoe.id
            brand = brand or shoe.brand
            model = model or shoe.model
        lifespan_km = payload.lifespan_km or (shoe.default_lifespan_km if shoe else settings.default_shoe_lifespan_km)
    elif payload.category == "bike":
        maintenance_interval_km = payload.maintenance_interval_km or settings.default_bike_maintenance_km

    is_default = False
    if payload.category in DEFAULT_ELIGIBLE_CATEGORIES:
        has_active = (
            db.query(Equipment.id)
            .filter(
                Equipment.user_id == current_user.id,
                Equipment.category == payload.category,
                Equipment.retired_at.is_(None),
            )
            .first()
            is not None
        )
        # O primeiro (ativo) da categoria vira padrao sozinho; os demais so se pedirem.
        is_default = payload.is_default or not has_active

    item = Equipment(
        user_id=current_user.id,
        category=payload.category,
        name=payload.name,
        brand=brand,
        model=model,
        shoe_model_id=shoe_model_id,
        initial_distance_km=payload.initial_distance_km or 0.0,
        lifespan_km=lifespan_km,
        maintenance_interval_km=maintenance_interval_km,
        is_default=is_default,
    )
    try:
        if is_default:
            unset_default(db, current_user.id, payload.category)
        db.add(item)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_DEFAULT_CONFLICT)
    return list_equipment_with_stats(db, current_user.id, include_retired=True, equipment_id=item.id)[0]


@router.get("/", response_model=list[EquipmentOut])
def list_equipment(
    include_retired: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Itens do usuario (so as 4 categorias ativas; luva_faixa/suplemento antigos ficam fora), mais recentes
    primeiro, com os campos calculados de uso (ver services/equipment.py). Aposentados so com
    include_retired=true. O agrupamento por categoria fica a criterio do cliente.
    """
    return list_equipment_with_stats(db, current_user.id, include_retired=include_retired)


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


def _get_active_category_item_or_404(db: Session, current_user: User, equipment_id: str) -> Equipment:
    """Item de uma categoria ATIVA; os legados (luva_faixa/suplemento) nao sao editaveis."""
    item = _get_equipment_or_404(db, current_user, equipment_id)
    if item.category in DISCONTINUED_EQUIPMENT_CATEGORIES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipamento nao encontrado")
    return item


@router.patch("/{equipment_id}", response_model=EquipmentOut)
def update_equipment(
    equipment_id: str,
    payload: EquipmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_active_category_item_or_404(db, current_user, equipment_id)
    provided = payload.model_fields_set

    for numeric in ("lifespan_km", "maintenance_interval_km", "initial_distance_km", "retired", "is_default", "name"):
        if numeric in provided and getattr(payload, numeric) is None:
            raise _bad_request(f"{numeric} nao pode ser nulo")
    _check_applicable_fields(item.category, provided & {"brand", "model", "lifespan_km", "maintenance_interval_km", "initial_distance_km"}, payload.is_default)
    if payload.retired is True and payload.is_default is True:
        raise _bad_request("Um equipamento aposentado nao pode ser o padrao")

    if "name" in provided:
        item.name = payload.name
    if "brand" in provided:
        item.brand = payload.brand
    if "model" in provided:
        item.model = payload.model
    if "lifespan_km" in provided:
        item.lifespan_km = payload.lifespan_km
    if "maintenance_interval_km" in provided:
        item.maintenance_interval_km = payload.maintenance_interval_km
    if "initial_distance_km" in provided:
        item.initial_distance_km = payload.initial_distance_km

    try:
        if payload.retired is True:
            # Aposentar: esconde das listas padrao, mantem o historico e deixa de ser padrao.
            if item.retired_at is None:
                item.retired_at = tz.utc_now()
            item.is_default = False
        elif payload.retired is False:
            item.retired_at = None
            item.is_default = False  # reativado volta como comum; so vira padrao se pedir abaixo

        if payload.is_default is True:
            if item.retired_at is not None:
                raise _bad_request("Um equipamento aposentado nao pode ser o padrao")
            unset_default(db, current_user.id, item.category, except_id=item.id)
            item.is_default = True
        elif payload.is_default is False:
            item.is_default = False
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_DEFAULT_CONFLICT)
    return list_equipment_with_stats(db, current_user.id, include_retired=True, equipment_id=item.id)[0]


@router.post("/{equipment_id}/maintenance", response_model=EquipmentOut)
def mark_maintenance_done(
    equipment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Botao "revisao feita" da bike: zera a contagem (last_maintenance_at = agora, UTC)."""
    item = _get_active_category_item_or_404(db, current_user, equipment_id)
    if item.category != "bike":
        raise _bad_request("Revisao so existe para a categoria bike")
    if item.retired_at is not None:
        raise _bad_request("Equipamento aposentado")
    item.last_maintenance_at = tz.utc_now()
    db.commit()
    return list_equipment_with_stats(db, current_user.id, include_retired=True, equipment_id=item.id)[0]


@router.delete("/{equipment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_equipment(
    equipment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """So apaga item NUNCA usado; item com historico deve ser aposentado (PATCH retired=true)."""
    item = _get_equipment_or_404(db, current_user, equipment_id)
    if is_equipment_used(db, item.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Equipamento ja usado: aposente em vez de apagar",
        )
    db.delete(item)
    db.commit()
