import base64
import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.orm import Session

from app.core.avatar_visibility import adult_birth_cutoff, avatar_fields, visible_avatar
from app.core.config import settings
from app.core.database import get_db
from app.core.post_media import post_media_urls, urls_in_carousels
from app.core.deps import get_current_user
from app.models.media_upload import MediaUpload
from app.models.social import Comment, Follow, Like, Post
from app.models.user import User
from app.services.content_filter_guard import CAPTION_MAX, COMMENT_MAX, enforce_text_filter, ensure_max_length
from app.services.moderation import is_blocked_between, not_blocked, not_reported_comment, not_reported_post
from app.services.post_removal import delete_media_after_commit, purge_post
from app.schemas.social import (
    CommentCreate,
    CommentOut,
    FollowOut,
    LikeOut,
    PostCreate,
    PostOut,
    PostUpdate,
    UserBrief,
)

router = APIRouter(tags=["social"])


def _author_avatar(row_or_user, owner_id: uuid.UUID, viewer_id: uuid.UUID) -> dict:
    """avatar_url/avatar_thumb_url do autor para o espectador, pela regra unica de core/avatar_visibility.
    row_or_user precisa ter avatar_url, avatar_thumb_url e date_of_birth (colunas do mesmo SELECT)."""
    url, thumb = visible_avatar(
        row_or_user.avatar_url, row_or_user.avatar_thumb_url, row_or_user.date_of_birth, owner_id, viewer_id
    )
    return {"avatar_url": url, "avatar_thumb_url": thumb}


def _post_out(
    post: Post,
    author_name: str,
    likes_count: int = 0,
    comments_count: int = 0,
    is_liked_by_me: bool = False,
    avatar: dict | None = None,
) -> PostOut:
    return PostOut(
        **(avatar or {}),
        id=post.id,
        user_id=post.user_id,
        author=author_name,
        type=post.type,
        caption=post.caption,
        media_url=post.media_url,
        media_urls=post_media_urls(post),
        visibility=post.visibility,
        reference_id=post.reference_id,
        created_at=post.created_at,
        likes_count=likes_count,
        comments_count=comments_count,
        is_liked_by_me=is_liked_by_me,
    )


def _comment_out(comment: Comment, author_name: str, avatar: dict | None = None) -> CommentOut:
    return CommentOut(
        **(avatar or {}),
        id=comment.id,
        post_id=comment.post_id,
        user_id=comment.user_id,
        author=author_name,
        content=comment.content,
        created_at=comment.created_at,
    )


def _post_counts(
    db: Session, post_ids: list[uuid.UUID], current_user_id: uuid.UUID | None = None
) -> dict[uuid.UUID, dict[str, int | bool]]:
    """Conta curtidas/comentarios e marca se current_user_id curtiu cada post — tudo de uma vez (evita N+1)."""
    if not post_ids:
        return {}

    likes = dict(
        db.query(Like.post_id, func.count(Like.id))
        .filter(Like.post_id.in_(post_ids))
        .group_by(Like.post_id)
        .all()
    )
    comments = dict(
        db.query(Comment.post_id, func.count(Comment.id))
        .filter(Comment.post_id.in_(post_ids))
        .group_by(Comment.post_id)
        .all()
    )
    liked_post_ids: set[uuid.UUID] = set()
    if current_user_id is not None:
        liked_post_ids = {
            row[0]
            for row in db.query(Like.post_id)
            .filter(Like.post_id.in_(post_ids), Like.user_id == current_user_id)
            .all()
        }
    return {
        post_id: {
            "likes": likes.get(post_id, 0),
            "comments": comments.get(post_id, 0),
            "liked": post_id in liked_post_ids,
        }
        for post_id in post_ids
    }


def _is_following(db: Session, follower_id: uuid.UUID, following_id: uuid.UUID) -> bool:
    return (
        db.query(Follow)
        .filter(Follow.follower_id == follower_id, Follow.following_id == following_id)
        .first()
        is not None
    )


