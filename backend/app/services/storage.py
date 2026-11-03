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
from botocore.config import Config
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
            # SigV4 explicito: as URLs assinadas das imagens privadas do perfil (presigned_private_url) saem com X-Amz-Signature em qualquer regiao.
            config=Config(signature_version="s3v4"),
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


# ---- imagens PRIVADAS do perfil (foto original e avatar guardados): prefixo private/profile/ ----------------------------
# Nunca viram URL publica: so o dono as ve, por URL assinada com prazo (presigned_private_url). A copia PUBLICA (profiles/) so e criada quando a pessoa
# escolhe usar aquela imagem (publish_private_image) e e essa que vai para users.avatar_url. ATENCAO: o bucket tem uma policy de leitura publica; o
# prefixo private/ so fica de fato privado se essa policy NAO cobrir private/* (confirmar no console da AWS; o codigo nao consegue verificar isso).
PRIVATE_PROFILE_PREFIX = "private/profile/"
PROFILE_PHOTO_MAX_SIDE = 1024
PROFILE_PHOTO_JPEG_QUALITY = 85
_PRIVATE_KEY_RE = re.compile(r"^private/profile/[A-Za-z0-9_-]+\.(jpg|png|webp)$")


def is_private_profile_key(key: str | None) -> bool:
    return bool(key) and isinstance(key, str) and _PRIVATE_KEY_RE.match(key) is not None


