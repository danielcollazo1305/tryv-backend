import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.schemas.subscription import TeamBadge

BiologicalSex = Literal["masculino", "feminino", "prefiro_nao_informar"]
TrainingLevel = Literal["iniciante", "intermediario", "avancado"]


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: uuid.UUID
    name: str
    email: EmailStr
    weight: float | None = None
    height: float | None = None
    goal: str | None = None
    daily_calorie_goal: float | None = None
    daily_protein_goal: float | None = None
    date_of_birth: date | None = None
    biological_sex: str | None = None
    body_fat_percentage: float | None = None
    training_level: str | None = None
    available_equipment: str | None = None
    subscription_status: str
    created_at: datetime
    # Territorio (Ranking/Squad) -- city e o rotulo de exibicao (ex:
    # "Guarujá - SP"), city_ibge_code e a chave estavel usada pra agrupar
    # GET /territory. Ambos graváveis via UserUpdate agora (ver abaixo).
    city: str | None = None
    city_ibge_code: int | None = None
    # Avatar gerado por IA -- so leitura aqui, nunca em UserUpdate (o valor
    # so e gravado pelo endpoint dedicado POST /users/me/avatar, nunca por
    # PATCH generico).
    avatar_url: str | None = None
    # Miniatura 256x256 WebP (null em avatares antigos: use a imagem grande).
    avatar_thumb_url: str | None = None

    class Config:
        from_attributes = True


class AvatarOut(BaseModel):
    avatar_url: str
    # Aditivo: null se a miniatura nao pode ser gerada.
    avatar_thumb_url: str | None = None


class PublicProfileOut(BaseModel):
    """GET /users/{id}/profile: so o minimo publico. avatar_* seguem core/avatar_visibility (menores de 18 e quem
    nao informou a data de nascimento aparecem sem avatar para os outros)."""
    id: uuid.UUID
    name: str
    avatar_url: str | None = None
    avatar_thumb_url: str | None = None
    # Aditivos (app antigo ignora). Estatisticas de desempenho (Overall dos ultimos 30 dias, 0-100, e sequencias):
    # null para menores de 18 e para quem nao informou a data de nascimento (core/avatar_visibility.can_show_stats).
    # O tier (Elite/Ouro/...) e calculado no app a partir de `overall`.
    overall: int | None = None
    forca: int | None = None
    resistencia: int | None = None
    consistencia: int | None = None
    disciplina: int | None = None
    current_streak_days: int | None = None
    best_streak_days: int | None = None
    # Sempre visiveis (inclusive de menores): selo Pro, selos Team e contagens sociais.
    is_pro: bool | None = None
    teams: list[TeamBadge] | None = None
    followers_count: int | None = None
    following_count: int | None = None
    # Aditivo: eu bloqueei esta pessoa (para o app mostrar "Desbloquear").
    is_blocked_by_me: bool = False


class UserUpdate(BaseModel):
    weight: float | None = Field(None, gt=0)
    height: float | None = Field(None, gt=0)
    goal: str | None = None
    daily_calorie_goal: float | None = Field(None, gt=0)
    daily_protein_goal: float | None = Field(None, gt=0)
    date_of_birth: date | None = None
    biological_sex: BiologicalSex | None = None
    body_fat_percentage: float | None = Field(None, gt=0, lt=100)
    training_level: TrainingLevel | None = None
    available_equipment: str | None = None
    city: str | None = None
    city_ibge_code: int | None = None


class UserSearchResult(BaseModel):
    """Usado por /users/search e /users/suggestions -- nunca inclui email/telefone."""
    id: uuid.UUID
    name: str
    is_following: bool
    avatar_url: str | None = None
    avatar_thumb_url: str | None = None


class ContactEntry(BaseModel):
    # Identificador LOCAL do contato no dispositivo (ex: expo-contacts
    # Contact.id) -- opaco pro backend, so serve pra correlacionar a
    # resposta de volta ao contato certo sem precisar devolver o telefone.
    contact_ref: str
    phone_numbers: list[str] = Field(..., max_length=20)


class ContactsMatchRequest(BaseModel):
    # Limite basico contra abuso (Pydantic max_length em list = numero de
    # itens, nao tamanho de string) -- nao precisa ser sofisticado, so
    # evitar uma lista de dezenas de milhares de contatos num request.
    contacts: list[ContactEntry] = Field(..., max_length=3000)


class MatchedContact(BaseModel):
    """So o minimo pra exibir o resultado -- nunca devolve o telefone de
    volta, so o contact_ref (identificador local, nao sensivel) pra o
    cliente saber qual contato da agenda deu match."""
    contact_ref: str
    id: uuid.UUID
    name: str
    is_following: bool
    avatar_url: str | None = None
    avatar_thumb_url: str | None = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)
    new_password: str


class MessageOut(BaseModel):
    message: str


class AccountDeleteRequest(BaseModel):
    """POST /users/me/delete: reconfirmacao por senha atual + a palavra EXCLUIR (comparacao exata apos strip)."""
    password: str = Field(..., min_length=1)
    confirmation: str
