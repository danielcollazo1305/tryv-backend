import uuid
from datetime import datetime

from pydantic import BaseModel, Field

# Teto por registro: protege contra digitacao errada (ex: 25000 em vez de 250)
# sem atrapalhar uma garrafa grande de verdade.
MAX_WATER_ML_PER_LOG = 5000


class WaterLogCreate(BaseModel):
    amount_ml: int = Field(..., gt=0, le=MAX_WATER_ML_PER_LOG)
    logged_at: datetime | None = None  # default: agora (servidor)


class WaterLogOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    amount_ml: int
    logged_at: datetime

    class Config:
        from_attributes = True


class WaterTodayOut(BaseModel):
    total_ml: int
