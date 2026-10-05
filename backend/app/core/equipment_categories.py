"""
Categorias fixas de equipamento suportadas pelo app, mesmo padrao de
activity_types.py -- so validacao de aplicacao, NAO enum do banco.
"""

# Ids validos pra CRIAR um equipamento. "faixa_cardiaca" mantem o id (o rotulo "Fita cardiaca" e do mobile).
EQUIPMENT_CATEGORIES = ["tenis", "bike", "relogio", "faixa_cardiaca"]

# Descontinuadas: criar novo -> 400. Linhas antigas continuam no banco (ate uma migration posterior
# apaga-las) mas ficam FORA das listagens (GET /equipment).
DISCONTINUED_EQUIPMENT_CATEGORIES = ["luva_faixa", "suplemento"]

# So tenis e bike geram vinculo com atividade, bonus de XP, barra de uso e podem ser "padrao".
DEFAULT_ELIGIBLE_CATEGORIES = ["tenis", "bike"]

# Run.activity_type -> unica categoria aceita como equipment_id nessa corrida. Qualquer outro tipo de
# Run (swim, fight, hiit, other) nao aceita equipamento.
RUN_ACTIVITY_EQUIPMENT_CATEGORY: dict[str, str] = {"run": "tenis", "walk": "tenis", "bike": "bike"}


def validate_equipment_category(value: str) -> str:
    """Aceita as ativas E as descontinuadas: a recusa das descontinuadas (400 "categoria descontinuada")
    e feita no endpoint, nao como erro de validacao do schema (422)."""
    if value not in EQUIPMENT_CATEGORIES and value not in DISCONTINUED_EQUIPMENT_CATEGORIES:
        raise ValueError(f"category deve ser um de: {', '.join(EQUIPMENT_CATEGORIES)}")
    return value
