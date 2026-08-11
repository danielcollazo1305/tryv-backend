"""
Tipos de profissional que podem se cadastrar no marketplace.

De proposito, isso e so validacao de aplicacao — NAO um enum do banco
(Postgres). professional_type e uma coluna String comum em Trainer.
Adicionar um tipo novo no futuro (ex: fisioterapeuta) e so acrescentar a
string aqui, sem migration nem `ALTER TYPE`.
"""

PROFESSIONAL_TYPES = ["personal_trainer", "nutritionist"]


def validate_professional_type(value: str) -> str:
    if value not in PROFESSIONAL_TYPES:
        raise ValueError(f"professional_type deve ser um de: {', '.join(PROFESSIONAL_TYPES)}")
    return value
