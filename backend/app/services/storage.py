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
from PIL import Image

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
