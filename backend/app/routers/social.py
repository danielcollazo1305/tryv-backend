import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.social import Follow, Post
from app.models.user import User
from app.schemas.social import FollowOut, PostCreate, PostOut, UserBrief

router = APIRouter(tags=["social"])


def _post_out(post: Post, author_name: str) -> PostOut:
    return PostOut(
        id=post.id,
        user_id=post.user_id,
        author=author_name,
        type=post.type,
        caption=post.caption,
        media_url=post.media_url,
        visibility=post.visibility,
        reference_id=post.reference_id,
        created_at=post.created_at,
    )


def _is_following(db: Session, follower_id: uuid.UUID, following_id: uuid.UUID) -> bool:
    return (
        db.query(Follow)
        .filter(Follow.follower_id == follower_id, Follow.following_id == following_id)
        .first()
        is not None
    )


def _can_view_post(db: Session, viewer: User, post: Post) -> bool:
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
    post = Post(
        user_id=current_user.id,
        type=payload.type,
        caption=payload.caption,
        media_url=payload.media_url,
        visibility=payload.visibility,
        reference_id=payload.reference_id,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return _post_out(post, current_user.name)


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
        db.query(Post, User.name)
        .join(User, Post.user_id == User.id)
        .filter(Post.id == parsed_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post nao encontrado")

    post, author_name = row
    if not _can_view_post(db, current_user, post):
        # Mesma resposta de "nao encontrado" — nao revela que o post existe.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post nao encontrado")

    return _post_out(post, author_name)


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

    db.delete(post)
    db.commit()


@router.get("/users/{user_id}/posts", response_model=list[PostOut])
def list_user_posts(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    parsed_id = _parse_user_id(user_id, db)
    target_user = db.query(User).filter(User.id == parsed_id).first()

    can_view_private = parsed_id == current_user.id or _is_following(db, current_user.id, parsed_id)

    query = db.query(Post).filter(Post.user_id == parsed_id)
    if not can_view_private:
        query = query.filter(Post.visibility == "public")

    posts = query.order_by(Post.created_at.desc()).all()
    return [_post_out(post, target_user.name) for post in posts]


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
def list_followers(user_id: str, db: Session = Depends(get_db)):
    parsed_id = _parse_user_id(user_id, db)
    rows = (
        db.query(User.id, User.name)
        .join(Follow, Follow.follower_id == User.id)
        .filter(Follow.following_id == parsed_id)
        .all()
    )
    return [UserBrief(id=row.id, name=row.name) for row in rows]


@router.get("/users/{user_id}/following", response_model=list[UserBrief])
def list_following(user_id: str, db: Session = Depends(get_db)):
    parsed_id = _parse_user_id(user_id, db)
    rows = (
        db.query(User.id, User.name)
        .join(Follow, Follow.following_id == User.id)
        .filter(Follow.follower_id == parsed_id)
        .all()
    )
    return [UserBrief(id=row.id, name=row.name) for row in rows]
