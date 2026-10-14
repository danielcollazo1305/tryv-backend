"""Filtros de bloqueio e de denuncia, reutilizados por todos os endpoints que listam gente ou conteudo.

Bloqueio vale nos DOIS sentidos: se eu bloqueei X ou X me bloqueou, nenhum dos dois ve o outro. Tudo como
`NOT EXISTS` correlacionado (nao `NOT IN`): o planner usa o indice unico (blocker_id, blocked_id) nos dois sentidos,
nao materializa lista, e nao tem a armadilha de NULL do NOT IN. Nenhum desses filtros faz uma consulta extra: entram na
consulta principal.
"""
import uuid

from sqlalchemy import and_, exists, or_
from sqlalchemy.orm import Session

from app.models.moderation import PostReport, UserBlock


def not_blocked(user_id_col, viewer_id: uuid.UUID):
    """Condicao SQL: `user_id_col` nao tem bloqueio com `viewer_id` em nenhum dos dois sentidos."""
    return ~exists().where(
        or_(
            and_(UserBlock.blocker_id == viewer_id, UserBlock.blocked_id == user_id_col),
            and_(UserBlock.blocker_id == user_id_col, UserBlock.blocked_id == viewer_id),
        )
    )


def not_reported_post(post_id_col, viewer_id: uuid.UUID):
    """Condicao SQL: `viewer_id` NAO denunciou o post (posts que eu denunciei somem para mim)."""
    return ~exists().where(PostReport.reporter_id == viewer_id, PostReport.post_id == post_id_col)


def not_reported_comment(comment_id_col, viewer_id: uuid.UUID):
    """Condicao SQL: `viewer_id` NAO denunciou o comentario."""
    return ~exists().where(PostReport.reporter_id == viewer_id, PostReport.comment_id == comment_id_col)


def is_blocked_between(db: Session, a: uuid.UUID, b: uuid.UUID) -> bool:
    """True se ha bloqueio entre a e b em qualquer sentido (1 consulta)."""
    return (
        db.query(UserBlock.id)
        .filter(
            or_(
                and_(UserBlock.blocker_id == a, UserBlock.blocked_id == b),
                and_(UserBlock.blocker_id == b, UserBlock.blocked_id == a),
            )
        )
        .first()
        is not None
    )


def has_blocked(db: Session, blocker_id: uuid.UUID, blocked_id: uuid.UUID) -> bool:
    """True se `blocker_id` bloqueou `blocked_id` (so esse sentido)."""
    return (
        db.query(UserBlock.id).filter(UserBlock.blocker_id == blocker_id, UserBlock.blocked_id == blocked_id).first()
        is not None
    )
