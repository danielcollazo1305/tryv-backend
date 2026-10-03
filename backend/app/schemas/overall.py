from pydantic import BaseModel


class OverallStatsOut(BaseModel):
    """Atributos de 0-100 do perfil (ultimos 30 dias) + media simples dos 4
    em `overall`. Formulas em app/routers/overall.py."""
    forca: int
    resistencia: int
    consistencia: int
    disciplina: int
    overall: int
