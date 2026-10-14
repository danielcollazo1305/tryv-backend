import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.social import UserBrief

ReportReason = Literal["spam", "assedio", "nudez", "violencia", "menor", "outro"]
ReportStatus = Literal["open", "actioned", "dismissed"]


class ReportCreate(BaseModel):
    reason: ReportReason
    details: str | None = Field(None, max_length=500)

    @field_validator("details")
    @classmethod
    def _strip_details(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class ReportOut(BaseModel):
    """Resposta ao denunciante: so o protocolo e o estado. Nunca revela dados do denunciado nem de outros denunciantes."""

    id: uuid.UUID
    status: ReportStatus
    created_at: datetime


class AdminReportOut(BaseModel):
    """Item da fila de moderacao. Sem e-mail nem data de nascimento de ninguem; avatar pela regra de visibilidade."""

    id: uuid.UUID
    status: ReportStatus
    reason: ReportReason
    details: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None
    reviewed_by: uuid.UUID | None = None
    target_type: Literal["post", "comment"]
    target_id: uuid.UUID
    # True quando o conteudo ja nao existe (removido pela moderacao ou apagado pelo autor): o texto vem do instantaneo.
    content_removed: bool
    target_text: str | None = None
    target_media_url: str | None = None
    target_author: UserBrief | None = None
    # None + reporter_deleted=true: denunciante com a conta excluida (aparece como "Conta excluida"; nada e revelado).
    reporter: UserBrief | None = None
    reporter_deleted: bool = False


class ResolveReportIn(BaseModel):
    action: Literal["remove_content", "dismiss"]


class ResolveReportOut(BaseModel):
    id: uuid.UUID
    status: ReportStatus
    reviewed_at: datetime
    reviewed_by: uuid.UUID
    content_removed: bool
