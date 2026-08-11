"""
Calculo de recordes pessoais (PRs) por modalidade — sob demanda, sem
cache/tabela propria (o historico de corridas por usuario e pequeno o
suficiente pra isso ser barato). 3 categorias na v1: maior distancia, maior
duracao, melhor pace perto de distancias de referencia comuns (1/5/10km,
tolerancia +-10%). PR de "melhor trecho dentro de uma atividade mais longa"
fica pra v2 — precisaria de uma janela deslizante sobre route_points, nao e
so reaproveitar o que ja esta armazenado em Run.
"""
import uuid
from typing import NamedTuple

from sqlalchemy.orm import Session

from app.models.run import Run

REFERENCE_DISTANCES_METERS: dict[str, int] = {"1km": 1000, "5km": 5000, "10km": 10000}
_DISTANCE_TOLERANCE = 0.10


class ActivityRecords(NamedTuple):
    longest_distance: Run | None
    longest_duration: Run | None
    best_pace_by_reference: dict[str, Run]


def compute_personal_records(
    db: Session, user_id: uuid.UUID, exclude_run_id: uuid.UUID | None = None
) -> dict[str, ActivityRecords]:
    """
    Um ActivityRecords por activity_type em que o usuario tem pelo menos uma
    atividade. exclude_run_id existe pra permitir calcular o recorde ANTES
    de uma corrida nova entrar na conta (POST /runs chama isso antes do
    commit, entao na pratica a linha nova nem existe ainda no banco — o
    parametro fica como garantia extra caso esse padrao de chamada mude).
    """
    query = db.query(Run).filter(Run.user_id == user_id)
    if exclude_run_id is not None:
        query = query.filter(Run.id != exclude_run_id)

    by_type: dict[str, list[Run]] = {}
    for run in query.all():
        by_type.setdefault(run.activity_type, []).append(run)

    result: dict[str, ActivityRecords] = {}
    for activity_type, runs in by_type.items():
        longest_distance = max(runs, key=lambda r: r.distance_meters, default=None)
        longest_duration = max(runs, key=lambda r: r.duration_seconds, default=None)

        best_pace_by_reference: dict[str, Run] = {}
        for label, meters in REFERENCE_DISTANCES_METERS.items():
            low, high = meters * (1 - _DISTANCE_TOLERANCE), meters * (1 + _DISTANCE_TOLERANCE)
            candidates = [
                r for r in runs if r.avg_pace_seconds_per_km is not None and low <= r.distance_meters <= high
            ]
            if candidates:
                best_pace_by_reference[label] = min(candidates, key=lambda r: r.avg_pace_seconds_per_km)

        result[activity_type] = ActivityRecords(longest_distance, longest_duration, best_pace_by_reference)

    return result


def detect_new_prs(run: Run, previous: ActivityRecords | None) -> list[str]:
    """Compara uma corrida (ja com id/valores calculados, mas pode ainda nao
    estar commitada) contra o recorde anterior daquela modalidade."""
    new_prs: list[str] = []

    prev_distance = previous.longest_distance if previous else None
    if prev_distance is None or run.distance_meters > prev_distance.distance_meters:
        new_prs.append("maior_distancia")

    prev_duration = previous.longest_duration if previous else None
    if prev_duration is None or run.duration_seconds > prev_duration.duration_seconds:
        new_prs.append("maior_duracao")

    if run.avg_pace_seconds_per_km is not None:
        for label, meters in REFERENCE_DISTANCES_METERS.items():
            low, high = meters * (1 - _DISTANCE_TOLERANCE), meters * (1 + _DISTANCE_TOLERANCE)
            if not (low <= run.distance_meters <= high):
                continue
            prev_pace_run = previous.best_pace_by_reference.get(label) if previous else None
            if prev_pace_run is None or run.avg_pace_seconds_per_km < prev_pace_run.avg_pace_seconds_per_km:
                new_prs.append(f"melhor_pace_{label}")

    return new_prs
