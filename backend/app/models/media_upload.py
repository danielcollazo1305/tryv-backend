import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class MediaUpload(Base):
    """Foto de post APROVADA pela analise automatica (E3e fase 4) e gravada no S3. Guarda so quem enviou, a pasta, o endereco
    e quando; nunca a imagem. POST /posts so aceita `media_url` que esteja aqui, do proprio usuario (fecha o buraco de apontar
    o post para qualquer endereco). Serve tambem para o limite de uploads por hora. Apagada junto com a conta."""

    __tablename__ = "media_uploads"
    __table_args__ = (
        Index("ix_media_uploads_user_created", "user_id", "created_at"),
        Index("ix_media_uploads_url", "url"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    folder = Column(String(20), nullable=False)
    url = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
