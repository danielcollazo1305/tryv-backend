"""
Upload de midia para o S3 — usado por refeicoes, posts do feed, fotos de
perfil e (desde o registro profissional expandido) videos de execucao de
exercicio. O bucket ja tem uma bucket policy de leitura publica
configurada, entao o upload nao precisa (nem deve) definir ACL — buckets
com "Block Public Access" ativado rejeitam PutObject com ACL explicita.
"""
import io
import logging
import mimetypes
import uuid

import boto3
from botocore.exceptions import BotoCoreError, ClientError
import re

from PIL import Image, ImageOps

from app.core.config import settings

logger = logging.getLogger(__name__)

_client = None


class StorageError(Exception):
    """Erro ao interagir com o armazenamento de arquivos — a mensagem e segura para expor ao usuario."""


def _get_client():
    """Lazy init: evita quebrar a importacao do app se as credenciais AWS
    ainda nao estiverem configuradas (ex: rodando localmente sem .env preenchido)."""
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            region_name=settings.aws_s3_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )
    return _client


# Pasta dos avatares: unica onde delete_object() tem permissao de apagar.
PROFILES_PREFIX = "profiles/"
# Cache longo e imutavel: o nome do arquivo muda a cada geracao de avatar.
IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable"
AVATAR_THUMB_SIZE = 256
AVATAR_THUMB_QUALITY = 80


def _public_url_prefix() -> str:
    return f"https://{settings.aws_s3_bucket}.s3.{settings.aws_s3_region}.amazonaws.com/"


def _put(key: str, file_bytes: bytes, content_type: str, cache_control: str | None = None) -> str:
    extra = {"CacheControl": cache_control} if cache_control else {}
    try:
        _get_client().put_object(
            Bucket=settings.aws_s3_bucket,
            Key=key,
            Body=file_bytes,
            ContentType=content_type,
            **extra,
        )
    except (BotoCoreError, ClientError) as e:
        logger.error("Falha ao fazer upload para o S3 (key=%s): %s", key, e)
        raise StorageError("Nao foi possivel enviar o arquivo, tente novamente") from e
    return f"{_public_url_prefix()}{key}"


def upload_image(file_bytes: bytes, content_type: str, folder: str) -> str:
    """Envia uma imagem para {folder}/{uuid}.{ext} no bucket e retorna a URL publica."""
    extension = mimetypes.guess_extension(content_type) or ".jpg"
    if extension == ".jpe":  # mimetypes retorna ".jpe" para image/jpeg em alguns ambientes
        extension = ".jpg"
    return _put(f"{folder}/{uuid.uuid4()}{extension}", file_bytes, content_type)


