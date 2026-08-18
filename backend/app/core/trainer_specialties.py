"""
Especialidades que um profissional pode marcar no registro, por
professional_type — varias por profissional (multi-select).

Mesmo padrao de app/core/activity_types.py e professional_types.py: so
validacao de aplicacao, NAO enum do banco (specialties e ARRAY(String) em
Trainer). Adicionar uma especialidade nova e so acrescentar a string aqui.
"""

SPECIALTIES_BY_PROFESSIONAL_TYPE: dict[str, list[str]] = {
    "personal_trainer": [
        "hipertrofia",
        "emagrecimento",
        "reabilitacao_fisioterapia_esportiva",
        "terceira_idade",
        "gestantes",
        "powerlifting_forca",
        "funcional",
        "corrida",
    ],
    "nutritionist": [
        "emagrecimento",
        "nutricao_esportiva",
        "reeducacao_alimentar",
        "vegetarianismo_veganismo",
        "disturbios_alimentares",
        "nutricao_clinica",
    ],
}


def validate_specialties(professional_type: str, specialties: list[str]) -> list[str]:
    allowed = SPECIALTIES_BY_PROFESSIONAL_TYPE.get(professional_type, [])
    invalid = [s for s in specialties if s not in allowed]
    if invalid:
        raise ValueError(
            f"Especialidades invalidas para {professional_type}: {', '.join(invalid)}"
        )
    return specialties