def make_profile_photo_copy(image_bytes: bytes) -> bytes:
    """Copia da foto de perfil: corrige a rotacao do EXIF, reduz para no maximo 1024 px no lado maior e regrava em JPEG RGB (sem EXIF/GPS).
    Levanta excecao se o arquivo nao for uma imagem que o Pillow abra (ex: HEIC, corrompido)."""
    with Image.open(io.BytesIO(image_bytes)) as img:
        img.load()
        oriented = ImageOps.exif_transpose(img).convert("RGB")
        oriented.thumbnail((PROFILE_PHOTO_MAX_SIDE, PROFILE_PHOTO_MAX_SIDE), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    oriented.save(out, format="JPEG", quality=PROFILE_PHOTO_JPEG_QUALITY)
    return out.getvalue()


def make_square_thumbnail(image_bytes: bytes) -> bytes:
    """Miniatura 256x256 WebP recortada ao centro (cover): serve para foto retangular e para avatar quadrado."""
    with Image.open(io.BytesIO(image_bytes)) as img:
        img.load()
        thumb = ImageOps.fit(ImageOps.exif_transpose(img).convert("RGB"), (AVATAR_THUMB_SIZE, AVATAR_THUMB_SIZE), method=Image.Resampling.LANCZOS)
    out = io.BytesIO()
    thumb.save(out, format="WEBP", quality=AVATAR_THUMB_QUALITY)
    return out.getvalue()


def _put_private(key: str, data: bytes, content_type: str) -> str:
    try:
        _get_client().put_object(Bucket=settings.aws_s3_bucket, Key=key, Body=data, ContentType=content_type, CacheControl="private, no-store")
    except (BotoCoreError, ClientError) as e:
        logger.error("Falha ao enviar imagem privada ao S3 (key=%s): %s", key, e)
        raise StorageError("Nao foi possivel enviar o arquivo, tente novamente") from e
    return key


def upload_private_profile_images(full_bytes: bytes, extension: str) -> tuple[str, str | None]:
    """Sobe imagem grande (private/profile/{uuid}.{jpg|png}) e miniatura WebP (private/profile/{uuid}_256.webp). Retorna as CHAVES (nao URLs).
    Falha na grande levanta StorageError; falha so na miniatura devolve None no lugar dela."""
    image_id = uuid.uuid4()
    content_type = "image/png" if extension == "png" else "image/jpeg"
    key = _put_private(f"{PRIVATE_PROFILE_PREFIX}{image_id}.{extension}", full_bytes, content_type)
    try:
        thumb_key = _put_private(f"{PRIVATE_PROFILE_PREFIX}{image_id}_{AVATAR_THUMB_SIZE}.webp", make_square_thumbnail(full_bytes), "image/webp")
    except Exception as e:  # noqa: BLE001 -- miniatura e best-effort
        logger.warning("Miniatura privada nao gerada/enviada (id=%s): %s", image_id, e)
        return key, None
    return key, thumb_key


def presigned_private_url(key: str | None, expires_seconds: int) -> str | None:
    """URL assinada (GET) com prazo para uma chave privada do perfil. Chave fora do prefixo/formato esperado devolve None."""
    if not is_private_profile_key(key):
        return None
    try:
        return _get_client().generate_presigned_url(
            "get_object", Params={"Bucket": settings.aws_s3_bucket, "Key": key}, ExpiresIn=max(60, expires_seconds)
        )
    except (BotoCoreError, ClientError) as e:
        logger.warning("Falha ao assinar URL privada (key=%s): %s", key, e)
        return None


def read_private_object(key: str) -> bytes:
    if not is_private_profile_key(key):
        raise StorageError("Imagem nao encontrada")
    try:
        return _get_client().get_object(Bucket=settings.aws_s3_bucket, Key=key)["Body"].read()
    except (BotoCoreError, ClientError) as e:
        logger.error("Falha ao ler imagem privada (key=%s): %s", key, e)
        raise StorageError("Nao foi possivel ler a imagem, tente novamente") from e


def delete_private_key(key: str | None) -> bool:
    """Apaga uma chave privada do perfil. TRAVA: so private/profile/ no formato esperado. Best-effort (erros so logados)."""
    if not is_private_profile_key(key):
        if key:
            logger.warning("delete_private_key recusado: chave fora de '%s'", PRIVATE_PROFILE_PREFIX)
        return False
    try:
        _get_client().delete_object(Bucket=settings.aws_s3_bucket, Key=key)
    except Exception as e:  # noqa: BLE001
        logger.warning("Falha ao apagar imagem privada (key=%s): %s", key, e)
        return False
    return True


def publish_private_image(key: str, thumb_key: str | None) -> tuple[str, str | None]:
    """Cria a copia PUBLICA (profiles/{uuid}.{ext} + miniatura) de uma imagem privada. Retorna (url, url_miniatura). So e chamada quando a pessoa
    escolhe usar aquela imagem."""
    data = read_private_object(key)
    extension = "png" if key.endswith(".png") else "jpg"
    avatar_id = uuid.uuid4()
    url = _put(f"{PROFILES_PREFIX}{avatar_id}.{extension}", data, "image/png" if extension == "png" else "image/jpeg", IMMUTABLE_CACHE_CONTROL)
    thumb_url = None
    try:
        thumb = read_private_object(thumb_key) if thumb_key else make_square_thumbnail(data)
        thumb_url = _put(f"{PROFILES_PREFIX}{avatar_id}_{AVATAR_THUMB_SIZE}.webp", thumb, "image/webp", IMMUTABLE_CACHE_CONTROL)
    except Exception as e:  # noqa: BLE001
        logger.warning("Miniatura publica nao gerada/enviada (avatar_id=%s): %s", avatar_id, e)
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


# ---- midia de POSTS (pasta posts/): exclusao em helper SEPARADO, com trava propria -----------------------------------
# O upload de posts vai para posts/{uuid}.{ext} (routers/media.py, folder='posts' -> upload_image). Outras pastas NAO
# entram aqui de proposito: 'meals/' e 'challenges/' sao a MESMA foto referenciada pela refeicao/check-in (um post de
# refeicao compartilha a URL da foto da refeicao) e 'profiles/' e o avatar. delete_object() continua so com 'profiles/'.
POSTS_PREFIX = "posts/"
# Chave aceita: posts/<nome sem barras>.<extensao curta>, so [A-Za-z0-9_-] (sem "..", sem "%", sem subpastas).
_POST_MEDIA_KEY_RE = re.compile(r"posts/[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,5}")


def post_media_key_from_url(url: str | None) -> str | None:
    """Chave S3 de uma URL de midia de post, ou None se a URL nao for do NOSSO bucket/regiao, nao estiver em posts/, tiver
    '..', query string, fragmento, '%' (traversal codificado), barra invertida ou qualquer caractere fora da lista."""
    if not url or not isinstance(url, str):
        return None
    if any(bad in url for bad in ("..", "?", "#", "%", "\\")):
        return None
    prefix = _public_url_prefix()
    if not url.startswith(prefix):
        return None
    key = url[len(prefix):]
    return key if _POST_MEDIA_KEY_RE.fullmatch(key) else None


def delete_post_media_by_url(url: str | None) -> bool:
    """Apaga do S3 a midia de um post a partir da URL publica. Trava equivalente a de delete_object(), para posts/: so
    URL do nosso bucket/regiao, so chave posts/<nome>.<ext>; qualquer outra (profiles/, meals/, outro bucket, '..',
    query string...) e recusada (False) e nunca chega ao S3. Erros do S3 so sao logados (best-effort, sem a chave):
    retorna True se apagou."""
    key = post_media_key_from_url(url)
    if key is None:
        logger.warning("delete_post_media_by_url recusado: URL fora do nosso bucket ou fora de '%s'", POSTS_PREFIX)
        return False
    try:
        _get_client().delete_object(Bucket=settings.aws_s3_bucket, Key=key)
    except Exception as e:  # noqa: BLE001
        logger.warning("Falha ao apagar midia de post no S3 (%s)", type(e).__name__)
        return False
    return True


# ---- midia de REFEICOES (meals/) e de CHECK-INS de desafio (challenges/): exclusao na exclusao de conta ---------------
# Mesmo padrao e travas de delete_post_media_by_url: so URL do nosso bucket/regiao (https), chave
# <pasta>/<nome>.<ext de 1-5 letras/numeros> com [A-Za-z0-9_-] (a miniatura meals/<uuid>_thumb.webp cabe no padrao), sem
# '..', '?', '#', '%', '\\', subpastas. delete_object(), delete_object_by_url() e delete_post_media_by_url() nao mudam.
CHALLENGES_PREFIX = "challenges/"


def _media_key_from_url(url: str | None, prefix: str) -> str | None:
    if not url or not isinstance(url, str):
        return None
    if any(bad in url for bad in ("..", "?", "#", "%", "\\")):
        return None
    public_prefix = _public_url_prefix()
    if not url.startswith(public_prefix):
        return None
    key = url[len(public_prefix):]
    pattern = re.compile(re.escape(prefix) + r"[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,5}")
    return key if pattern.fullmatch(key) else None


def _delete_media_key_by_url(url: str | None, prefix: str) -> bool:
    key = _media_key_from_url(url, prefix)
    if key is None:
        logger.warning("exclusao de midia recusada: URL fora do nosso bucket ou fora de '%s'", prefix)
        return False
    try:
        _get_client().delete_object(Bucket=settings.aws_s3_bucket, Key=key)
    except Exception as e:  # noqa: BLE001
        logger.warning("Falha ao apagar midia no S3 (%s)", type(e).__name__)
        return False
    return True


def delete_meal_media_by_url(url: str | None) -> bool:
    """Apaga a foto (ou a miniatura .webp) de uma refeicao em meals/. True se apagou."""
    return _delete_media_key_by_url(url, MEALS_PREFIX)


def delete_challenge_media_by_url(url: str | None) -> bool:
    """Apaga a foto de um check-in de desafio em challenges/. True se apagou."""
    return _delete_media_key_by_url(url, CHALLENGES_PREFIX)


def delete_user_media_by_url(url: str | None) -> bool:
    """Despacha para o helper certo pela pasta da URL (profiles/, posts/, meals/ ou challenges/); qualquer outra pasta,
    host ou formato e recusado (False). Usado pela exclusao de conta, DEPOIS do commit."""
    if not url or not isinstance(url, str) or not url.startswith(_public_url_prefix()):
        return False
    key = url[len(_public_url_prefix()):]
    if key.startswith(PROFILES_PREFIX):
        # Helper sem a chave no log (delete_object_by_url loga a chave e a mensagem do erro; ele segue como esta).
        return _delete_media_key_by_url(url, PROFILES_PREFIX)
    if key.startswith(POSTS_PREFIX):
        return delete_post_media_by_url(url)
    if key.startswith(MEALS_PREFIX):
        return delete_meal_media_by_url(url)
    if key.startswith(CHALLENGES_PREFIX):
        return delete_challenge_media_by_url(url)
    return False
