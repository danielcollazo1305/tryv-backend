import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_admin
from app.models.user import User
from app.routers.users import remove_user_avatar

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
