import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

PostType = Literal["photo", "video", "progress", "achievement", "workout", "run"]
# 'private' renomeado pra 'followers' — ver comentario em models/social.py.
PostVisibility = Literal["public", "followers"]


class PostCreate(BaseModel):
    type: PostType
    caption: str | None = None
    media_url: str | None = None
    visibility: PostVisibility = "public"
    reference_id: uuid.UUID | None = None


class PostOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    author: str
    type: str
    caption: str | None = None
    media_url: str | None = None
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
    content: str
    created_at: datetime


class UserBrief(BaseModel):
    id: uuid.UUID
    name: str
