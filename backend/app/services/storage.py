"""
Upload de imagens para o S3 — usado por refeicoes, posts do feed e (futuramente) fotos de perfil.
O bucket ja tem uma bucket policy de leitura publica configurada, entao o
upload nao precisa (nem deve) definir ACL — buckets com "Block Public
Access" ativado rejeitam PutObject com ACL explicita.
"""
import logging
import mimetypes
import uuid

import boto3
from botocore.exceptions import BotoCoreError, ClientError

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


def upload_image(file_bytes: bytes, content_type: str, folder: str) -> str:
    """Envia uma imagem para {folder}/{uuid}.{ext} no bucket e retorna a URL publica."""
    extension = mimetypes.guess_extension(content_type) or ".jpg"
    if extension == ".jpe":  # mimetypes retorna ".jpe" para image/jpeg em alguns ambientes
        extension = ".jpg"
    key = f"{folder}/{uuid.uuid4()}{extension}"

    try:
        _get_client().put_object(
            Bucket=settings.aws_s3_bucket,
            Key=key,
            Body=file_bytes,
            ContentType=content_type,
        )
    except (BotoCoreError, ClientError) as e:
        logger.error("Falha ao fazer upload para o S3 (key=%s): %s", key, e)
        raise StorageError("Nao foi possivel enviar o arquivo, tente novamente") from e

    return f"https://{settings.aws_s3_bucket}.s3.{settings.aws_s3_region}.amazonaws.com/{key}"
