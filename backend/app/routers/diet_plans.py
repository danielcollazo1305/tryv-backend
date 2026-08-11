import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.diet_plan import DietPlan
from app.models.subscription import Subscription
from app.models.trainer import Trainer
from app.models.user import User
from app.schemas.diet_plan import DietPlanCreate, DietPlanOut, DietPlanUpdate

router = APIRouter(prefix="/diet-plans", tags=["diet-plans"])


def _get_verified_nutritionist(db: Session, current_user: User) -> Trainer:
    trainer = db.query(Trainer).filter(Trainer.user_id == current_user.id).first()
    if not trainer or not trainer.cref_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas profissionais verificados podem criar planos alimentares",
        )
    # Mesma logica de _get_verified_trainer em challenges.py: plano
    # alimentar e a entrega principal do nutricionista, nao do personal
    # trainer — decisao deliberada da v1, nao limitacao tecnica.
    if trainer.professional_type != "nutritionist":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Planos alimentares sao exclusivos de nutricionistas nesta versao",
        )
    return trainer


def _require_active_subscription(db: Session, trainer_id: uuid.UUID, student_user_id: uuid.UUID) -> None:
    has_active = (
        db.query(Subscription)
        .filter(
            Subscription.user_id == student_user_id,
            Subscription.trainer_id == trainer_id,
            Subscription.type == "trainer_addon",
            Subscription.status == "active",
        )
        .first()
        is not None
    )
    if not has_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Este aluno nao tem assinatura ativa com voce",
        )


def _parse_uuid_or_404(value: str, not_found_detail: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=not_found_detail)


@router.post("/", response_model=DietPlanOut, status_code=status.HTTP_201_CREATED)
def create_diet_plan(
    payload: DietPlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trainer = _get_verified_nutritionist(db, current_user)
    _require_active_subscription(db, trainer.id, payload.user_id)

    plan = DietPlan(
        user_id=payload.user_id,
        trainer_id=trainer.id,
        plan_data=payload.plan_data.model_dump(),
        daily_calorie_target=payload.daily_calorie_target,
        daily_protein_target=payload.daily_protein_target,
        daily_carbs_target=payload.daily_carbs_target,
        daily_fat_target=payload.daily_fat_target,
        notes=payload.notes,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.get("/me", response_model=list[DietPlanOut])
def list_my_diet_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Planos ativos do aluno logado."""
    return (
        db.query(DietPlan)
        .filter(DietPlan.user_id == current_user.id, DietPlan.status == "active")
        .order_by(DietPlan.updated_at.desc())
        .all()
    )


@router.get("/students/{student_id}", response_model=list[DietPlanOut])
def list_student_diet_plans(
    student_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Todos os planos (ativos e arquivados) que o nutricionista logado criou para esse aluno."""
    trainer = _get_verified_nutritionist(db, current_user)
    parsed_student_id = _parse_uuid_or_404(student_id, "Aluno nao encontrado")

    return (
        db.query(DietPlan)
        .filter(DietPlan.trainer_id == trainer.id, DietPlan.user_id == parsed_student_id)
        .order_by(DietPlan.created_at.desc())
        .all()
    )


@router.patch("/{plan_id}", response_model=DietPlanOut)
def update_diet_plan(
    plan_id: str,
    payload: DietPlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trainer = _get_verified_nutritionist(db, current_user)
    parsed_plan_id = _parse_uuid_or_404(plan_id, "Plano nao encontrado")

    plan = (
        db.query(DietPlan)
        .filter(DietPlan.id == parsed_plan_id, DietPlan.trainer_id == trainer.id)
        .first()
    )
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plano nao encontrado")

    updates = payload.model_dump(exclude_unset=True)
    if "plan_data" in updates:
        plan.plan_data = updates.pop("plan_data")
    for field, value in updates.items():
        setattr(plan, field, value)

    db.commit()
    db.refresh(plan)
    return plan
