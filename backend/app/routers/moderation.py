"""Bloquear usuarios e denunciar posts/comentarios (UGC). A fila de moderacao (admin) fica em routers/admin.py.

Privacidade: nenhuma resposta revela ao bloqueado que foi bloqueado (so os 404 dos outros endpoints) nem ao denunciado
quem o denunciou; o denunciante recebe so protocolo/estado.
"""
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.avatar_visibility import avatar_fields
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.moderation import PostReport, UserBlock
from app.models.social import Comment, Follow, Post
from app.models.user import User
from app.routers.social import _get_viewable_post
from app.schemas.moderation import ReportCreate, ReportOut
from app.schemas.social import UserBrief
from app.services.moderation import is_blocked_between

router = APIRouter(tags=["moderation"])
logger = logging.getLogger(__name__)

EXCERPT_MAX = 280


def _parse_uuid_or_404(value: str, detail: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


# ---------------------------------------------------------------- bloqueios
@router.post("/users/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT)
def block_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bloqueia o usuario. Idempotente (204 mesmo que ja estivesse bloqueado). Remove o seguimento nos dois sentidos.
    400 se for o proprio usuario; 404 se nao existir (ou id invalido)."""
    target_id = _parse_uuid_or_404(user_id, "Usuario nao encontrado")
    if target_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voce nao pode bloquear a si mesmo")
    if not db.query(User.id).filter(User.id == target_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")

    already = (
        db.query(UserBlock.id).filter(UserBlock.blocker_id == current_user.id, UserBlock.blocked_id == target_id).first()
    )
    if not already:
        db.add(UserBlock(blocker_id=current_user.id, blocked_id=target_id))
    db.query(Follow).filter(
        ((Follow.follower_id == current_user.id) & (Follow.following_id == target_id))
        | ((Follow.follower_id == target_id) & (Follow.following_id == current_user.id))
    ).delete(synchronize_session=False)
    try:
        db.commit()
    except IntegrityError:  # corrida: o mesmo bloqueio criado ao mesmo tempo
        db.rollback()
        db.query(Follow).filter(
            ((Follow.follower_id == current_user.id) & (Follow.following_id == target_id))
            | ((Follow.follower_id == target_id) & (Follow.following_id == current_user.id))
        ).delete(synchronize_session=False)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/users/{user_id}/block", status_code=status.HTTP_204_NO_CONTENT)
def unblock_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Desbloqueia. Idempotente (204 mesmo sem bloqueio). Nao restaura o seguimento removido ao bloquear."""
    target_id = _parse_uuid_or_404(user_id, "Usuario nao encontrado")
    db.query(UserBlock).filter(UserBlock.blocker_id == current_user.id, UserBlock.blocked_id == target_id).delete(
        synchronize_session=False
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users/me/blocks", response_model=list[UserBrief])
def list_my_blocks(
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Quem eu bloqueei (so este sentido: nunca lista quem me bloqueou), mais recentes primeiro."""
    rows = (
        db.query(User.id, User.name, User.avatar_url, User.avatar_thumb_url, User.date_of_birth)
        .join(UserBlock, UserBlock.blocked_id == User.id)
        .filter(UserBlock.blocker_id == current_user.id)
        .order_by(UserBlock.created_at.desc(), UserBlock.id)
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [UserBrief(id=row.id, name=row.name, **avatar_fields(row, current_user.id)) for row in rows]


# ---------------------------------------------------------------- denuncias
def _create_report(
    db: Session,
    response: Response,
    reporter: User,
    payload: ReportCreate,
    *,
    post_id: uuid.UUID | None,
    comment_id: uuid.UUID | None,
    author_id: uuid.UUID,
    excerpt: str | None,
) -> ReportOut:
    """Cria a denuncia (201) ou devolve a existente do mesmo denunciante para o mesmo alvo (200, idempotente)."""
    target_filter = PostReport.post_id == post_id if post_id is not None else PostReport.comment_id == comment_id
    existing = db.query(PostReport).filter(PostReport.reporter_id == reporter.id, target_filter).first()
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return ReportOut(id=existing.id, status=existing.status, created_at=existing.created_at)

    report = PostReport(
        reporter_id=reporter.id,
        post_id=post_id,
        comment_id=comment_id,
        target_author_id=author_id,
        target_excerpt=(excerpt or "")[:EXCERPT_MAX] or None,
        reason=payload.reason,
        details=payload.details,
    )
    db.add(report)
    try:
        db.commit()
    except IntegrityError:  # corrida: o mesmo denunciante enviou duas vezes ao mesmo tempo
        db.rollback()
        existing = db.query(PostReport).filter(PostReport.reporter_id == reporter.id, target_filter).first()
        if existing is None:
            raise
        response.status_code = status.HTTP_200_OK
        return ReportOut(id=existing.id, status=existing.status, created_at=existing.created_at)
    db.refresh(report)
    # So ids no log (nada de texto da denuncia nem dado pessoal).
    logger.info("report_created report_id=%s reporter_id=%s post_id=%s comment_id=%s", report.id, reporter.id, post_id, comment_id)
    response.status_code = status.HTTP_201_CREATED
    return ReportOut(id=report.id, status=report.status, created_at=report.created_at)


@router.post("/posts/{post_id}/report", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def report_post(
    post_id: str,
    payload: ReportCreate,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Denuncia um post. 404 se nao existir ou eu nao puder ve-lo (inclui bloqueio); 400 se for meu; 201 ao criar e
    200 se eu ja o tinha denunciado. O post some do MEU feed imediatamente."""
    post = _get_viewable_post(db, current_user, post_id)
    if post.user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voce nao pode denunciar o proprio conteudo")
    return _create_report(
        db, response, current_user, payload, post_id=post.id, comment_id=None, author_id=post.user_id, excerpt=post.caption
    )


@router.post("/comments/{comment_id}/report", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def report_comment(
    comment_id: str,
    payload: ReportCreate,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Denuncia um comentario (mesmas regras do post: 404 se eu nao puder ver o post do comentario ou o autor estiver
    bloqueado; 400 se for meu; idempotente)."""
    parsed_id = _parse_uuid_or_404(comment_id, "Comentario nao encontrado")
    comment = db.query(Comment).filter(Comment.id == parsed_id).first()
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comentario nao encontrado")
    # O comentario so e visivel se o post for (reaproveita a regra de visibilidade e de bloqueio do post).
    _get_viewable_post(db, current_user, str(comment.post_id))
    if comment.user_id != current_user.id and is_blocked_between(db, current_user.id, comment.user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comentario nao encontrado")
    if comment.user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voce nao pode denunciar o proprio conteudo")
    return _create_report(
        db, response, current_user, payload, post_id=None, comment_id=comment.id, author_id=comment.user_id, excerpt=comment.content
    )
