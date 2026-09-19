from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401 — garante que Base.metadata conheça todas as tabelas
from app.core.config import settings
from app.core.database import Base, engine
from app.routers import (
    activities,
    auth,
    challenges,
    dashboard,
    diet_plans,
    heart_rate,
    insights,
    live_activities,
    media,
    meals,
    ranking,
    readiness,
    runs,
    smartwatch,
    social,
    squads,
    subscriptions,
    trainer_subscriptions,
    trainers,
    users,
    waitlist,
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

app = FastAPI(title=settings.app_name)

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
