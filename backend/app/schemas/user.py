import uuid
from datetime import date, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field

from app.core import timezone as tz
from app.core.profile_rules import USERNAME_CHANGE_INTERVAL_DAYS, username_change_wait_days
from app.schemas.subscription import TeamBadge

BiologicalSex = Literal["masculino", "feminino", "prefiro_nao_informar"]
TrainingLevel = Literal["iniciante", "intermediario", "avancado"]


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    # Obrigatoria (idade minima 18, core/age_policy.py). Fica "| None" no schema so para a rota devolver a mensagem em
    # portugues ("Informe sua data de nascimento.") em vez do erro generico do Pydantic.
    date_of_birth: date | None = None


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
    # Perfil (E7), so leitura aqui: gravados por PATCH /users/me/profile. null = nao definido.
    username: str | None = None
    bio: str | None = None
    link: str | None = None
    # Quando o @usuario foi definido/trocado pela ultima vez. Lido do banco SO para calcular os dois campos abaixo; `exclude=True`:
    # NUNCA aparece na resposta (o valor cru nao e exposto).
    username_changed_at: datetime | None = Field(default=None, exclude=True)

    class Config:
        from_attributes = True

    def _username_wait_days(self) -> int:
        """Dias que faltam para poder trocar o @usuario (0 = livre). MESMA funcao do PATCH /users/me/profile (core/profile_rules.py),
        entao o numero mostrado pelo app nunca diverge do 422 do servidor. Sem @usuario definido nao ha o que trocar (0)."""
        if self.username is None:
            return 0
        return username_change_wait_days(self.username_changed_at, tz.utc_now())

    # Troca do @usuario so a cada 30 dias (a PRIMEIRA definicao e livre, mas ela inicia o intervalo). Somente leitura, so no perfil
    # PROPRIO (este schema so e usado em /auth/register, GET e PATCH /users/me e PATCH /users/me/profile); null = troca livre.
    @computed_field  # type: ignore[prop-decorator]
    @property
    def username_next_change_at(self) -> datetime | None:
        """Quando o @usuario pode ser trocado de novo (UTC, como o resto da API); null = ja pode (ou nunca definiu)."""
        if self._username_wait_days() <= 0 or self.username_changed_at is None:
            return None
        return self.username_changed_at + timedelta(days=USERNAME_CHANGE_INTERVAL_DAYS)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def username_change_wait_days(self) -> int | None:
        """Dias inteiros que faltam (arredondando para cima), o mesmo N da mensagem do 422; null = troca livre."""
        days = self._username_wait_days()
        return days if days > 0 else None


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
    # Perfil (E7). username sempre visivel; bio e link ficam null para OUTRAS pessoas quando o dono e menor de 18 ou nao
    # informou a data de nascimento (core/avatar_visibility.can_show_stats). O dono sempre ve os proprios.
    username: str | None = None
    bio: str | None = None
    link: str | None = None


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


class ProfileUpdate(BaseModel):
    """PATCH /users/me/profile: so @usuario, bio e link, todos opcionais (ausente ou null = nao mexe; "" limpa bio e link; o
    @usuario nao pode ser limpo). Campos extras = 422."""

    model_config = ConfigDict(extra="forbid")

    username: str | None = None
    bio: str | None = None
    link: str | None = None


class UsernameAvailableOut(BaseModel):
    available: bool


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
