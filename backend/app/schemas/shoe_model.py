from pydantic import BaseModel


class ShoeModelOut(BaseModel):
    id: int
    brand: str
    model: str
    type: str
    default_lifespan_km: float

    class Config:
        from_attributes = True
