import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Index, UniqueConstraint, CheckConstraint, text
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class Post(Base):
    __tablename__ = "posts"
    __table_args__ = (
        # Feed e posts por usuario (migration f2a6c93b1d58); o parcial serve o escopo publico (Explorar).
        Index("ix_posts_user_created", "user_id", text("created_at DESC")),
        Index("ix_posts_public_created", text("created_at DESC"), text("id DESC"), postgresql_where=text("visibility = 'public'")),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    type = Column(String, nullable=False)  # 'photo' | 'video' | 'progress' | 'achievement' | 'workout' | 'run'
    caption = Column(Text, nullable=True)
    media_url = Column(String, nullable=True)
    # 'public' | 'followers' — renomeado de 'private' (privacidade em 3
    # niveis): o valor sempre se comportou como "so seguidores + o proprio
    # autor" (ver _can_view_post em routers/social.py), nunca foi de fato
    # privado a ponto de nem o autor ver, entao o nome antigo era impreciso.
    # "privado de verdade" nao e um estado do Post — e a AUSENCIA de post
    # (a pessoa so nao compartilha nada).
    visibility = Column(String, nullable=False, default="public")

    # Vincula a um workout_session, run ou challenge quando o post e automatico
    reference_id = Column(UUID(as_uuid=True), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)


class Follow(Base):
    __tablename__ = "follows"
    __table_args__ = (
        UniqueConstraint("follower_id", "following_id", name="uq_follow_follower_following"),
        CheckConstraint("follower_id != following_id", name="ck_follow_no_self_follow"),
        Index("ix_follows_following", "following_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    follower_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    following_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)


class Like(Base):
    __tablename__ = "likes"
    __table_args__ = (
        UniqueConstraint("post_id", "user_id", name="uq_like_post_user"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id = Column(UUID(as_uuid=True), ForeignKey("posts.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)


class Comment(Base):
    __tablename__ = "comments"
    __table_args__ = (Index("ix_comments_post", "post_id"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id = Column(UUID(as_uuid=True), ForeignKey("posts.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    content = Column(Text, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
