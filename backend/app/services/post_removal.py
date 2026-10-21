"""Remocao de um post (pelo autor ou pela moderacao): filhos no banco + midia no S3.

O banco primeiro, o S3 depois do commit: uma falha do S3 NUNCA impede (nem desfaz) a remocao do post; so registra o id
do post no log (`post_s3_delete_failed post_id=...`), sem URL nem chave.
"""
import logging
import uuid

from sqlalchemy.orm import Session

from app.core.post_media import post_media_urls, urls_used_by_other_posts
from app.models.social import Comment, Like, Post
from app.services.storage import delete_post_media_by_url

logger = logging.getLogger(__name__)


def purge_post(db: Session, post: Post) -> list[str]:
    """Apaga curtidas, comentarios e o proprio post (SEM commit; as FKs de likes/comments nao tem ON DELETE CASCADE).
    Denuncias nao sao tocadas: continuam como registro de auditoria (a fila mostra `content_removed`).

    Retorna as URLs de TODAS as fotos do post (capa + carrossel, core/post_media) a apagar do S3 DEPOIS do commit, menos as que
    OUTRO post usa (o `media_url` e texto livre no POST /posts: sem essa checagem, apontar para a URL de outra pessoa e apagar o
    proprio post apagaria a imagem dela). Lista vazia = nada a apagar."""
    urls = post_media_urls(post)
    db.query(Like).filter(Like.post_id == post.id).delete(synchronize_session=False)
    db.query(Comment).filter(Comment.post_id == post.id).delete(synchronize_session=False)
    shared = urls_used_by_other_posts(db, urls, exclude_post_id=post.id)
    db.delete(post)
    # O registro em media_uploads NAO e apagado aqui (como ja era): ele tambem conta o limite de uploads por hora e o teto diario de
    # analise; apagar ao excluir o post deixaria enviar, publicar e excluir sem limite. Sai junto com a conta.
    return [u for u in urls if u not in shared]


def delete_media_after_commit(post_id: uuid.UUID, media_urls: list[str] | str | None) -> None:
    """Apaga as fotos do post no S3 (best-effort; uma que falha ou ja nao existe NAO impede as outras). Chame DEPOIS do `db.commit()`.
    Nunca levanta."""
    if not media_urls:
        return
    urls = [media_urls] if isinstance(media_urls, str) else list(media_urls)
    failed = 0
    for url in urls:
        try:
            ok = delete_post_media_by_url(url)
        except Exception:  # noqa: BLE001 -- nada aqui pode quebrar a remocao do post
            ok = False
        if not ok:
            failed += 1
    if failed:
        logger.warning("post_s3_delete_failed post_id=%s (%d de %d fotos)", post_id, failed, len(urls))
