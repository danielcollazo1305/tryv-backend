import logging
import threading
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app import models  # noqa: F401 — garante que Base.metadata conheça todas as tabelas
from app.core.config import settings
from app.core.database import Base, engine
from app.core.logging_config import configure_app_logging
from app.routers import (
    activities,
    auth,
    challenges,
    creatine_logs,
    dashboard,
    diet_plans,
    equipment,
    foods,
    heart_rate,
    insights,
    live_activities,
    media,
    meals,
    overall,
    ranking,
    readiness,
    runs,
    saved_meals,
    shoe_models,
    smartwatch,
    social,
    squads,
    subscriptions,
    trainer_subscriptions,
    trainers,
    users,
    waitlist,
    water_logs,
    webhooks,
    weight_logs,
    workout_plans,
    workout_sessions,
)

# Convivio com Alembic: cria tabelas que ainda nao existem, para facilitar
# rodar o projeto num banco local vazio pela primeira vez. Isso NAO substitui
# migrations — qualquer mudanca de schema (nova coluna, tabela, etc.) deve
# ser feita via "alembic revision --autogenerate" + "alembic upgrade head"
# (ver README.md), nunca so editando o model e confiando neste create_all.
Base.metadata.create_all(bind=engine)

# Logs INFO dos modulos do app passam a sair em producao (ver core/logging_config.py).
configure_app_logging()
logger = logging.getLogger(__name__)


def _log_boot_diagnostics() -> None:
    """Loga DB_TIMEZONE_DIAG (fuso da sessao do banco, now() como o banco devolve, now()
    em UTC e o utcnow() do Python) e uma linha `app_started` (confirma que a config de
    logging funciona em producao). Nunca levanta: qualquer falha vira um WARNING (so o
    tipo do erro, sem dado sensivel) e o `app_started` sai mesmo assim. Conexao curta,
    devolvida ao pool ao sair do with."""
    db_timezone = "unknown"
    try:
        with engine.connect() as conn:
            db_timezone, db_now, db_now_utc = conn.execute(
                text("SELECT current_setting('TimeZone'), now(), now() AT TIME ZONE 'UTC'")
            ).one()
        python_utcnow = datetime.utcnow()
        logger.info(
            "DB_TIMEZONE_DIAG db_timezone=%s db_now=%s db_now_utc=%s python_utcnow=%s",
            db_timezone,
            db_now.isoformat(),
            db_now_utc.isoformat(),
            python_utcnow.isoformat(),
        )
    except Exception as exc:
        logger.warning("DB_TIMEZONE_DIAG failed error_type=%s", type(exc).__name__)
    logger.info("app_started db_timezone=%s", db_timezone)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Thread daemon, sem esperar por ela: o boot nunca atrasa nem cai por causa do
    # diagnostico (nem se o banco demorar a responder).
    threading.Thread(target=_log_boot_diagnostics, name="boot-diagnostics", daemon=True).start()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

# CORS -- so existe pra viabilizar a landing page (site estatico separado,
# outro dominio) chamando o endpoint publico /waitlist do navegador. O app
# mobile nao passa por CORS (nao e um browser), entao isso nao afeta ele.
# Restrito a localhost (dev da landing), tryvfit.app (dominio de producao da
# landing) e *.vercel.app (preview/deploy da landing no Vercel). Nunca usar
# "*": a API tem endpoints autenticados, e allow_origin_regex aberto
# liberaria qualquer site pra tentar chamar eles a partir do browser de um
# usuario logado.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(http://localhost(:\d+)?|https://(www\.)?tryvfit\.app|https://.*\.vercel\.app)$",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    allow_credentials=False,
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(meals.router)
app.include_router(workout_plans.router)
app.include_router(workout_sessions.router)
app.include_router(smartwatch.router)
app.include_router(runs.router)
app.include_router(trainers.router)
app.include_router(trainer_subscriptions.router)
app.include_router(social.router)
app.include_router(webhooks.router)
app.include_router(challenges.router)
app.include_router(activities.router)
app.include_router(heart_rate.router)
app.include_router(media.router)
app.include_router(weight_logs.router)
app.include_router(dashboard.router)
app.include_router(overall.router)
app.include_router(water_logs.router)
app.include_router(creatine_logs.router)
app.include_router(saved_meals.router)
app.include_router(foods.router)
app.include_router(equipment.router)
app.include_router(shoe_models.router)
app.include_router(insights.router)
app.include_router(readiness.router)
app.include_router(live_activities.router)
app.include_router(subscriptions.router)
app.include_router(diet_plans.router)
app.include_router(squads.router)
app.include_router(ranking.router)
app.include_router(waitlist.router)


@app.get("/")
def health_check():
    return {"status": "ok", "app": settings.app_name}
