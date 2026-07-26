"""
Lista de modalidades esportivas suportadas pelo app.

De proposito, isso e so uma validacao de aplicacao — NAO um enum do banco
(Postgres). activity_type e sempre uma coluna String comum nos models
(Run, ManualActivity). Adicionar uma modalidade nova no futuro (tenis,
funcional, yoga etc.) e so acrescentar a string aqui, sem migration nem
`ALTER TYPE`.
"""

ACTIVITY_TYPES = ["run", "bike", "swim", "fight", "walk", "hiit", "other"]


def validate_activity_type(value: str) -> str:
    if value not in ACTIVITY_TYPES:
        raise ValueError(f"activity_type deve ser um de: {', '.join(ACTIVITY_TYPES)}")
    return value
