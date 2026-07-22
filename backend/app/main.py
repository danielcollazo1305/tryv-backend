from fastapi import FastAPI

from app import models  # noqa: F401 — garante que Base.metadata conheça todas as tabelas
from app.core.config import settings
from app.core.database import Base, engine
from app.routers import auth, meals, runs, smartwatch, users, workout_plans

# Cria as tabelas no banco (em produção, usar Alembic para migrations)
Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.app_name)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(meals.router)
app.include_router(workout_plans.router)
app.include_router(smartwatch.router)
app.include_router(runs.router)


@app.get("/")
def health_check():
    return {"status": "ok", "app": settings.app_name}
