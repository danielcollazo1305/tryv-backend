"""
Regras do fluxo foto/avatar do perfil, fora do router (testaveis sem HTTP).

Modelo: users.avatar_url/avatar_thumb_url sao SEMPRE a imagem exibida (publica); a foto original e o avatar gerado ficam em chaves PRIVADAS do S3
(users.profile_photo_key/generated_avatar_key e miniaturas). Escolher "foto" ou "avatar" cria a copia publica da escolhida. Como o par exibido e o
unico que sai em respostas de outras pessoas, a regra de menores (core/avatar_visibility.py) cobre foto E avatar sem nenhuma outra mudanca.
"""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.avatar_attempt import AvatarAttempt
from app.models.avatar_generation import AvatarGeneration
from app.models.user import User
from app.services import storage

# Versao do texto de consentimento exibido no app (envio da foto a OpenAI + exibicao da imagem escolhida a outros usuarios). Trocar este valor
# (e o texto no app) obriga a pessoa a aceitar de novo. O app envia a versao aceita; o servidor so aceita a atual.
AVATAR_CONSENT_VERSION = "2026-11-v1"

SOURCE_PHOTO = "photo"
SOURCE_AVATAR = "avatar"
VALID_SOURCES = (SOURCE_PHOTO, SOURCE_AVATAR)

MINOR_RESTRICTION_MESSAGE = (
    "Por seguranca, foto e avatar de perfil ainda nao estao disponiveis para menores de 18 anos "
    "ou para quem nao informou a data de nascimento."
)

# POST /users/me/avatar sem consent_version = app antigo, anterior a tela de consentimento (400, nao o 422 padrao em ingles).
APP_UPDATE_REQUIRED_MESSAGE = "Atualize o app para criar seu avatar"


def keys_for(user: User, source: str) -> tuple[str | None, str | None]:
    if source == SOURCE_PHOTO:
        return user.profile_photo_key, user.profile_photo_thumb_key
    return user.generated_avatar_key, user.generated_avatar_thumb_key


def stored_keys(user: User) -> list[str]:
    return [k for k in (user.profile_photo_key, user.profile_photo_thumb_key, user.generated_avatar_key, user.generated_avatar_thumb_key) if k]


def public_url_for_key(key: str) -> str:
    return f"{storage._public_url_prefix()}{key}"


def _key_from_public_url(url: str | None) -> str | None:
    prefix = storage._public_url_prefix()
    return url[len(prefix):] if url and url.startswith(prefix) else None


def preview_url(key: str | None) -> str | None:
    """URL para o DONO ver uma imagem guardada: assinada (com prazo) se privada; a propria URL publica se for um avatar antigo (profiles/)."""
    if not key:
        return None
    if storage.is_private_profile_key(key):
        return storage.presigned_private_url(key, settings.private_image_url_expires_seconds)
    return public_url_for_key(key)


def resolve_display(key: str, thumb_key: str | None) -> tuple[str, str | None]:
    """(url, url_miniatura) publicas para exibir a imagem guardada em `key`. Privada: cria a copia publica. Avatar antigo ja publico (profiles/):
    reaproveita a URL existente (nada a copiar)."""
    if storage.is_private_profile_key(key):
        return storage.publish_private_image(key, thumb_key)
    return public_url_for_key(key), (public_url_for_key(thumb_key) if thumb_key else None)


def delete_stored_key(key: str | None) -> bool:
    """Apaga uma chave guardada: privada (private/profile/) ou, nos avatares antigos, a publica de profiles/."""
    if not key:
        return False
    if storage.is_private_profile_key(key):
        return storage.delete_private_key(key)
    return storage.delete_object(key)


def delete_previous_public_copies(user: User, old_urls: tuple[str | None, str | None]) -> None:
    """Apaga as copias publicas que deixaram de ser exibidas, EXCETO as que sao tambem uma chave guardada do usuario (avatar antigo, ainda
    usado como alternativa)."""
    protected = set(stored_keys(user))
    for url in old_urls:
        if not url or _key_from_public_url(url) in protected:
            continue
        storage.delete_object_by_url(url)


def generations_in_window(db: Session, user_id) -> list[datetime]:
    window = timedelta(days=max(1, settings.avatar_limit_window_days))
    return [
        row[0]
        for row in db.query(AvatarGeneration.created_at)
        .filter(AvatarGeneration.user_id == user_id, AvatarGeneration.created_at >= datetime.utcnow() - window)
        .order_by(AvatarGeneration.created_at.asc())
        .all()
    ]


def attempts_last_24h(db: Session, user_id) -> int:
    return (
        db.query(AvatarAttempt.id)
        .filter(AvatarAttempt.user_id == user_id, AvatarAttempt.created_at >= datetime.utcnow() - timedelta(hours=24))
        .count()
    )
