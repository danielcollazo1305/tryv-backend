import logging
import math
from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.core import timezone as tz
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.content_filter_event import ContentFilterEvent
from app.models.media_upload import MediaUpload
from app.models.user import User
from app.schemas.media import MediaUploadOut
from app.services.content_filter_guard import FILTER_HEADER, ensure_not_paused, record_block_event
from app.services.image_moderation import ImageModerationUnavailable, InvalidImage, analyze_image, prepare_for_analysis
from app.services.storage import StorageError, delete_post_media_by_url, upload_image, upload_meal_photo

router = APIRouter(prefix="/media", tags=["media"])
logger = logging.getLogger(__name__)

ALLOWED_FOLDERS = {"meals", "posts", "profiles", "challenges", "workouts"}
# So "workouts" (video de execucao de exercicio, anexado pelo personal
# trainer ao montar um plano) aceita video — as demais pastas continuam
# imagem apenas, sem motivo pra abrir video nelas.
VIDEO_ALLOWED_FOLDERS = {"workouts"}
MAX_IMAGE_FILE_SIZE_BYTES = 10 * 1024 * 1024
MAX_VIDEO_FILE_SIZE_BYTES = 50 * 1024 * 1024

# Fotos de POST passam por analise automatica antes de ir ao S3 (services/image_moderation.py). Mensagens revisaveis:
IMAGE_BLOCKED_MESSAGE = "Esta imagem não pode ser publicada no Tryv. Escolha outra."
IMAGE_UNAVAILABLE_MESSAGE = "Não foi possível verificar a imagem agora. Tente de novo em instantes."
IMAGE_UNREADABLE_MESSAGE = "Não foi possível ler a imagem. Envie uma foto em JPEG, PNG ou WebP."
IMAGE_FILTER_HEADER_VALUE = "image"
# Teto de seguranca de custo: envios de foto de post por usuario por hora (aprovados + reprovados), contados do banco.
POST_UPLOADS_PER_HOUR = 20


@router.post("/upload", response_model=MediaUploadOut, status_code=status.HTTP_201_CREATED)
async def upload_media(
    file: UploadFile = File(...),
    folder: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if folder not in ALLOWED_FOLDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"folder deve ser um de: {', '.join(sorted(ALLOWED_FOLDERS))}",
        )

    content_type = file.content_type or ""
    is_video = content_type.startswith("video/")
    is_image = content_type.startswith("image/")

    if is_video and folder not in VIDEO_ALLOWED_FOLDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Video so e aceito na pasta de videos de treino",
        )
    if not is_video and not is_image:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O arquivo enviado precisa ser uma imagem ou (na pasta de treino) um video",
        )

    max_size = MAX_VIDEO_FILE_SIZE_BYTES if is_video else MAX_IMAGE_FILE_SIZE_BYTES
    file_bytes = await file.read()
    if len(file_bytes) > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Arquivo excede o tamanho maximo permitido ({max_size // (1024 * 1024)}MB)",
        )

    if folder == "posts":
        await _moderate_post_image(db, current_user, file_bytes)

    thumb_url = None
    try:
        if folder == "meals" and is_image:
            # Foto de refeicao: original + miniatura 4:3 (a miniatura e best-effort). Em thread: decodificar e
            # recortar uma foto de celular nao pode travar o loop de eventos.
            url, thumb_url = await run_in_threadpool(upload_meal_photo, file_bytes, content_type)
        else:
            url = upload_image(file_bytes, content_type, folder)
    except StorageError as e:
        logger.error("Falha no upload de midia (user_id=%s, folder=%s): %s", current_user.id, folder, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    if folder == "posts":
        # Registro da foto APROVADA: POST /posts so aceita media_url que esteja aqui, do proprio usuario.
        try:
            db.add(MediaUpload(user_id=current_user.id, folder="posts", url=url, created_at=tz.utc_now()))
            db.commit()
        except Exception:  # noqa: BLE001
            db.rollback()
            delete_post_media_by_url(url)  # sem registro a foto nao serve para nada: nao deixa objeto orfao
            logger.error("media_upload_record_failed user_id=%s", current_user.id)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Nao foi possivel enviar o arquivo, tente novamente")

    return MediaUploadOut(url=url, thumb_url=thumb_url)


def _ensure_upload_quota(db: Session, user_id) -> None:
    """429 se o usuario ja enviou POST_UPLOADS_PER_HOUR fotos de post na ultima hora (aprovadas + reprovadas)."""
    now = tz.utc_now()
    since = now - timedelta(hours=1)
    approved = [r[0] for r in db.query(MediaUpload.created_at).filter(
        MediaUpload.user_id == user_id, MediaUpload.folder == "posts", MediaUpload.created_at > since
    ).order_by(MediaUpload.created_at.desc()).limit(POST_UPLOADS_PER_HOUR).all()]
    rejected = [r[0] for r in db.query(ContentFilterEvent.created_at).filter(
        ContentFilterEvent.user_id == user_id, ContentFilterEvent.surface == "image_upload", ContentFilterEvent.created_at > since
    ).order_by(ContentFilterEvent.created_at.desc()).limit(POST_UPLOADS_PER_HOUR).all()]
    recent = sorted(approved + rejected, reverse=True)[:POST_UPLOADS_PER_HOUR]
    if len(recent) < POST_UPLOADS_PER_HOUR:
        return
    seconds = max(1, math.ceil((recent[-1] + timedelta(hours=1) - now).total_seconds()))
    minutes = max(1, math.ceil(seconds / 60))
    logger.warning("post_upload_quota_exceeded user_id=%s retry_after=%s", user_id, seconds)
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=f"Muitos envios de foto em pouco tempo. Tente novamente em {minutes} minuto" + ("" if minutes == 1 else "s") + ".",
        headers={"Retry-After": str(seconds)},
    )


async def _moderate_post_image(db: Session, user: User, file_bytes: bytes) -> None:
    """Analise automatica da foto de post ANTES de gravar no S3. Levanta HTTPException (429/400/503/422); se voltar, a foto foi aprovada.
    Imagem, nome de arquivo e resposta do modelo nunca vao para log nem para o banco; so ids, codigos e contagens."""
    ensure_not_paused(db, user.id, IMAGE_FILTER_HEADER_VALUE)
    _ensure_upload_quota(db, user.id)
    try:
        jpeg = await run_in_threadpool(prepare_for_analysis, file_bytes)
    except InvalidImage:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=IMAGE_UNREADABLE_MESSAGE)
    try:
        verdict = await run_in_threadpool(analyze_image, jpeg)
    except ImageModerationUnavailable:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=IMAGE_UNAVAILABLE_MESSAGE)
    if verdict.allowed:
        return
    record_block_event(db, user_id=user.id, surface="image_upload", category=verdict.category or "other")
    logger.warning("content_filter_blocked kind=image surface=image_upload user_id=%s category=%s", user.id, verdict.category)
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=IMAGE_BLOCKED_MESSAGE,
        headers={FILTER_HEADER: IMAGE_FILTER_HEADER_VALUE},
    )
