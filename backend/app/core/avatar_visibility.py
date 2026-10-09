"""
Regra UNICA de visibilidade do avatar para OUTRAS pessoas. Toda resposta que traz o avatar de alguem passa por
aqui; nunca copie a regra.

  - o proprio usuario sempre ve o seu (inclusive menor de idade);
  - para os outros, o avatar fica ESCONDIDO (None, None -- o app mostra as iniciais) quando a pessoa e menor de
    18 anos ou nao informou a data de nascimento (sem a data, nao ha como saber que e maior de idade).
"""
import uuid
from datetime import date

from app.core.timezone import local_today

MIN_AGE_TO_SHOW_AVATAR = 18


def age_in_years(date_of_birth: date, today: date | None = None) -> int:
    today = today or local_today()
    return today.year - date_of_birth.year - ((today.month, today.day) < (date_of_birth.month, date_of_birth.day))


def visible_avatar(
    avatar_url: str | None,
    avatar_thumb_url: str | None,
    date_of_birth: date | None,
    owner_id: uuid.UUID | None,
    viewer_id: uuid.UUID | None,
) -> tuple[str | None, str | None]:
    """(avatar_url, avatar_thumb_url) que `viewer_id` pode ver do dono `owner_id`."""
    if owner_id is not None and owner_id == viewer_id:
        return avatar_url, avatar_thumb_url
    if date_of_birth is None or age_in_years(date_of_birth) < MIN_AGE_TO_SHOW_AVATAR:
        return None, None
    return avatar_url, avatar_thumb_url


def avatar_fields(user, viewer_id: uuid.UUID | None) -> dict:
    """Atalho para um objeto User (ou linha com id/avatar_url/avatar_thumb_url/date_of_birth): dict pronto
    para espalhar num schema (`**avatar_fields(u, viewer.id)`). Delega a visible_avatar."""
    url, thumb = visible_avatar(user.avatar_url, user.avatar_thumb_url, user.date_of_birth, user.id, viewer_id)
    return {"avatar_url": url, "avatar_thumb_url": thumb}