def _can_view_post(db: Session, viewer: User, post: Post) -> bool:
    # Bloqueio nos dois sentidos: o post some (404 generico nos endpoints, sem revelar o bloqueio).
    if post.user_id != viewer.id and is_blocked_between(db, viewer.id, post.user_id):
        return False
    if post.visibility == "public":
        return True
    if post.user_id == viewer.id:
        return True
    return _is_following(db, viewer.id, post.user_id)


def _parse_user_id(user_id: str, db: Session) -> uuid.UUID:
    try:
        parsed_id = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")

    if not db.query(User).filter(User.id == parsed_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")

    return parsed_id


@router.post("/posts", response_model=PostOut, status_code=status.HTTP_201_CREATED)
def create_post(
    payload: PostCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Filtro de conteudo (E3e): tamanho e linguagem da legenda (so conteudo novo).
    ensure_max_length(payload.caption, CAPTION_MAX, "post_caption")
    enforce_text_filter(db, user_id=current_user.id, fields=[("post_caption", payload.caption)])

    # Foto do post (E3e fase 4): so vale a que foi APROVADA no upload (POST /media/upload, pasta posts) pelo proprio usuario.
    # Fecha o buraco de apontar o post para qualquer endereco (de outro site, de outra pasta ou de outra pessoa).
    # Carrossel (ate 10): CADA foto passa pela mesma validacao (upload do proprio usuario, pasta posts, ja aprovado) e nenhuma pode estar em
    # outro post; qualquer uma invalida = 422 e nada e criado. A capa (media_url) e sempre a primeira.
    media_url = payload.media_url
    media_urls = payload.media_urls
    if media_urls is not None:
        media_url = media_urls[0]
        if settings.post_media_requires_approval:
            approved = {u for (u,) in db.query(MediaUpload.url).filter(
                MediaUpload.user_id == current_user.id, MediaUpload.folder == "posts", MediaUpload.url.in_(media_urls)
            )}
            if approved != set(media_urls):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Uma das imagens não foi verificada. Envie as fotos novamente para publicar.",
                )
        in_use = {u for (u,) in db.query(Post.media_url).filter(Post.media_url.in_(media_urls))} | urls_in_carousels(db, media_urls)
        if in_use:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Uma das imagens já foi usada em outro post. Envie as fotos novamente para publicar.",
            )
    elif payload.media_url and settings.post_media_requires_approval:
        approved_one = (
            db.query(MediaUpload.id)
            .filter(MediaUpload.user_id == current_user.id, MediaUpload.folder == "posts", MediaUpload.url == payload.media_url)
            .first()
        )
        if approved_one is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Esta imagem não foi verificada. Envie a foto novamente para publicar.",
            )

    post = Post(
        user_id=current_user.id,
        type=payload.type,
        caption=payload.caption,
        media_url=media_url,
        media_urls=media_urls,
        visibility=payload.visibility,
        reference_id=payload.reference_id,
        origin=payload.origin or "legacy",
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    # post recem-criado: 0 curtidas, 0 comentarios; o autor e o proprio usuario (sempre ve o seu avatar)
    return _post_out(post, current_user.name, avatar=avatar_fields(current_user, current_user.id))


@router.get("/posts/{post_id}", response_model=PostOut)
def get_post(
    post_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        parsed_id = uuid.UUID(post_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post nao encontrado")

    row = (
        db.query(Post, User.name, User.avatar_url, User.avatar_thumb_url, User.date_of_birth)
        .join(User, Post.user_id == User.id)
        .filter(Post.id == parsed_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post nao encontrado")

    post, author_name = row[0], row[1]
    if not _can_view_post(db, current_user, post):
        # Mesma resposta de "nao encontrado" — nao revela que o post existe.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post nao encontrado")

    counts = _post_counts(db, [post.id], current_user.id).get(post.id, {"likes": 0, "comments": 0, "liked": False})
    return _post_out(
        post,
        author_name,
        counts["likes"],
        counts["comments"],
        counts["liked"],
        avatar=_author_avatar(row, post.user_id, current_user.id),
    )


@router.patch("/posts/{post_id}", response_model=PostOut)
def update_post(
    post_id: str,
    payload: PostUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """O dono edita a legenda e/ou a privacidade do proprio post. Nada mais muda (foto, origem, autor, data, curtidas, comentarios)."""
    try:
        parsed_id = uuid.UUID(post_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post nao encontrado")

    post = db.query(Post).filter(Post.id == parsed_id).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post nao encontrado")

    if post.user_id != current_user.id:
        # Post que a pessoa nem poderia ver (so-seguidores de quem nao segue, ou bloqueio): 404, sem revelar que existe.
        if not _can_view_post(db, current_user, post):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post nao encontrado")
        # Post visivel de outra pessoa: mesmo padrao do DELETE (403).
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Voce nao tem permissao para editar este post",
        )

    if payload.caption is None and payload.visibility is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Informe a legenda e/ou a privacidade para editar o post.",
        )

    # Legenda nova: mesmo tamanho maximo e MESMO filtro de texto do POST /posts, ANTES de gravar (texto barrado nao e gravado e o
    # post fica como estava). Legenda igual a atual ou so a privacidade mudando: o filtro nao roda (nao pune conteudo antigo).
    new_caption = post.caption
    if payload.caption is not None:
        candidate = payload.caption.strip() or None
        if candidate != post.caption:
            if candidate is not None:
                ensure_max_length(candidate, CAPTION_MAX, "post_caption")
                enforce_text_filter(db, user_id=current_user.id, fields=[("post_caption", candidate)])
            new_caption = candidate

    post.caption = new_caption
    if payload.visibility is not None:
        post.visibility = payload.visibility
    db.commit()
    db.refresh(post)

    row = (
        db.query(Post, User.name, User.avatar_url, User.avatar_thumb_url, User.date_of_birth)
        .join(User, Post.user_id == User.id)
        .filter(Post.id == post.id)
        .first()
    )
    counts = _post_counts(db, [post.id], current_user.id).get(post.id, {"likes": 0, "comments": 0, "liked": False})
    return _post_out(
        row[0],
        row[1],
        counts["likes"],
        counts["comments"],
        counts["liked"],
        avatar=_author_avatar(row, post.user_id, current_user.id),
    )


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        parsed_id = uuid.UUID(post_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post nao encontrado")

    post = db.query(Post).filter(Post.id == parsed_id).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post nao encontrado")

    if post.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Voce nao tem permissao para excluir este post",
        )

    # Curtidas e comentarios primeiro (as FKs nao tem CASCADE: antes, post com filhos dava 500). Denuncias ficam como
    # registro. A midia no S3 so e apagada DEPOIS do commit e uma falha dela nao impede a remocao.
    post_pk = post.id
    media_to_delete = purge_post(db, post)
    db.commit()
    delete_media_after_commit(post_pk, media_to_delete)


@router.get("/users/{user_id}/posts", response_model=list[PostOut])
def list_user_posts(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    parsed_id = _parse_user_id(user_id, db)
    if parsed_id != current_user.id and is_blocked_between(db, current_user.id, parsed_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")
    target_user = db.query(User).filter(User.id == parsed_id).first()

    can_view_private = parsed_id == current_user.id or _is_following(db, current_user.id, parsed_id)

    query = db.query(Post).filter(Post.user_id == parsed_id, not_reported_post(Post.id, current_user.id))
    if not can_view_private:
        query = query.filter(Post.visibility == "public")

    posts = query.order_by(Post.created_at.desc()).all()
    counts = _post_counts(db, [post.id for post in posts], current_user.id)
    return [
        _post_out(
            post,
            target_user.name,
            counts[post.id]["likes"],
            counts[post.id]["comments"],
            counts[post.id]["liked"],
            avatar=avatar_fields(target_user, current_user.id),
        )
        for post in posts
    ]


@router.post("/users/{user_id}/follow", response_model=FollowOut, status_code=status.HTTP_201_CREATED)
def follow_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        parsed_id = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")

    if parsed_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nao e possivel seguir a si mesmo")

    if not db.query(User).filter(User.id == parsed_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")

    # Bloqueio nos dois sentidos impede seguir (404 generico: nao revela o bloqueio).
    if is_blocked_between(db, current_user.id, parsed_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")

    if _is_following(db, current_user.id, parsed_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voce ja segue este usuario")

    follow = Follow(follower_id=current_user.id, following_id=parsed_id)
    db.add(follow)
    db.commit()
    db.refresh(follow)
    return follow


@router.delete("/users/{user_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
def unfollow_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        parsed_id = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voce nao segue este usuario")

    follow = (
        db.query(Follow)
        .filter(Follow.follower_id == current_user.id, Follow.following_id == parsed_id)
        .first()
    )
    if not follow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voce nao segue este usuario")

    db.delete(follow)
    db.commit()


@router.get("/users/{user_id}/followers", response_model=list[UserBrief])
def list_followers(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # exige login: a lista expoe nomes (era publica por engano)
):
    parsed_id = _parse_user_id(user_id, db)
    if parsed_id != current_user.id and is_blocked_between(db, current_user.id, parsed_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")
    rows = (
        db.query(User.id, User.name, User.avatar_url, User.avatar_thumb_url, User.date_of_birth)
        .join(Follow, Follow.follower_id == User.id)
        .filter(Follow.following_id == parsed_id, not_blocked(User.id, current_user.id))
        .all()
    )
    return [UserBrief(id=row.id, name=row.name, **avatar_fields(row, current_user.id)) for row in rows]


@router.get("/users/{user_id}/following", response_model=list[UserBrief])
def list_following(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # exige login: a lista expoe nomes (era publica por engano)
):
    parsed_id = _parse_user_id(user_id, db)
    if parsed_id != current_user.id and is_blocked_between(db, current_user.id, parsed_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")
    rows = (
        db.query(User.id, User.name, User.avatar_url, User.avatar_thumb_url, User.date_of_birth)
        .join(Follow, Follow.following_id == User.id)
        .filter(Follow.follower_id == parsed_id, not_blocked(User.id, current_user.id))
        .all()
    )
    return [UserBrief(id=row.id, name=row.name, **avatar_fields(row, current_user.id)) for row in rows]


def _get_viewable_post(db: Session, current_user: User, post_id: str) -> Post:
    """Busca um post e aplica a regra de visibilidade; 404 generico se nao
    existir ou se o usuario logado nao puder ve-lo (nao revela existencia)."""
    try:
        parsed_id = uuid.UUID(post_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post nao encontrado")

    post = db.query(Post).filter(Post.id == parsed_id).first()
    if not post or not _can_view_post(db, current_user, post):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post nao encontrado")

    return post


@router.post("/posts/{post_id}/like", response_model=LikeOut, status_code=status.HTTP_201_CREATED)
def like_post(
    post_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_viewable_post(db, current_user, post_id)

    existing = (
        db.query(Like)
        .filter(Like.post_id == post.id, Like.user_id == current_user.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voce ja curtiu este post")

    like = Like(post_id=post.id, user_id=current_user.id)
    db.add(like)
    db.commit()
    db.refresh(like)
    return like


@router.delete("/posts/{post_id}/like", status_code=status.HTTP_204_NO_CONTENT)
def unlike_post(
    post_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        parsed_id = uuid.UUID(post_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curtida nao encontrada")

    like = (
        db.query(Like)
        .filter(Like.post_id == parsed_id, Like.user_id == current_user.id)
        .first()
    )
    if not like:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curtida nao encontrada")

    db.delete(like)
    db.commit()


@router.post("/posts/{post_id}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
def create_comment(
    post_id: str,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Filtro de conteudo (E3e): tamanho e linguagem do comentario (so conteudo novo).
    ensure_max_length(payload.content, COMMENT_MAX, "comment")
    enforce_text_filter(db, user_id=current_user.id, fields=[("comment", payload.content)])

    post = _get_viewable_post(db, current_user, post_id)

    comment = Comment(post_id=post.id, user_id=current_user.id, content=payload.content)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return _comment_out(comment, current_user.name, avatar_fields(current_user, current_user.id))


@router.get("/posts/{post_id}/comments", response_model=list[CommentOut])
def list_comments(
    post_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = _get_viewable_post(db, current_user, post_id)

    rows = (
        db.query(Comment, User.name, User.avatar_url, User.avatar_thumb_url, User.date_of_birth)
        .join(User, Comment.user_id == User.id)
        .filter(
            Comment.post_id == post.id,
            not_blocked(Comment.user_id, current_user.id),
            not_reported_comment(Comment.id, current_user.id),
        )
        .order_by(Comment.created_at.asc())
        .all()
    )
    return [
        _comment_out(row[0], row[1], _author_avatar(row, row[0].user_id, current_user.id)) for row in rows
    ]


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        parsed_id = uuid.UUID(comment_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comentario nao encontrado")

    comment = db.query(Comment).filter(Comment.id == parsed_id).first()
    if not comment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comentario nao encontrado")

    if comment.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Voce nao tem permissao para excluir este comentario",
        )

    db.delete(comment)
    db.commit()


EXPLORE_MAX_LIMIT = 50
EXPLORE_DISABLED_MESSAGE = "O Explorar ainda não está disponível."
NEXT_CURSOR_HEADER = "X-Next-Cursor"


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


def _explore_feed(db: Session, current_user: User, limit: int, cursor: str | None, response: Response) -> list[PostOut]:
    """Explorar: posts PUBLICOS e feitos a mao (origin='manual') de adultos que o usuario NAO segue. Cursor estavel por
    (created_at, id). Reaproveita not_blocked/not_reported_post (mesmas regras do Seguindo) e a regra unica de maioridade."""
    if not settings.explore_feed_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=EXPLORE_DISABLED_MESSAGE)
    limit = min(limit, EXPLORE_MAX_LIMIT)

    conditions = [
        Post.visibility == "public",
        Post.origin == "manual",
        Post.created_at.is_not(None),
        Post.user_id != current_user.id,
        User.is_active.is_(True),
        User.date_of_birth.is_not(None),
        User.date_of_birth <= adult_birth_cutoff(),
        ~exists().where(Follow.follower_id == current_user.id, Follow.following_id == Post.user_id),
        not_blocked(Post.user_id, current_user.id),
        not_reported_post(Post.id, current_user.id),
        # Defesa extra: foto so se foi aprovada no upload do PROPRIO autor (mesmo com a valvula do POST /posts desligada).
        or_(
            Post.media_url.is_(None),
            exists().where(
                MediaUpload.user_id == Post.user_id, MediaUpload.folder == "posts", MediaUpload.url == Post.media_url
            ),
        ),
    ]
    if cursor:
        c_created, c_id = _decode_cursor(cursor)
        conditions.append(or_(Post.created_at < c_created, and_(Post.created_at == c_created, Post.id < c_id)))

    rows = (
        db.query(Post, User.name, User.avatar_url, User.avatar_thumb_url, User.date_of_birth)
        .join(User, Post.user_id == User.id)
        .filter(*conditions)
        .order_by(Post.created_at.desc(), Post.id.desc())
        .limit(limit + 1)
        .all()
    )
    has_more = len(rows) > limit
    rows = rows[:limit]
    if has_more and rows:
        last = rows[-1][0]
        response.headers[NEXT_CURSOR_HEADER] = _encode_cursor(last.created_at, last.id)

    counts = _post_counts(db, [row[0].id for row in rows], current_user.id)
    return [
        _post_out(
            row[0],
            row[1],
            counts[row[0].id]["likes"],
            counts[row[0].id]["comments"],
            counts[row[0].id]["liked"],
            avatar=_author_avatar(row, row[0].user_id, current_user.id),
        )
        for row in rows
    ]


def _feed_rows_to_posts(db: Session, current_user: User, rows) -> list[PostOut]:
    counts = _post_counts(db, [row[0].id for row in rows], current_user.id)
    return [
        _post_out(
            row[0],
            row[1],
            counts[row[0].id]["likes"],
            counts[row[0].id]["comments"],
            counts[row[0].id]["liked"],
            avatar=_author_avatar(row, row[0].user_id, current_user.id),
        )
        for row in rows
    ]


def _following_feed(db: Session, current_user: User, limit: int, offset: int) -> list[PostOut]:
    """Seguindo estrito: so posts de quem eu sigo (publicos e so-seguidores: sigo, entao posso ver) e os meus. Nada de desconhecidos.
    Bloqueio nos dois sentidos e posts que EU denunciei somem (mesmos filtros do Explorar e do feed antigo)."""
    following_ids = select(Follow.following_id).where(Follow.follower_id == current_user.id)
    rows = (
        db.query(Post, User.name, User.avatar_url, User.avatar_thumb_url, User.date_of_birth)
        .join(User, Post.user_id == User.id)
        .filter(
            or_(Post.user_id.in_(following_ids), Post.user_id == current_user.id),
            not_blocked(Post.user_id, current_user.id),
            not_reported_post(Post.id, current_user.id),
        )
        .order_by(Post.created_at.desc(), Post.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return _feed_rows_to_posts(db, current_user, rows)


@router.get("/feed", response_model=list[PostOut])
def get_feed(
    response: Response,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    scope: Literal["following", "explore"] | None = Query(None),
    cursor: str | None = Query(None, max_length=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """SEM scope (app instalado antigo): posts publicos de qualquer ADULTO com data de nascimento conhecida (menores e contas sem data so aparecem para quem os segue) + posts (publicos ou privados) de
    quem o usuario logado segue + todos os posts (publicos e privados) do proprio usuario logado, mais recentes primeiro.
    scope=following (app novo, pedido EXPLICITO): SO quem o usuario segue (posts publicos e so-seguidores) + os proprios posts;
    nenhum post de desconhecido. Mesmas regras de bloqueio e denuncia; offset/limit como sempre.
    scope=explore: ver _explore_feed (chave EXPLORE_FEED_ENABLED; paginacao por cursor no cabecalho X-Next-Cursor)."""
    if scope == "explore":
        return _explore_feed(db, current_user, limit, cursor, response)
    if scope == "following":
        return _following_feed(db, current_user, limit, offset)
    following_ids = (
        db.query(Follow.following_id)
        .filter(Follow.follower_id == current_user.id)
        .subquery()
    )

    rows = (
        db.query(Post, User.name, User.avatar_url, User.avatar_thumb_url, User.date_of_birth)
        .join(User, Post.user_id == User.id)
        .filter(
            or_(
                Post.visibility == "public",
                Post.user_id.in_(following_ids),
                Post.user_id == current_user.id,
            ),
            # Menores de 18 (ou sem data de nascimento) so aparecem para quem os segue (e para eles mesmos): regra unica de maioridade.
            or_(
                Post.user_id == current_user.id,
                Post.user_id.in_(following_ids),
                and_(User.date_of_birth.is_not(None), User.date_of_birth <= adult_birth_cutoff()),
            ),
            # Bloqueados (nos dois sentidos) e posts que EU denunciei somem do meu feed.
            not_blocked(Post.user_id, current_user.id),
            not_reported_post(Post.id, current_user.id),
        )
        .order_by(Post.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    counts = _post_counts(db, [row[0].id for row in rows], current_user.id)
    return [
        _post_out(
            row[0],
            row[1],
            counts[row[0].id]["likes"],
            counts[row[0].id]["comments"],
            counts[row[0].id]["liked"],
            avatar=_author_avatar(row, row[0].user_id, current_user.id),
        )
        for row in rows
    ]
