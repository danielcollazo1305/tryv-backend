"""
Idade minima do Tryv: 18 anos (decisao de produto, E4d). Regra UNICA para cadastro e edicao de perfil.

- A idade e calculada NO SERVIDOR com a data de hoje no fuso do app (core/timezone.local_today, padrao America/Sao_Paulo);
  o aniversario exato conta (quem faz 18 anos hoje pode). Mesma conta de core/avatar_visibility.age_in_years.
- Sem data -> 422 "Informe sua data de nascimento."; data futura ou idade acima de 120 anos -> 422 "Data de nascimento
  invalida."; menor de 18 -> 422 "O Tryv é para maiores de 18 anos." As mensagens nao revelam mais do que isso.
"""
from datetime import date

from fastapi import HTTPException, status

from app.core.avatar_visibility import age_in_years
from app.core.timezone import local_today

MIN_REGISTRATION_AGE = 18
MAX_PLAUSIBLE_AGE = 120

MISSING_BIRTH_DATE_MESSAGE = "Informe sua data de nascimento."
INVALID_BIRTH_DATE_MESSAGE = "Data de nascimento inválida."
UNDERAGE_MESSAGE = "O Tryv é para maiores de 18 anos."
MISSING_BIRTH_DATE_FOR_PROFESSIONAL_MESSAGE = "Informe sua data de nascimento no perfil para se cadastrar como profissional."


def birth_date_error(date_of_birth: date | None, today: date | None = None) -> str | None:
    """Mensagem (portugues) do primeiro problema da data de nascimento, ou None se ela e aceita."""
    if date_of_birth is None:
        return MISSING_BIRTH_DATE_MESSAGE
    today = today or local_today()
    if date_of_birth > today:
        return INVALID_BIRTH_DATE_MESSAGE
    age = age_in_years(date_of_birth, today)
    if age > MAX_PLAUSIBLE_AGE:
        return INVALID_BIRTH_DATE_MESSAGE
    if age < MIN_REGISTRATION_AGE:
        return UNDERAGE_MESSAGE
    return None


def require_valid_birth_date(date_of_birth: date | None) -> date:
    """Levanta 422 com a mensagem acima se a data nao for aceita; devolve a data se for."""
    message = birth_date_error(date_of_birth)
    if message is not None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=message)
    return date_of_birth  # type: ignore[return-value]


def require_professional_birth_date(date_of_birth: date | None) -> date:
    """Cadastro de profissional (POST /trainers/register): o usuario logado precisa ter data de nascimento e 18+ (mesma regra
    do cadastro). Sem data -> 422 com mensagem propria; menor/data invalida -> a mesma mensagem do cadastro. So vale para
    NOVOS perfis: perfis de profissional ja existentes nao sao revisados."""
    if date_of_birth is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=MISSING_BIRTH_DATE_FOR_PROFESSIONAL_MESSAGE
        )
    return require_valid_birth_date(date_of_birth)
