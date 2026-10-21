import base64
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.avatar_visibility import can_show_stats
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.post_media import photo_count
from app.models.social import Post
from app.models.user import User
from app.routers.social import _is_following
from app.schemas.gallery import GalleryItem, GalleryPage
from app.services.moderation import has_blocked, is_blocked_between, not_reported_post
from app.services.storage import POSTS_PREFIX, _public_url_prefix

router = APIRouter(prefix="/users", tags=["gallery"])

GALLERY_DEFAULT_LIMIT = 30
GALLERY_MAX_LIMIT = 60


def _encode_cursor(created_at: datetime, post_id: uuid.UUID) -> str:
    raw = f"{created_at.isoformat()}|{post_id}"
    return base64.urlsafe_b64encode(raw.encode("ascii")).decode("ascii").rstrip("=")


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        stamp, post_id = base64.urlsafe_b64decode(padded.encode("ascii")).decode("ascii").split("|")
        return datetime.fromisoformat(stamp), uuid.UUID(post_id)
    except (ValueError, UnicodeError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Cursor invalido")


@router.get("/{user_id}/gallery", response_model=GalleryPage)
def user_gallery(
    user_id: str,
    cursor: str | None = Query(None, max_length=200),
    limit: int = Query(GALLERY_DEFAULT_LIMIT, ge=1, le=GALLERY_MAX_LIMIT),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Galeria de fotos dos POSTS de uma pessoa (`me` = a minha), mais recentes primeiro, por cursor.

    Entram so posts com foto cuja origem NAO e "foto compartilhada de refeicao/check-in": `origin = 'manual'` (feito a mao na
    tela de novo post) ou `origin = 'legacy'` com a foto na pasta `posts/` do armazenamento. `origin = 'auto'` (refeicao e
    check-in compartilhados pelo app) fica de fora, e post antigo (`legacy`) cuja foto esta na pasta de refeicao/desafio tambem
    (a pasta e o unico sinal tecnico seguro nesses posts antigos; nenhuma heuristica por texto).
    Visibilidade: o dono ve tudo dele; outras pessoas veem posts publicos (e os so-seguidores se seguem o dono).
    Bloqueio nos dois sentidos = 404 generico. Dono menor de 18 ou sem data de nascimento: galeria VAZIA para os outros
    (mesma regra das estatisticas e do avatar). Posts que EU denunciei nao aparecem."""
    if user_id == "me":
        owner_id = current_user.id
    else:
        try:
            owner_id = uuid.UUID(user_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")
    owner = db.query(User).filter(User.id == owner_id).first()
    if owner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")

    is_self = owner.id == current_user.id
    if not is_self and is_blocked_between(db, current_user.id, owner.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")
    if not is_self and not can_show_stats(owner, current_user.id):
        return GalleryPage(items=[], next_cursor=None)

    conditions = [
        Post.user_id == owner.id,
        Post.media_url.is_not(None),
        Post.media_url != "",
        Post.type != "video",
        Post.created_at.is_not(None),
        or_(
            Post.origin == "manual",
            and_(Post.origin == "legacy", Post.media_url.like(_public_url_prefix() + POSTS_PREFIX + "%")),
        ),
        not_reported_post(Post.id, current_user.id),
    ]
    if not is_self and not _is_following(db, current_user.id, owner.id):
        conditions.append(Post.visibility == "public")
    if cursor:
        c_at, c_id = _decode_cursor(cursor)
        conditions.append(or_(Post.created_at < c_at, and_(Post.created_at == c_at, Post.id < c_id)))

    rows = (
        db.query(Post.id, Post.media_url, Post.media_urls, Post.created_at)
        .filter(*conditions)
        .order_by(Post.created_at.desc(), Post.id.desc())
        .limit(limit + 1)
        .all()
    )
    has_more = len(rows) > limit
    rows = rows[:limit]
    # So a capa de cada post na grade; photo_count (>= 1) deixa o app mostrar o icone de varias fotos.
    items = [
        GalleryItem(post_id=r.id, url=r.media_url, created_at=r.created_at, photo_count=photo_count(r.media_url, r.media_urls))
        for r in rows
    ]
    next_cursor = _encode_cursor(rows[-1].created_at, rows[-1].id) if has_more and rows else None
    return GalleryPage(items=items, next_cursor=next_cursor)
