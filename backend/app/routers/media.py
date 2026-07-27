import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.media import MediaUploadOut
from app.services.storage import StorageError, upload_image

router = APIRouter(prefix="/media", tags=["media"])
logger = logging.getLogger(__name__)

ALLOWED_FOLDERS = {"meals", "posts", "profiles"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024


@router.post("/upload", response_model=MediaUploadOut, status_code=status.HTTP_201_CREATED)
async def upload_media(
    file: UploadFile = File(...),
    folder: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    if folder not in ALLOWED_FOLDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"folder deve ser um de: {', '.join(sorted(ALLOWED_FOLDERS))}",
        )

    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O arquivo enviado precisa ser uma imagem",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Arquivo excede o tamanho maximo permitido (10MB)",
        )

    try:
        url = upload_image(file_bytes, content_type, folder)
    except StorageError as e:
        logger.error("Falha no upload de midia (user_id=%s, folder=%s): %s", current_user.id, folder, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    return MediaUploadOut(url=url)
