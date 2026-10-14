"""Remocao de um post (pelo autor ou pela moderacao): filhos no banco + midia no S3.

O banco primeiro, o S3 depois do commit: uma falha do S3 NUNCA impede (nem desfaz) a remocao do post; so registra o id
do post no log (`post_s3_delete_failed post_id=...`), sem URL nem chave.
"""
import logging
import uuid

from sqlalchemy.orm import Session

from app.models.social import Comment, Like, Post
from app.services.storage import delete_post_media_by_url

logger = logging.getLogger(__name__)


def purge_post(db: Session, post: Post) -> str | None:
    """Apaga curtidas, comentarios e o proprio post (SEM commit; as FKs de likes/comments nao tem ON DELETE CASCADE).
    Denuncias nao sao tocadas: continuam como registro de auditoria (a fila mostra `content_removed`).

    Retorna a `media_url` a apagar do S3 DEPOIS do commit, ou None se nao ha midia ou se outro post usa a MESMA URL
    (o `media_url` e texto livre no POST /posts: sem essa checagem, apontar para a URL de outra pessoa e apagar o proprio
    post apagaria a imagem dela)."""
    media_url = post.media_url
    db.query(Like).filter(Like.post_id == post.id).delete(synchronize_session=False)
    db.query(Comment).filter(Comment.post_id == post.id).delete(synchronize_session=False)
    shared = bool(media_url) and db.query(Post.id).filter(Post.media_url == media_url, Post.id != post.id).first() is not None
    db.delete(post)
    return None if (not media_url or shared) else media_url


def delete_media_after_commit(post_id: uuid.UUID, media_url: str | None) -> None:
    """Apaga a midia do post no S3 (best-effort). Chame DEPOIS do `db.commit()`. Nunca levanta."""
    if not media_url:
        return
    try:
        ok = delete_post_media_by_url(media_url)
    except Exception:  # noqa: BLE001 -- nada aqui pode quebrar a remocao do post
        ok = False
    if not ok:
        logger.warning("post_s3_delete_failed post_id=%s", post_id)
