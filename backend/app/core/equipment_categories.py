"""
Categorias fixas de equipamento suportadas pelo app, mesmo padrao de
activity_types.py -- so validacao de aplicacao, NAO enum do banco.
"""

EQUIPMENT_CATEGORIES = ["tenis", "luva_faixa", "bike", "suplemento", "faixa_cardiaca"]


def validate_equipment_category(value: str) -> str:
    if value not in EQUIPMENT_CATEGORIES:
        raise ValueError(f"category deve ser um de: {', '.join(EQUIPMENT_CATEGORIES)}")
    return value


# Quais categorias cada tabela de atividade aceita marcar em equipment_id --
# faixa_cardiaca e transversal (qualquer modalidade), as demais sao
# especificas por tipo de atividade.
ALLOWED_CATEGORIES_BY_ACTIVITY_MODEL: dict[str, list[str]] = {
    "run": ["tenis", "bike", "faixa_cardiaca"],
    "manual_activity": ["luva_faixa", "faixa_cardiaca"],
    "workout_session": ["suplemento", "faixa_cardiaca"],
}
