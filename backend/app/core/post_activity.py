"""Resumo da atividade de um post de corrida (type='run'): UMA regra, usada em toda leitura de post.

Um post `type='run'` aponta (reference_id) para uma corrida DO PROPRIO AUTOR. O resumo tem so tipo, distancia, duracao, ritmo medio e data;
NUNCA route_points, coordenadas ou local. Corrida apagada, de outro dono ou post de outro tipo = None (o post continua valendo, sem resumo)."""
from typing import Any, Iterable

from sqlalchemy.orm import Session

from app.models.run import Run
from app.schemas.social import ActivitySummary

RUN_POST_TYPE = "run"


def summary_from_run(run: Run) -> ActivitySummary:
    return ActivitySummary(
        activity_type=run.activity_type,
        distance_meters=run.distance_meters,
        duration_seconds=run.duration_seconds,
        avg_pace_seconds_per_km=run.avg_pace_seconds_per_km,
        started_at=run.started_at,
    )


def activity_summaries(db: Session, posts: Iterable[Any]) -> dict[Any, ActivitySummary]:
    """{post.id: resumo} para os posts de corrida da lista (uma consulta so). So entra a corrida cujo dono e o autor do post."""
    run_posts = [p for p in posts if getattr(p, "type", None) == RUN_POST_TYPE and getattr(p, "reference_id", None) is not None]
    if not run_posts:
        return {}
    runs = {
        r.id: r
        for r in db.query(Run).filter(Run.id.in_({p.reference_id for p in run_posts})).all()
    }
    out: dict[Any, ActivitySummary] = {}
    for post in run_posts:
        run = runs.get(post.reference_id)
        if run is not None and run.user_id == post.user_id:
            out[post.id] = summary_from_run(run)
    return out
