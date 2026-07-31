from fastapi import FastAPI

from app import models  # noqa: F401 — garante que Base.metadata conheça todas as tabelas
from app.core.config import settings
from app.core.database import Base, engine
from app.routers import (
    activities,
    auth,
    challenges,
    heart_rate,
    media,
    meals,
    runs,
    smartwatch,
    social,
    trainer_subscriptions,
    trainers,
    users,
    webhooks,
    workout_plans,
)

# Convivio com Alembic: cria tabelas que ainda nao existem, para facilitar
# rodar o projeto num banco local vazio pela primeira vez. Isso NAO substitui
# migrations — qualquer mudanca de schema (nova coluna, tabela, etc.) deve
# ser feita via "alembic revision --autogenerate" + "alembic upgrade head"
# (ver README.md), nunca so editando o model e confiando neste create_all.
Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.app_name)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(meals.router)
app.include_router(workout_plans.router)
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


@app.get("/")
def health_check():
    return {"status": "ok", "app": settings.app_name}