def make_avatar_thumbnail(png_bytes: bytes) -> bytes:
    """Miniatura 256x256 em WebP (qualidade ~80, RGB, LANCZOS) a partir da imagem grande do avatar."""
    with Image.open(io.BytesIO(png_bytes)) as img:
        thumb = img.convert("RGB").resize((AVATAR_THUMB_SIZE, AVATAR_THUMB_SIZE), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    thumb.save(out, format="WEBP", quality=AVATAR_THUMB_QUALITY)
    return out.getvalue()


def upload_avatar_images(png_bytes: bytes) -> tuple[str, str | None]:
    """Sobe o avatar: imagem grande profiles/{uuid}.png e miniatura profiles/{uuid}_256.webp (mesmo uuid), ambas
    com cache imutavel. Retorna (url_grande, url_miniatura). Falha na GRANDE levanta StorageError; falha ao gerar
    ou subir a MINIATURA so loga WARNING e devolve None no lugar dela (o avatar nunca falha por causa dela)."""
    avatar_id = uuid.uuid4()
    url = _put(f"{PROFILES_PREFIX}{avatar_id}.png", png_bytes, "image/png", IMMUTABLE_CACHE_CONTROL)
    try:
        thumb_bytes = make_avatar_thumbnail(png_bytes)
        thumb_url = _put(f"{PROFILES_PREFIX}{avatar_id}_{AVATAR_THUMB_SIZE}.webp", thumb_bytes, "image/webp", IMMUTABLE_CACHE_CONTROL)
    except Exception as e:  # noqa: BLE001 -- qualquer falha da miniatura e tolerada
        logger.warning("Miniatura do avatar nao gerada/enviada (avatar_id=%s): %s", avatar_id, e)
        return url, None
    return url, thumb_url


# ---- fotos de refeicao (pasta meals): original + miniatura 4:3 -----------------------------------------------
MEAL_THUMB_SIZE = (320, 240)  # 4:3, mesma proporcao do recorte da foto no app
MEAL_THUMB_QUALITY = 80
MEALS_PREFIX = "meals/"
# Chave aceita para a miniatura de uma refeicao: meals/<nome sem barras>.webp (sem "..", sem subpastas).
_MEAL_THUMB_KEY_RE = re.compile(r"^meals/[A-Za-z0-9_-]+\.webp$")


def make_photo_thumbnail(image_bytes: bytes) -> bytes:
    """Miniatura 320x240 WebP (qualidade 80) de uma foto qualquer: corrige a rotacao do EXIF ANTES de recortar
    (fotos de celular vem deitadas) e recorta ao centro (cover) para 4:3 quando a foto nao for 4:3. Levanta
    excecao se o arquivo nao for uma imagem que o Pillow abra (ex: HEIC, corrompido)."""
    with Image.open(io.BytesIO(image_bytes)) as img:
        img.load()
        oriented = ImageOps.exif_transpose(img)
        thumb = ImageOps.fit(oriented.convert("RGB"), MEAL_THUMB_SIZE, method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
    out = io.BytesIO()
    thumb.save(out, format="WEBP", quality=MEAL_THUMB_QUALITY)
    return out.getvalue()


def upload_meal_photo(file_bytes: bytes, content_type: str) -> tuple[str, str | None]:
    """Sobe a foto de refeicao: original meals/{uuid}.{ext} e miniatura meals/{uuid}_thumb.webp (mesmo uuid), as
    duas com cache imutavel (o nome muda a cada upload). Retorna (url_original, url_miniatura). Falha na ORIGINAL
    levanta StorageError; falha ao gerar ou subir a MINIATURA so loga WARNING (sem dado pessoal) e devolve None no
    lugar dela: o upload da original nunca falha por causa dela."""
    extension = mimetypes.guess_extension(content_type) or ".jpg"
    if extension == ".jpe":
        extension = ".jpg"
    photo_id = uuid.uuid4()
    url = _put(f"{MEALS_PREFIX}{photo_id}{extension}", file_bytes, content_type, IMMUTABLE_CACHE_CONTROL)
    try:
        thumb_bytes = make_photo_thumbnail(file_bytes)
        thumb_url = _put(f"{MEALS_PREFIX}{photo_id}_thumb.webp", thumb_bytes, "image/webp", IMMUTABLE_CACHE_CONTROL)
    except Exception as e:  # noqa: BLE001 -- qualquer falha da miniatura e tolerada
        logger.warning("Miniatura da foto de refeicao nao gerada/enviada (photo_id=%s, %s)", photo_id, type(e).__name__)
        return url, None
    return url, thumb_url


def is_own_meal_thumb_url(url: str | None) -> bool:
    """True so se a URL e uma miniatura do NOSSO bucket/regiao, sob meals/, terminada em .webp, sem '..'."""
    if not url or ".." in url:
        return False
    prefix = _public_url_prefix()
    if not url.startswith(prefix):
        return False
    return bool(_MEAL_THUMB_KEY_RE.match(url[len(prefix):]))


def delete_object(key: str) -> bool:
    """Apaga um objeto do NOSSO bucket. TRAVA DE SEGURANCA: so chaves dentro de 'profiles/' (sem '..' nem barra
    inicial); qualquer outra e recusada (False) e nunca chega ao S3. Erros do S3 so sao logados (best-effort):
    retorna True se apagou."""
    if not key or not key.startswith(PROFILES_PREFIX) or ".." in key or len(key) == len(PROFILES_PREFIX):
        logger.warning("delete_object recusado: chave fora de '%s' (%r)", PROFILES_PREFIX, key)
        return False
    try:
        _get_client().delete_object(Bucket=settings.aws_s3_bucket, Key=key)
    except Exception as e:  # noqa: BLE001
        logger.warning("Falha ao apagar objeto do S3 (key=%s): %s", key, e)
        return False
    return True


def delete_object_by_url(url: str | None) -> bool:
    """Apaga o objeto de uma URL publica, SO se ela pertencer ao nosso bucket/regiao (e delete_object aceitar a
    chave). URL de outro bucket/regiao/host e recusada."""
    if not url:
        return False
    prefix = _public_url_prefix()
    if not url.startswith(prefix):
        logger.warning("delete_object_by_url recusado: URL fora do nosso bucket (%r)", url[:80])
        return False
    return delete_object(url[len(prefix):])
