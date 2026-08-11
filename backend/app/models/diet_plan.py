import uuid
from datetime import datetime

from sqlalchemy import Column, String, Float, DateTime, ForeignKey, JSON, Text
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class DietPlan(Base):
    __tablename__ = "diet_plans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)  # aluno

    # Ao contrario de WorkoutPlan.trainer_id (nullable, treino pode ser so-IA),
    # aqui e obrigatorio — nao existe plano alimentar sem nutricionista.
    trainer_id = Column(UUID(as_uuid=True), ForeignKey("trainers.id"), nullable=False)

    status = Column(String, default="active")  # 'active' | 'archived'

    # Metas diarias — apenas informativas (v1 deliberadamente nao escreve em
    # user.daily_calorie_goal; ver app/routers/diet_plans.py).
    daily_calorie_target = Column(Float, nullable=True)
    daily_protein_target = Column(Float, nullable=True)
    daily_carbs_target = Column(Float, nullable=True)
    daily_fat_target = Column(Float, nullable=True)

    # Mesma filosofia do WorkoutPlan.plan_data: JSON livre em vez de tabelas
    # por refeicao/item — {meals: [{name, time, items: [{food, quantity,
    # calories, protein, carbs, fat}]}]}
    plan_data = Column(JSON, nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    # Ao contrario de WorkoutPlan (imutavel — nova versao = novo registro),
    # o plano alimentar e editado no lugar (revisao quinzenal etc), entao
    # precisa de updated_at pra refletir a ultima revisao.
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
