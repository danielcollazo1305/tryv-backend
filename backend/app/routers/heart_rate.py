from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_pro_subscription
from app.models.heart_rate import HeartRateSample
from app.models.user import User
from app.schemas.heart_rate import (
    DailyHeartRatePoint,
    HeartRateReportOut,
    HeartRateSampleOut,
    HeartRateSyncRequest,
    RestingHeartRateEstimate,
)

router = APIRouter(prefix="/heart-rate", tags=["heart-rate"])

_DEFAULT_REPORT_WINDOW_DAYS = 30


@router.post("/sync", response_model=list[HeartRateSampleOut], status_code=status.HTTP_201_CREATED)
def sync_heart_rate(
    payload: HeartRateSyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    samples = [
        HeartRateSample(
            user_id=current_user.id,
            source=payload.source,
            bpm=item.bpm,
            recorded_at=item.recorded_at,
        )
        for item in payload.samples
    ]
    db.add_all(samples)
    db.commit()
    for sample in samples:
        db.refresh(sample)
    return samples


@router.get("/", response_model=list[HeartRateSampleOut])
def list_heart_rate(
    start_time: datetime = Query(...),
    end_time: datetime = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(HeartRateSample)
        .filter(
            HeartRateSample.user_id == current_user.id,
            HeartRateSample.recorded_at >= start_time,
            HeartRateSample.recorded_at <= end_time,
        )
        .order_by(HeartRateSample.recorded_at.asc())
        .all()
    )


@router.get("/report", response_model=HeartRateReportOut)
def get_heart_rate_report(
    days: int = Query(
        _DEFAULT_REPORT_WINDOW_DAYS, ge=1, le=90, description="Tamanho da janela em dias — 7 ou 30, usado pela Exportacao PDF"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_pro_subscription),
):
    """
    FC media/maxima da janela + tendencia diaria + FC de repouso
    aproximada (mesma tecnica de minimo diario de bpm ja usada em
    readiness.py:_hr_score — nao e uma leitura real de FC de repouso, ver
    RestingHeartRateEstimate). Tudo agregado com GROUP BY no banco:
    HeartRateSample pode ter volume bem maior por usuario que outras
    tabelas (amostras continuas, nao por atividade), entao a rota nunca
    traz amostra crua pra fora do banco.

    days tem default 30 (compatibilidade com a tela de Relatorio de FC no
    mobile, que continua chamando sem parametro) — a Exportacao PDF passa
    7 ou 30 explicitamente.

    Sem minimo de dias com dado (diferente do _hr_score, que exige 5 dias
    pra comparar contra uma baseline) — aqui o proprio grafico/lista diaria
    ja deixa visivel pro usuario quao esparsos os dados sao, entao um
    unico dia com amostra ainda gera uma estimativa (marcada como tal),
    em vez de sumir silenciosamente.
    """
    start = datetime.utcnow() - timedelta(days=days)

    daily_rows = (
        db.query(
            func.date(HeartRateSample.recorded_at).label("day"),
            func.avg(HeartRateSample.bpm).label("avg_bpm"),
            func.min(HeartRateSample.bpm).label("min_bpm"),
            func.max(HeartRateSample.bpm).label("max_bpm"),
        )
        .filter(HeartRateSample.user_id == current_user.id, HeartRateSample.recorded_at >= start)
        .group_by(func.date(HeartRateSample.recorded_at))
        .order_by(func.date(HeartRateSample.recorded_at).asc())
        .all()
    )

    daily = [
        DailyHeartRatePoint(date=row.day, avg_bpm=round(row.avg_bpm, 1), min_bpm=row.min_bpm, max_bpm=row.max_bpm)
        for row in daily_rows
    ]

    period_avg, period_max = (
        db.query(func.avg(HeartRateSample.bpm), func.max(HeartRateSample.bpm))
        .filter(HeartRateSample.user_id == current_user.id, HeartRateSample.recorded_at >= start)
        .first()
    )

    # Media dos minimos diarios ja calculados acima — reaproveita a mesma
    # query em vez de rodar outra so pra isso.
    resting_bpm = round(sum(row.min_bpm for row in daily) / len(daily), 1) if daily else None

    return HeartRateReportOut(
        period_days=days,
        daily=daily,
        avg_bpm=round(period_avg, 1) if period_avg is not None else None,
        max_bpm=period_max,
        resting_estimate=RestingHeartRateEstimate(bpm=resting_bpm),
    )
