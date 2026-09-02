"""
Ganchos de pontuacao (XP) -- Fase 2 do gamification (Squad/XP/Territorio,
ver Fase 1 em models/squad.py e models/points_event.py). So o registro do
PointsEvent; calculo de nivel/ranking/dominio de territorio fica pra fases
futuras.
"""
import logging
from datetime import date
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.points_event import PointsEvent

logger = logging.getLogger(__name__)

WORKOUT_SESSION_XP = 20
CALORIE_GOAL_XP = 15
PROTEIN_GOAL_XP = 15

# Corrida: XP variavel por esforco real (calorias queimadas, ja calculadas
# no backend por run_calculator.calculate_calories_burned) em vez de
# distancia pura -- mais justo entre corrida/caminhada/pedalada e mais
# resistente a GPS ruim do que premiar so "km rodados".
RUN_XP_MIN = 10
RUN_XP_CALORIES_DIVISOR = 10


def award_points(
    db: Session,
    user_id: UUID,
    amount: int,
    source_type: str,
    source_id: UUID | None = None,
    source_date: date | None = None,
) -> None:
    """
    Registra um PointsEvent. Chamado pelos ganchos SEMPRE depois da
    entidade de origem (treino/corrida/refeicao) ja ter sido commitada --
    pontuacao nunca deve bloquear nem reverter o registro da atividade em
    si, mesmo se a insercao do PointsEvent falhar.

    Duplicidade (mesmo user_id+source_type+source_id, ou mesmo
    user_id+source_type+source_date) e impedida pelos indices unicos
    parciais da Fase 1 (migration c74782f6d30f) -- a violacao e capturada
    aqui e tratada como noop, nao como erro.
    """
    event = PointsEvent(
        user_id=user_id,
        amount=amount,
        source_type=source_type,
        source_id=source_id,
        source_date=source_date,
    )
    db.add(event)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        logger.info(
            "PointsEvent duplicado ignorado (user_id=%s, source_type=%s, source_id=%s, source_date=%s)",
            user_id, source_type, source_id, source_date,
        )


def run_points(calories_burned: float | None) -> int | None:
    """None se calories_burned nao pode ser calculado (sem peso disponivel,
    ver calculate_calories_burned) -- gancho de runs.py deve pular o evento
    nesse caso, nao gerar XP com base em None."""
    if calories_burned is None:
        return None
    return max(RUN_XP_MIN, round(calories_burned / RUN_XP_CALORIES_DIVISOR))
