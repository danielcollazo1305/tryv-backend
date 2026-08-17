import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


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
    subscription_status: str
    created_at: datetime

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    weight: float | None = Field(None, gt=0)
    height: float | None = Field(None, gt=0)
    goal: str | None = None
    daily_calorie_goal: float | None = Field(None, gt=0)


class UserSearchResult(BaseModel):
    """Usado por /users/search e /users/suggestions -- nunca inclui email/telefone."""
    id: uuid.UUID
    name: str
    is_following: bool


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


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
