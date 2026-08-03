from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_pro_subscription
from app.models.heart_rate import HeartRateSample
from app.models.manual_activity import ManualActivity
from app.models.readiness_score import ReadinessScore
from app.models.run import Run
from app.models.user import User
from app.schemas.readiness import ReadinessOut

router = APIRouter(prefix="/readiness", tags=["readiness"])

# Pesos-base de cada pilar quando os 3 estao disponiveis. Quando um pilar
# fica de fora (sem dado suficiente), seu peso e redistribuido
# proporcionalmente entre os que sobraram (ver _combine_scores).
SLEEP_WEIGHT = 0.4
LOAD_WEIGHT = 0.4
HR_WEIGHT = 0.2

SEVEN_DAYS = 7
HR_BASELINE_WINDOW_DAYS = 30
HR_RECENT_WINDOW_DAYS = 2
HR_MIN_DAYS_WITH_DATA = 5


def _sleep_score(hours: float) -> float:
    """7-9h = otimo (100); abaixo disso cai progressivamente (ruim <5h);
    acima de 9h tem uma penalidade leve (excesso tambem e sinal de
    recuperacao/rotina fora do padrao, nao so falta de sono)."""
    if hours <= 0:
        return 0.0
    if hours < 5:
        return round((hours / 5) * 40, 1)
    if hours < 7:
        return round(40 + (hours - 5) / 2 * 45, 1)
    if hours <= 9:
        return 100.0
    return round(max(70.0, 100 - (hours - 9) * 10), 1)


def _load_score(db: Session, user_id, today: date) -> float:
    """Baseado no volume total treinado (Run + ManualActivity) nos ultimos
    7 dias: pouco volume recente = bem descansado (score alto); muito
    volume = fadiga acumulada (score baixo). Sem nenhum treino nos ultimos
    7 dias, entende-se como "sem fadiga acumulada" (score maximo) — o que
    faz sentido pra esse pilar especifico, mesmo que nao reflita
    condicionamento fisico geral."""
    start = datetime.combine(today - timedelta(days=SEVEN_DAYS - 1), datetime.min.time())
    end = datetime.combine(today, datetime.max.time())

    run_seconds = (
        db.query(func.sum(Run.duration_seconds))
        .filter(Run.user_id == user_id, Run.started_at >= start, Run.started_at <= end)
        .scalar()
        or 0
    )
    manual_minutes = (
        db.query(func.sum(ManualActivity.duration_minutes))
        .filter(
            ManualActivity.user_id == user_id,
            ManualActivity.performed_at >= start,
            ManualActivity.performed_at <= end,
        )
        .scalar()
        or 0
    )
    total_minutes = (run_seconds / 60) + manual_minutes
    if total_minutes <= 0:
        return 100.0
    score = 100 - (total_minutes / 600) * 80
    return round(max(20.0, min(100.0, score)), 1)


def _hr_score(db: Session, user_id, today: date) -> float | None:
    """Aproxima FC de repouso pelo minimo diario de HeartRateSample (o dado
    bruto nao distingue "em repouso" de "em atividade"), e compara a media
    dos ultimos 2 dias com a media historica dos ultimos 30 — FC de
    repouso mais alta que o normal costuma indicar fadiga/estresse ainda
    nao recuperado. Exige pelo menos alguns dias com dado pra nao tirar
    conclusao de uma amostra minuscula; sem isso, retorna None (o peso e
    redistribuido entre sono e carga)."""
    baseline_start = datetime.combine(today - timedelta(days=HR_BASELINE_WINDOW_DAYS), datetime.min.time())
    daily_min = dict(
        db.query(func.date(HeartRateSample.recorded_at), func.min(HeartRateSample.bpm))
        .filter(HeartRateSample.user_id == user_id, HeartRateSample.recorded_at >= baseline_start)
        .group_by(func.date(HeartRateSample.recorded_at))
        .all()
    )
    if len(daily_min) < HR_MIN_DAYS_WITH_DATA:
        return None

    recent_cutoff = today - timedelta(days=HR_RECENT_WINDOW_DAYS)
    recent_values = [bpm for day, bpm in daily_min.items() if day >= recent_cutoff]
    if not recent_values:
        return None

    baseline_avg = sum(daily_min.values()) / len(daily_min)
    if baseline_avg <= 0:
        return None
    recent_avg = sum(recent_values) / len(recent_values)

    diff_pct = (recent_avg - baseline_avg) / baseline_avg * 100
    score = 100 - diff_pct * 4
    return round(max(0.0, min(100.0, score)), 1)


def _recommendation_text(score: float) -> str:
    if score >= 80:
        return "Excelente prontidao — bom dia para um treino intenso."
    if score >= 60:
        return "Boa prontidao — dia adequado para um treino moderado a intenso."
    if score >= 40:
        return "Prontidao moderada — considere um treino mais leve hoje."
    return "Prontidao baixa — priorize descanso ou uma atividade leve hoje."


def _combine_scores(sleep_score: float | None, load_score: float, hr_score: float | None) -> float:
    weights = {"load": LOAD_WEIGHT}
    values = {"load": load_score}
    if sleep_score is not None:
        weights["sleep"] = SLEEP_WEIGHT
        values["sleep"] = sleep_score
    if hr_score is not None:
        weights["hr"] = HR_WEIGHT
        values["hr"] = hr_score

    total_weight = sum(weights.values())
    return round(sum(values[key] * weights[key] for key in values) / total_weight, 1)


@router.get("/today", response_model=ReadinessOut)
def get_today_readiness(
    sleep_hours: float | None = Query(
        None, ge=0, le=24, description="Horas de sono da ultima noite, vindas do HealthKit (mobile) — o backend nao tem acesso direto a isso."
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pro_subscription),
):
    """
    Calcula (e re-calcula a cada chamada, sobrescrevendo o registro do dia)
    o score de prontidao de hoje. Diferente de /insights/daily, aqui nao ha
    cache "congelado" — o calculo e barato (so agregacao no banco) e o dado
    de sono pode passar de ausente pra disponivel entre uma chamada e outra
    no mesmo dia (ex: usuario conecta o Apple Health no meio do dia), entao
    faz sentido sempre refletir a informacao mais recente.
    """
    today = date.today()

    sleep_score = _sleep_score(sleep_hours) if sleep_hours is not None else None
    load_score = _load_score(db, current_user.id, today)
    hr_score = _hr_score(db, current_user.id, today)
    final_score = _combine_scores(sleep_score, load_score, hr_score)
    recommendation = _recommendation_text(final_score)

    record = (
        db.query(ReadinessScore)
        .filter(ReadinessScore.user_id == current_user.id, ReadinessScore.date == today)
        .first()
    )
    if record:
        record.sleep_score = sleep_score
        record.load_score = load_score
        record.hr_score = hr_score
        record.final_score = final_score
        record.recommendation_text = recommendation
    else:
        record = ReadinessScore(
            user_id=current_user.id,
            date=today,
            sleep_score=sleep_score,
            load_score=load_score,
            hr_score=hr_score,
            final_score=final_score,
            recommendation_text=recommendation,
        )
        db.add(record)

    db.commit()
    db.refresh(record)
    return record
