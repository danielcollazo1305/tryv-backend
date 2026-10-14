import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base

REPORT_REASONS = ("spam", "assedio", "nudez", "violencia", "menor", "outro")
REPORT_STATUSES = ("open", "actioned", "dismissed")


class UserBlock(Base):
    """`blocker_id` bloqueou `blocked_id`. O efeito vale nos DOIS sentidos (ver services/moderation.py)."""

    __tablename__ = "user_blocks"
    __table_args__ = (
        UniqueConstraint("blocker_id", "blocked_id", name="uq_user_block_pair"),
        CheckConstraint("blocker_id <> blocked_id", name="ck_user_block_not_self"),
        Index("ix_user_blocks_blocked_id", "blocked_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    blocker_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    blocked_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class PostReport(Base):
    """Denuncia de um post OU de um comentario (exatamente um dos dois ids).

    post_id/comment_id NAO tem FK de proposito: quando a moderacao remove o conteudo (ou o autor o apaga), a denuncia
    continua como registro de auditoria (quem revisou, quando, motivo) em vez de sumir junto por CASCADE. Para isso a
    denuncia guarda um instantaneo curto do texto (`target_excerpt`) e o autor (`target_author_id`).
    """

    __tablename__ = "post_reports"
    __table_args__ = (
        CheckConstraint(
            "(post_id IS NOT NULL AND comment_id IS NULL) OR (post_id IS NULL AND comment_id IS NOT NULL)",
            name="ck_post_report_one_target",
        ),
        CheckConstraint("reason IN ('spam','assedio','nudez','violencia','menor','outro')", name="ck_post_report_reason"),
        CheckConstraint("status IN ('open','actioned','dismissed')", name="ck_post_report_status"),
        Index(
            "uq_post_report_reporter_post", "reporter_id", "post_id", unique=True, postgresql_where=text("post_id IS NOT NULL")
        ),
        Index(
            "uq_post_report_reporter_comment",
            "reporter_id",
            "comment_id",
            unique=True,
            postgresql_where=text("comment_id IS NOT NULL"),
        ),
        Index("ix_post_reports_status_created", "status", "created_at"),
        Index("ix_post_reports_post_id", "post_id", postgresql_where=text("post_id IS NOT NULL")),
        Index("ix_post_reports_comment_id", "comment_id", postgresql_where=text("comment_id IS NOT NULL")),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # NULL = denunciante com a conta excluida (a denuncia continua como registro de moderacao, anonima).
    reporter_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    post_id = Column(UUID(as_uuid=True), nullable=True)
    comment_id = Column(UUID(as_uuid=True), nullable=True)
    target_author_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    target_excerpt = Column(Text, nullable=True)
    reason = Column(String(20), nullable=False)
    details = Column(String(500), nullable=True)
    status = Column(String(10), nullable=False, default="open")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
