from pydantic import BaseModel, Field

# Teto por registro (g): protege contra digitacao errada sem atrapalhar porcoes grandes.
MAX_FOOD_GRAMS = 5000


class FoodOut(BaseModel):
    """Alimento da TACO -- todos os valores por 100 g. None = ausente na fonte
    (nao zero); kcal_estimated=True = kcal calculada por 4P+4C+9L."""
    id: int
    name: str
    category: str
    kcal: float | None = None
    protein: float | None = None
    carbohydrates: float | None = None
    lipids: float | None = None
    kcal_estimated: bool

    class Config:
        from_attributes = True


class FoodLogIn(BaseModel):
    grams: float = Field(..., gt=0, le=MAX_FOOD_GRAMS)
