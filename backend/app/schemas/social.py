import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.core.post_media import MAX_POST_PHOTOS

PostType = Literal["photo", "video", "progress", "achievement", "workout", "run"]
# 'private' renomeado pra 'followers' — ver comentario em models/social.py.
PostVisibility = Literal["public", "followers"]
# 'manual' = escrito na tela de novo post; 'auto' = gerado pelo app (refeicao/check-in); 'legacy' = antigo/sem origem.
PostOrigin = Literal["manual", "auto", "legacy"]


class PostCreate(BaseModel):
    type: PostType
    caption: str | None = None
    media_url: str | None = None
    # Carrossel: de 1 a 10 fotos, sem repeticao, so em post photo. Se vier, media_url passa a ser media_urls[0] (capa).
    media_urls: list[str] | None = None
    visibility: PostVisibility = "public"
    reference_id: uuid.UUID | None = None
    origin: PostOrigin | None = None  # ausente = legacy

    @field_validator("media_urls")
    @classmethod
    def _check_media_urls(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        if not 1 <= len(value) <= MAX_POST_PHOTOS:
            raise ValueError("Um post aceita de 1 a %d fotos." % MAX_POST_PHOTOS)
        if any(not isinstance(u, str) or not u.strip() for u in value):
            raise ValueError("Foto invalida.")
        if len(set(value)) != len(value):
            raise ValueError("Foto repetida no mesmo post.")
        return value

    @model_validator(mode="after")
    def _media_urls_only_for_photo(self):
        if self.media_urls is not None and self.type != "photo":
            raise ValueError("Varias fotos so em post do tipo photo.")
        return self


class PostUpdate(BaseModel):
    """Edicao de post pelo dono (PATCH /posts/{id}): SO legenda e privacidade. Qualquer outro campo (media_url, origin, user_id,
    created_at...) e recusado com 422, para nunca alterar o resto do post."""

    model_config = ConfigDict(extra="forbid")

    caption: str | None = None  # "" limpa a legenda; ausente (ou null) = nao mexe
    visibility: PostVisibility | None = None


class PostOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    author: str
    # Avatar do autor pela regra de core/avatar_visibility (aditivo; null = mostrar iniciais).
    avatar_url: str | None = None
    avatar_thumb_url: str | None = None
    type: str
    caption: str | None = None
    media_url: str | None = None
    # Todas as fotos em ordem (posts antigos: [media_url]; sem foto: []). media_url continua sendo a capa.
    media_urls: list[str] = []
    visibility: str
    reference_id: uuid.UUID | None = None
    created_at: datetime
    likes_count: int
    comments_count: int
    is_liked_by_me: bool = False


class FollowOut(BaseModel):
    id: uuid.UUID
    follower_id: uuid.UUID
    following_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class LikeOut(BaseModel):
    id: uuid.UUID
    post_id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class CommentCreate(BaseModel):
    content: str


class CommentOut(BaseModel):
    id: uuid.UUID
    post_id: uuid.UUID
    user_id: uuid.UUID
    author: str
    avatar_url: str | None = None
    avatar_thumb_url: str | None = None
    content: str
    created_at: datetime


class UserBrief(BaseModel):
    id: uuid.UUID
    name: str
    avatar_url: str | None = None
    avatar_thumb_url: str | None = None
