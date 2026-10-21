"""Fotos de um post (carrossel de ate 10): UMA regra, usada em toda leitura e exclusao.

`posts.media_url` e sempre a PRIMEIRA foto (capa; e o que o app antigo le). `posts.media_urls` (JSON, nullable) e a lista completa em ordem,
com a capa na posicao 0; posts antigos ficam com `media_urls = NULL` e valem so com `media_url`. Nenhum ponto do servidor deve ler
`media_url` sozinho quando a leitura, a exclusao ou a moderacao precisam cobrir TODAS as fotos: use `post_media_urls`."""
from typing import Any, Iterable

from sqlalchemy import Text, cast, or_
from sqlalchemy.orm import Session

MAX_POST_PHOTOS = 10
_CHUNK = 50


def media_urls_of(media_url: str | None, media_urls: Any) -> list[str]:
    """Lista deduplicada, em ordem, das fotos: a capa primeiro, depois as demais de `media_urls`. Tolera NULL, lista vazia e itens invalidos."""
    ordered: list[str] = []
    candidates: list[Any] = [media_url]
    if isinstance(media_urls, (list, tuple)):
        candidates.extend(media_urls)
    for item in candidates:
        if isinstance(item, str) and item and item not in ordered:
            ordered.append(item)
    return ordered


def post_media_urls(post: Any) -> list[str]:
    """Todas as fotos do post (objeto Post ou qualquer coisa com media_url e media_urls)."""
    return media_urls_of(getattr(post, "media_url", None), getattr(post, "media_urls", None))


def photo_count(media_url: str | None, media_urls: Any) -> int:
    return max(1, len(media_urls_of(media_url, media_urls)))


def urls_in_carousels(db: Session, urls: Iterable[str], *, exclude_post_id=None, exclude_user_id=None) -> set[str]:
    """Quais dessas URLs aparecem em `media_urls` de OUTRO post (outro id e/ou outro dono)."""
    from app.models.social import Post

    wanted = sorted({u for u in urls if isinstance(u, str) and u})
    found: set[str] = set()
    for start in range(0, len(wanted), _CHUNK):
        chunk = wanted[start:start + _CHUNK]
        query = db.query(Post.media_urls).filter(
            Post.media_urls.is_not(None),
            or_(*[cast(Post.media_urls, Text).contains('"%s"' % u, autoescape=True) for u in chunk]),
        )
        if exclude_post_id is not None:
            query = query.filter(Post.id != exclude_post_id)
        if exclude_user_id is not None:
            query = query.filter(Post.user_id != exclude_user_id)
        for (stored,) in query:
            found.update(u for u in media_urls_of(None, stored) if u in chunk)
    return found


def urls_used_by_other_posts(db: Session, urls: Iterable[str], *, exclude_post_id=None, exclude_user_id=None) -> set[str]:
    """URLs que OUTRO post usa, como capa (`media_url`) ou dentro do carrossel (`media_urls`)."""
    from app.models.social import Post

    wanted = sorted({u for u in urls if isinstance(u, str) and u})
    if not wanted:
        return set()
    used: set[str] = set()
    for start in range(0, len(wanted), 200):
        query = db.query(Post.media_url).filter(Post.media_url.in_(wanted[start:start + 200]))
        if exclude_post_id is not None:
            query = query.filter(Post.id != exclude_post_id)
        if exclude_user_id is not None:
            query = query.filter(Post.user_id != exclude_user_id)
        used.update(u for (u,) in query)
    used.update(urls_in_carousels(db, wanted, exclude_post_id=exclude_post_id, exclude_user_id=exclude_user_id))
    return used
