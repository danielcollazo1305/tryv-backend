import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.avatar_visibility import avatar_fields
from app.core.database import get_db
from app.core.deps import require_admin
from app.core.post_media import post_media_urls
from app.models.moderation import PostReport
from app.models.social import Comment, Post
from app.models.user import User
from app.routers.users import remove_user_avatar
from app.schemas.moderation import AdminReportOut, ResolveReportIn, ResolveReportOut
from app.schemas.social import UserBrief
from app.services.post_removal import delete_media_after_commit, purge_post

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)


@router.delete("/users/{user_id}/avatar", status_code=status.HTTP_204_NO_CONTENT)
def admin_remove_user_avatar(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Moderacao: remove o avatar de qualquer usuario (zera as 2 colunas e apaga os objetos do S3). So admin
    (403 para os demais); 404 se o usuario nao existir. Idempotente. Nao devolve dado pessoal."""
    try:
        parsed_id = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")
    user = db.query(User).filter(User.id == parsed_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")
    failed = remove_user_avatar(db, user)
    # So ids no log (nada de nome, e-mail ou URL).
    logger.info("admin_avatar_removed admin_id=%s user_id=%s", admin.id, user.id)
    if failed:
        logger.error("admin_avatar_s3_delete_failed user_id=%s", user.id)


# ---------------------------------------------------------------- fila de moderacao (denuncias de UGC)
def _brief(user: User | None, viewer_id: uuid.UUID) -> UserBrief | None:
    if user is None:
        return None
    return UserBrief(id=user.id, name=user.name, **avatar_fields(user, viewer_id))


@router.get("/reports", response_model=list[AdminReportOut])
def admin_list_reports(
    status_filter: str = Query("open", alias="status", pattern="^(open|actioned|dismissed|all)$"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Denuncias paginadas. `open` (padrao) em ordem da mais ANTIGA para a mais nova (resposta em tempo habil);
    os demais estados, da mais nova para a mais antiga. So admin (403 para os demais). Numero constante de consultas
    (denuncias + posts + comentarios + usuarios, em lote). Sem e-mail nem data de nascimento de ninguem."""
    query = db.query(PostReport)
    if status_filter != "all":
        query = query.filter(PostReport.status == status_filter)
    order = (PostReport.created_at.asc(), PostReport.id) if status_filter == "open" else (PostReport.created_at.desc(), PostReport.id)
    reports = query.order_by(*order).offset(offset).limit(limit).all()
    if not reports:
        return []

    post_ids = [r.post_id for r in reports if r.post_id is not None]
    comment_ids = [r.comment_id for r in reports if r.comment_id is not None]
    posts = {p.id: p for p in db.query(Post).filter(Post.id.in_(post_ids)).all()} if post_ids else {}
    comments = {c.id: c for c in db.query(Comment).filter(Comment.id.in_(comment_ids)).all()} if comment_ids else {}

    user_ids = {r.reporter_id for r in reports if r.reporter_id is not None}
    for r in reports:
        if r.post_id in posts:
            user_ids.add(posts[r.post_id].user_id)
        elif r.comment_id in comments:
            user_ids.add(comments[r.comment_id].user_id)
        elif r.target_author_id is not None:
            user_ids.add(r.target_author_id)
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}

    out: list[AdminReportOut] = []
    for r in reports:
        post = posts.get(r.post_id) if r.post_id is not None else None
        comment = comments.get(r.comment_id) if r.comment_id is not None else None
        if post is not None:
            author_id, text, media = post.user_id, post.caption, post.media_url
            media_all = post_media_urls(post)
        elif comment is not None:
            author_id, text, media = comment.user_id, comment.content, None
            media_all = []
        else:
            author_id, text, media = r.target_author_id, r.target_excerpt, None
            media_all = []
        out.append(
            AdminReportOut(
                id=r.id,
                status=r.status,
                reason=r.reason,
                details=r.details,
                created_at=r.created_at,
                reviewed_at=r.reviewed_at,
                reviewed_by=r.reviewed_by,
                target_type="post" if r.post_id is not None else "comment",
                target_id=r.post_id if r.post_id is not None else r.comment_id,
                content_removed=post is None and comment is None,
                target_text=text,
                target_media_url=media,
                target_media_urls=media_all,
                target_author=_brief(users.get(author_id), admin.id) if author_id is not None else None,
                reporter=(
                    None
                    if r.reporter_id is None
                    else _brief(users.get(r.reporter_id), admin.id) or UserBrief(id=r.reporter_id, name="")
                ),
                reporter_deleted=r.reporter_id is None,
            )
        )
    return out


@router.post("/reports/{report_id}/resolve", response_model=ResolveReportOut)
def admin_resolve_report(
    report_id: str,
    payload: ResolveReportIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Resolve uma denuncia aberta. `dismiss`: marca `dismissed`. `remove_content`: apaga o post (com curtidas e
    comentarios) ou o comentario, e marca como `actioned` TODAS as denuncias abertas sobre esse conteudo. Grava quem
    revisou (`reviewed_by`) e quando. 404 se nao existir, 409 se ja resolvida. A midia do post em `posts/` e apagada do S3
    (storage.delete_post_media_by_url, best-effort)."""
    try:
        parsed_id = uuid.UUID(report_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Denuncia nao encontrada")
    report = db.query(PostReport).filter(PostReport.id == parsed_id).first()
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Denuncia nao encontrada")
    if report.status != "open":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Denuncia ja resolvida")

    now = datetime.utcnow()
    review = {"reviewed_at": now, "reviewed_by": admin.id}
    removed = False
    media_to_delete: str | None = None
    removed_post_id = report.post_id

    if payload.action == "dismiss":
        report.status = "dismissed"
        report.reviewed_at = now
        report.reviewed_by = admin.id
    else:
        if report.post_id is not None:
            post = db.query(Post).filter(Post.id == report.post_id).first()
            comment_ids = [c.id for c in db.query(Comment.id).filter(Comment.post_id == report.post_id).all()]
            if post is not None:
                media_to_delete = purge_post(db, post)
                removed = True
            target = PostReport.post_id == report.post_id
            if comment_ids:
                target = or_(target, PostReport.comment_id.in_(comment_ids))
        else:
            comment = db.query(Comment).filter(Comment.id == report.comment_id).first()
            if comment is not None:
                db.delete(comment)
                removed = True
            target = PostReport.comment_id == report.comment_id
        db.query(PostReport).filter(PostReport.status == "open", target).update(
            {"status": "actioned", **review}, synchronize_session=False
        )
        report.status = "actioned"
        report.reviewed_at = now
        report.reviewed_by = admin.id

    db.commit()
    db.refresh(report)
    # Midia do post no S3 (best-effort, DEPOIS do commit: falha so loga o id e nao desfaz a remocao).
    delete_media_after_commit(removed_post_id, media_to_delete)
    # So ids no log.
    logger.info(
        "admin_report_resolved admin_id=%s report_id=%s action=%s content_removed=%s", admin.id, report.id, payload.action, removed
    )
    return ResolveReportOut(
        id=report.id, status=report.status, reviewed_at=report.reviewed_at, reviewed_by=admin.id, content_removed=removed
    )
