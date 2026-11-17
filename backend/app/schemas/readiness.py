from datetime import date

from pydantic import BaseModel


class ReadinessOut(BaseModel):
    date: date
    sleep_score: float | None = None
    load_score: float | None = None
    # Carga dos 7 dias ANTERIORES a hoje (sem o dia de hoje): base da manha da Vitalidade dinamica no app. Campo novo; o app antigo o ignora.
    load_score_prior: float | None = None
    hr_score: float | None = None
    final_score: float
    recommendation_text: str | None = None

    class Config:
        from_attributes = True
