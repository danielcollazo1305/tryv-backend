"""
Lista de modalidades esportivas suportadas pelo app.

De proposito, isso e so uma validacao de aplicacao — NAO um enum do banco
(Postgres). activity_type e sempre uma coluna String comum nos models
(Run, ManualActivity). Adicionar uma modalidade nova no futuro (tenis,
funcional, yoga etc.) e so acrescentar a string aqui, sem migration nem
`ALTER TYPE`.
"""

ACTIVITY_TYPES = ["run", "bike", "swim", "fight", "walk", "hiit", "other"]


# Estilos de luta (ManualActivity.fight_style, so quando activity_type == 'fight'). Validacao de aplicacao, NAO
# enum do banco: acrescentar um estilo novo e so incluir a string aqui.
FIGHT_STYLES = ["boxe", "muay_thai", "jiu_jitsu", "mma", "judo", "karate", "outra"]


def validate_fight_style(value: str) -> str:
    if value not in FIGHT_STYLES:
        raise ValueError(f"fight_style deve ser um de: {', '.join(FIGHT_STYLES)}")
    return value


def validate_activity_type(value: str) -> str:
    if value not in ACTIVITY_TYPES:
        raise ValueError(f"activity_type deve ser um de: {', '.join(ACTIVITY_TYPES)}")
    return value
