import logging
import math
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core import timezone as tz
from app.core.age_policy import require_valid_birth_date
from app.core.avatar_visibility import avatar_fields, can_show_stats, is_adult
from app.core.config import settings
from app.core.database import get_db
from app.core.login_throttle import client_ip, login_throttle
from app.core.content_filter import check_texts
from app.core.profile_rules import (
    BIO_MAX,
    LINK_MAX,
    PROFILE_EMPTY_MESSAGE,
    USERNAME_CANNOT_CLEAR_MESSAGE,
    USERNAME_INVALID_MESSAGE,
    USERNAME_MAX,
    USERNAME_RESERVED_MESSAGE,
    USERNAME_TAKEN_MESSAGE,
    LINK_INVALID_MESSAGE,
    clean_link,
    username_change_wait_days,
    username_cooldown_message,
    is_reserved_username,
    is_valid_username_format,
    normalize_username,
    username_filter_texts,
)
from app.core.rate_limit import SlidingWindowLimiter, enforce
from app.core.deps import get_current_user, has_active_pro_subscription
from app.core.security import verify_password
from app.models.avatar_attempt import AvatarAttempt
from app.models.avatar_generation import AvatarGeneration
from app.models.social import Follow
from app.models.user import User
from app.routers.dashboard import _compute_training_streaks
from app.routers.media import MAX_IMAGE_FILE_SIZE_BYTES, _moderate_post_image
from app.routers.overall import compute_overall
from app.schemas.subscription import UserBadgesOut
from app.services.account_deletion import (
    CONFIRMATION_WORD,
    AccountAlreadyGone,
    AccountDeletionBlocked,
    delete_user_account,
)
from app.services.content_filter_guard import enforce_text_filter, ensure_max_length
from app.services.moderation import has_blocked, is_blocked_between, not_blocked
from app.schemas.user import (
    AccountDeleteRequest,
    AvatarOptionsOut,
    AvatarOut,
    AvatarSourceIn,
    ContactsMatchRequest,
    MatchedContact,
    ProfileUpdate,
    PublicProfileOut,
    UserOut,
    UsernameAvailableOut,
    UserSearchResult,
    UserUpdate,
)
from app.services import avatar_profile
from app.services.avatar_generation import AvatarGenerationError, AvatarServiceUnavailableError, generate_avatar
from app.services.storage import StorageError, delete_object_by_url, make_profile_photo_copy, upload_private_profile_images

router = APIRouter(prefix="/users", tags=["users"])
logger = logging.getLogger(__name__)

# GET /users/username-available: consulta barata que poderia virar enumeracao em massa. Limite por usuario (20/min) e por IP
# (60/min), em memoria (core/rate_limit.py).
username_check_user_limiter = SlidingWindowLimiter(limit=20, window_seconds=60)
username_check_ip_limiter = SlidingWindowLimiter(limit=60, window_seconds=60)


def _parse_user_id(user_id: str, db: Session) -> uuid.UUID:
    try:
        parsed_id = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")

    if not db.query(User).filter(User.id == parsed_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")

    return parsed_id


@router.get("/me", response_model=UserOut)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
def update_current_user(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = payload.model_dump(exclude_unset=True)
    # Idade minima 18 (core/age_policy.py): trocar a data de nascimento passa pela MESMA regra do cadastro (nao da para virar
    # menor de 18, nem apagar a data). Reenviar o valor que ja esta salvo nao e revalidado (conta antiga continua editavel).
    if "date_of_birth" in data and data["date_of_birth"] != current_user.date_of_birth:
        require_valid_birth_date(data["date_of_birth"])
    for field, value in data.items():
        setattr(current_user, field, value)
    db.commit()
    db.refresh(current_user)
    return current_user


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


@router.patch("/me/profile", response_model=UserOut)
def update_my_profile(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """@usuario, bio e link do proprio perfil. Ausente/null = nao mexe; "" limpa bio e link (o @usuario nao pode ser limpo
    depois de definido). Formato invalido = 422; @usuario em uso = 409. Bio e @usuario passam pelo MESMO filtro de texto e
    limites da legenda (so quando o valor muda)."""
    data = payload.model_dump(exclude_none=True)
    if not data:
        raise _unprocessable(PROFILE_EMPTY_MESSAGE)

    changes: dict[str, object] = {}

    if "username" in data:
        username = normalize_username(data["username"])
        if username == "":
            raise _unprocessable(USERNAME_CANNOT_CLEAR_MESSAGE if current_user.username else USERNAME_INVALID_MESSAGE)
        if username != current_user.username:
            ensure_max_length(username, USERNAME_MAX, "username")
            if not is_valid_username_format(username):
                raise _unprocessable(USERNAME_INVALID_MESSAGE)
            if is_reserved_username(username):
                raise _unprocessable(USERNAME_RESERVED_MESSAGE)
            # Limite de 1 troca a cada 30 dias (a PRIMEIRA definicao e livre). Vem ANTES do filtro e da checagem de duplicado: quem esta
            # no intervalo recebe sempre a mesma resposta e nao consegue usar o PATCH para descobrir se um @usuario esta em uso.
            now = tz.utc_now()
            if current_user.username is not None:
                wait_days = username_change_wait_days(current_user.username_changed_at, now)
                if wait_days > 0:
                    raise _unprocessable(username_cooldown_message(wait_days))
            enforce_text_filter(db, user_id=current_user.id, fields=[("username", t) for t in username_filter_texts(username)])
            taken = (
                db.query(User.id).filter(func.lower(User.username) == username, User.id != current_user.id).first() is not None
            )
            if taken:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=USERNAME_TAKEN_MESSAGE)
            changes["username"] = username
            changes["username_changed_at"] = now

    if "bio" in data:
        bio = data["bio"].strip()
        new_bio = bio or None
        if new_bio != current_user.bio:
            if new_bio is not None:
                ensure_max_length(new_bio, BIO_MAX, "profile_bio")
                enforce_text_filter(db, user_id=current_user.id, fields=[("profile_bio", new_bio)])
            changes["bio"] = new_bio

    if "link" in data:
        raw_link = data["link"].strip()
        if raw_link == "":
            new_link = None
        else:
            new_link = clean_link(raw_link)
            if new_link is None:
                raise _unprocessable(LINK_INVALID_MESSAGE)
        if new_link != current_user.link:
            changes["link"] = new_link

    for field, value in changes.items():
        setattr(current_user, field, value)
    try:
        db.commit()
    except IntegrityError:
        # Corrida: outra pessoa pegou o mesmo @usuario entre a checagem e a gravacao (indice unico lower(username)).
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=USERNAME_TAKEN_MESSAGE)
    db.refresh(current_user)
    return current_user


@router.get("/username-available", response_model=UsernameAvailableOut)
def username_available(
    request: Request,
    u: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """So true/false: o @usuario pode ser usado por mim? Falso para formato invalido, reservado, palavra do filtro ou em uso por
    OUTRA pessoa (nao revela o motivo). O meu proprio @usuario atual conta como disponivel. Limite de requisicoes por usuario e por IP."""
    enforce(username_check_user_limiter, f"user:{current_user.id}")
    enforce(username_check_ip_limiter, f"ip:{client_ip(request)}")
    username = normalize_username(u)
    if username == current_user.username:
        return UsernameAvailableOut(available=True)
    if not is_valid_username_format(username) or is_reserved_username(username) or check_texts(*username_filter_texts(username)):
        return UsernameAvailableOut(available=False)
    taken = db.query(User.id).filter(func.lower(User.username) == username, User.id != current_user.id).first() is not None
    return UsernameAvailableOut(available=not taken)


def remove_user_avatar(db: Session, user: User) -> int:
    """Remove foto, avatar e a escolha: zera as colunas e apaga TODOS os objetos (copia publica exibida e chaves privadas), usado pela pessoa
    e pelo admin. Mantem o registro de consentimento. Devolve quantos objetos que EXISTIAM nao puderam ser apagados do S3 (0 = tudo certo); o
    banco fica zerado de qualquer forma."""
    old_urls = (user.avatar_url, user.avatar_thumb_url)
    old_keys = avatar_profile.stored_keys(user)
    user.avatar_url = None
    user.avatar_thumb_url = None
    user.profile_photo_key = None
    user.profile_photo_thumb_key = None
    user.generated_avatar_key = None
    user.generated_avatar_thumb_key = None
    user.avatar_source = None
    db.commit()
    failed = sum(1 for old in old_urls if old and not delete_object_by_url(old))
    failed += sum(1 for key in old_keys if not avatar_profile.delete_stored_key(key))
    return failed


def _require_adult_for_avatar(user: User) -> None:
    if not is_adult(user.date_of_birth):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=avatar_profile.MINOR_RESTRICTION_MESSAGE)


@router.get("/me/avatar-options", response_model=AvatarOptionsOut)
def get_my_avatar_options(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """So para o dono: as duas imagens guardadas (URLs ASSINADAS com prazo), qual esta em uso, cota restante e consentimento. Nunca devolve
    chaves do S3. Menores de 18 e quem nao informou a data de nascimento: can_manage=False (envio e geracao desabilitados)."""
    limit = max(1, settings.avatar_generation_limit)
    used = len(avatar_profile.generations_in_window(db, current_user.id))
    adult = is_adult(current_user.date_of_birth)
    photo_key = current_user.profile_photo_thumb_key or current_user.profile_photo_key
    avatar_key = current_user.generated_avatar_thumb_key or current_user.generated_avatar_key
    return AvatarOptionsOut(
        avatar_source=current_user.avatar_source,
        has_photo=bool(current_user.profile_photo_key),
        has_avatar=bool(current_user.generated_avatar_key),
        photo_preview_url=avatar_profile.preview_url(photo_key),
        avatar_preview_url=avatar_profile.preview_url(avatar_key),
        generations_limit=limit,
        generations_remaining=max(0, limit - used),
        window_days=max(1, settings.avatar_limit_window_days),
        can_manage=adult,
        restriction_message=None if adult else avatar_profile.MINOR_RESTRICTION_MESSAGE,
        consent_version=avatar_profile.AVATAR_CONSENT_VERSION,
        consented=current_user.avatar_consent_version == avatar_profile.AVATAR_CONSENT_VERSION,
    )


@router.post("/me/avatar", response_model=AvatarOut, status_code=status.HTTP_201_CREATED)
async def generate_avatar(
    file: UploadFile = File(...),
    # Opcional so na assinatura: app antigo (sem a tela de consentimento) nao manda o campo e receberia o 422 padrao do FastAPI ("Field required",
    # em ingles). O consentimento continua OBRIGATORIO: sem o campo -> 400 com a mensagem abaixo; com versao diferente da atual -> 400.
    consent_version: str | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Envia a foto de perfil e gera UM avatar em estilo anime a partir dela (services/avatar_generation.py). Ordem das barreiras, todas ANTES de
    gastar com a OpenAI: maioridade (menor ou sem data de nascimento: 403), consentimento na versao atual (400), imagem valida e tamanho,
    teto diario de TENTATIVAS (429), cota de geracoes (429) e moderacao automatica da foto (422). So depois chama a OpenAI; so uma resposta com
    sucesso consome a cota. A foto (copia reduzida, sem EXIF) e o avatar ficam em chaves PRIVADAS do S3; a copia publica so e criada para a imagem
    que esta em uso (a pessoa escolhe; na primeira vez, o avatar).
    """
    _require_adult_for_avatar(current_user)
    if consent_version is None or not consent_version.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=avatar_profile.APP_UPDATE_REQUIRED_MESSAGE)
    if consent_version != avatar_profile.AVATAR_CONSENT_VERSION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Voce precisa aceitar o aviso de uso da sua foto para continuar.",
        )

    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O arquivo enviado precisa ser uma imagem",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_IMAGE_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Arquivo excede o tamanho maximo permitido ({MAX_IMAGE_FILE_SIZE_BYTES // (1024 * 1024)}MB)",
        )

    # Teto diario de tentativas (com ou sem sucesso): falha que nao consome a cota de geracoes nao pode virar gasto ilimitado.
    attempts_limit = max(1, settings.avatar_daily_attempt_limit)
    if avatar_profile.attempts_last_24h(db, current_user.id) >= attempts_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Voce fez muitas tentativas de avatar hoje. Tente novamente amanha.",
        )
    db.add(AvatarAttempt(user_id=current_user.id))
    db.commit()

    # Limite de geracoes (settings.avatar_generation_limit a cada settings.avatar_limit_window_days dias, janela deslizante), ANTES de gastar com a
    # OpenAI. Duas requisicoes simultaneas podem passar juntas pela checagem e estourar o limite por 1 (aceito: nao ha lock, e o custo extra e de uma
    # geracao). max(1, ...): um valor invalido na env (0, negativo) nao pode travar nem bloquear tudo.
    limit = max(1, settings.avatar_generation_limit)
    window_days = max(1, settings.avatar_limit_window_days)
    window = timedelta(days=window_days)
    now = datetime.utcnow()
    recent_times = avatar_profile.generations_in_window(db, current_user.id)
    if len(recent_times) >= limit:
        # A vaga que abre primeiro e a da geracao de indice (count - limite) na ordem crescente. Abre em created_at + janela; arredonda pra cima,
        # minimo 1 dia.
        opens_at = recent_times[len(recent_times) - limit] + window
        days_left = max(1, math.ceil((opens_at - now).total_seconds() / 86400))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Voce atingiu o limite de {limit} avatares a cada {window_days} dias. Tente novamente em {days_left} dia(s).",
        )

    # Moderacao automatica da foto ANTES do S3 e da OpenAI (mesma analise das fotos de post). Reprovada: 422, sem cota consumida.
    await _moderate_post_image(db, current_user, file_bytes)

    try:
        photo_copy = await run_in_threadpool(make_profile_photo_copy, file_bytes)
    except Exception:  # noqa: BLE001 -- arquivo que o Pillow nao abre (ex: HEIC, corrompido)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nao foi possivel ler a foto. Use uma foto JPEG ou PNG.")

    try:
        result_bytes = await run_in_threadpool(generate_avatar, photo_copy, "image/jpeg", current_user.id)
    except AvatarServiceUnavailableError as e:
        # Saldo/cota ou chave da OpenAI (o servico ja logou o marcador em nivel ERROR). 503, nao 429: nao pode parecer o limite de geracoes. Nao
        # consome a cota do usuario.
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except AvatarGenerationError as e:
        # Recusa da OpenAI, foto sem rosto, timeout, rede ou resposta vazia: 502, nao consome a cota.
        logger.error("Falha ao gerar avatar (user_id=%s): %s", current_user.id, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    # Registra a geracao logo apos a OpenAI responder com sucesso e ANTES do S3: o custo ja foi incorrido mesmo se o upload falhar. Falha em gravar o
    # registro nao bloqueia o usuario (so loga).
    try:
        db.add(AvatarGeneration(user_id=current_user.id))
        db.commit()
    except Exception:
        db.rollback()
        logger.error("Falha ao registrar geracao de avatar (user_id=%s)", current_user.id, exc_info=True)

    new_keys: list[str] = []
    try:
        photo_key, photo_thumb_key = upload_private_profile_images(photo_copy, "jpg")
        new_keys += [k for k in (photo_key, photo_thumb_key) if k]
        avatar_key, avatar_thumb_key = upload_private_profile_images(result_bytes, "png")
        new_keys += [k for k in (avatar_key, avatar_thumb_key) if k]
        # Mantem a escolha atual (foto ou avatar); na primeira vez, o avatar recem criado. A copia publica da escolhida e recriada porque a
        # imagem em uso mudou.
        source = current_user.avatar_source or avatar_profile.SOURCE_AVATAR
        display_key, display_thumb = (photo_key, photo_thumb_key) if source == avatar_profile.SOURCE_PHOTO else (avatar_key, avatar_thumb_key)
        url, thumb_url = avatar_profile.resolve_display(display_key, display_thumb)
    except StorageError as e:
        logger.error("Falha no armazenamento do avatar (user_id=%s): %s", current_user.id, e)
        for key in new_keys:
            avatar_profile.delete_stored_key(key)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    old_urls = (current_user.avatar_url, current_user.avatar_thumb_url)
    old_keys = avatar_profile.stored_keys(current_user)
    current_user.profile_photo_key, current_user.profile_photo_thumb_key = photo_key, photo_thumb_key
    current_user.generated_avatar_key, current_user.generated_avatar_thumb_key = avatar_key, avatar_thumb_key
    current_user.avatar_url, current_user.avatar_thumb_url = url, thumb_url  # as duas colunas na MESMA transacao
    current_user.avatar_source = source
    current_user.avatar_consent_at = datetime.utcnow()
    current_user.avatar_consent_version = avatar_profile.AVATAR_CONSENT_VERSION
    db.commit()
    db.refresh(current_user)

    # So depois de gravar: apaga o que foi substituido (best-effort, erros so logados): copia publica anterior e chaves antigas.
    for old in old_urls:
        delete_object_by_url(old)
    for key in old_keys:
        avatar_profile.delete_stored_key(key)
    return AvatarOut(avatar_url=url, avatar_thumb_url=thumb_url, avatar_source=source)


@router.put("/me/avatar-source", response_model=AvatarOut)
def set_my_avatar_source(
    payload: AvatarSourceIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Alterna entre usar a foto ou o avatar (sem gerar nada e sem consumir cota). A imagem escolhida ganha a copia publica; a anterior perde a dela
    (a original continua guardada em privado, so o dono a ve)."""
    _require_adult_for_avatar(current_user)
    key, thumb_key = avatar_profile.keys_for(current_user, payload.source)
    if not key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voce ainda nao tem essa imagem.")
    if current_user.avatar_source == payload.source and current_user.avatar_url:
        return AvatarOut(avatar_url=current_user.avatar_url, avatar_thumb_url=current_user.avatar_thumb_url, avatar_source=payload.source)
    try:
        url, thumb_url = avatar_profile.resolve_display(key, thumb_key)
    except StorageError as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))
    old_urls = (current_user.avatar_url, current_user.avatar_thumb_url)
    current_user.avatar_url, current_user.avatar_thumb_url = url, thumb_url
    current_user.avatar_source = payload.source
    db.commit()
    db.refresh(current_user)
    avatar_profile.delete_previous_public_copies(current_user, old_urls)
    return AvatarOut(avatar_url=url, avatar_thumb_url=thumb_url, avatar_source=payload.source)


@router.delete("/me/avatar", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_avatar(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove foto e avatar (zera as colunas e apaga TODOS os objetos do S3, best-effort). Idempotente: sem nada, tambem responde 204."""
    remove_user_avatar(db, current_user)


@router.post("/me/delete", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_account(
    payload: AccountDeleteRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Exclusao de conta IMEDIATA e irreversivel (Apple 5.1.1(v)): apaga a conta e os dados da pessoa. Exige a senha atual e
    a palavra EXCLUIR. 422 confirmacao diferente de EXCLUIR; 429 muitas tentativas; 401 senha incorreta (conta no mesmo
    limite do login); 409 pendencia (ultimo admin; perfil de profissional antigo com alunos/desafios ativos);
    204 em sucesso (nenhuma chamada a provedor de pagamento: a assinatura do app se cancela na App Store). Ver services/account_deletion.py.
    """
    if payload.confirmation.strip() != CONFIRMATION_WORD:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Digite {CONFIRMATION_WORD} para confirmar a exclusao da conta.",
        )

    ip = client_ip(request)
    retry_after = login_throttle.blocked_for(current_user.email, ip)
    if retry_after:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Muitas tentativas. Tente novamente em alguns minutos.",
            headers={"Retry-After": str(retry_after)},
        )
    if not verify_password(payload.password, current_user.hashed_password):
        login_throttle.record_failure(current_user.email, ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Senha incorreta")
    login_throttle.reset_email(current_user.email)

    try:
        delete_user_account(db, current_user)
    except AccountDeletionBlocked as blocked:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(blocked))
    except AccountAlreadyGone:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Não foi possível validar as credenciais",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/search", response_model=list[UserSearchResult])
def search_users(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Busca simples por nome (ILIKE), excluindo o proprio usuario logado.
    Mostra todo mundo em vez de filtrar quem ja e seguido -- e mais direto
    sinalizar is_following em cada resultado do que decidir uma regra de
    exclusao, e deixa o usuario ver quem ja segue sem precisar lembrar.
    """
    rows = (
        db.query(User)
        .filter(User.name.ilike(f"%{q}%"), User.id != current_user.id, not_blocked(User.id, current_user.id))
        .order_by(User.name.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    following_ids = {
        row[0] for row in db.query(Follow.following_id).filter(Follow.follower_id == current_user.id).all()
    }
    return [
        UserSearchResult(id=u.id, name=u.name, is_following=u.id in following_ids, **avatar_fields(u, current_user.id))
        for u in rows
    ]


@router.get("/suggestions", response_model=list[UserSearchResult])
def get_suggestions(
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    V1 simples e honesta (nao havia nenhuma logica de sugestao antes):
    usuarios que o usuario logado ainda nao segue, mais recentes primeiro.
    Sem algoritmo de recomendacao -- so garante uma lista nao-vazia quando
    existem usuarios pra sugerir, em vez de inventar um criterio complexo.
    """
    following_ids = db.query(Follow.following_id).filter(Follow.follower_id == current_user.id).subquery()
    rows = (
        db.query(User)
        .filter(User.id != current_user.id, User.id.notin_(following_ids), not_blocked(User.id, current_user.id))
        .order_by(User.created_at.desc())
        .limit(limit)
        .all()
    )
    return [UserSearchResult(id=u.id, name=u.name, is_following=False, **avatar_fields(u, current_user.id)) for u in rows]


@router.post("/match-contacts", response_model=list[MatchedContact])
def match_contacts(
    payload: ContactsMatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    So retorna usuarios ja cadastrados cujo phone_number bate com algum
    numero de algum contato da lista enviada -- nunca devolve telefone na
    resposta (so contact_ref/id/nome) e nunca persiste os numeros
    recebidos, usados so pra essa consulta pontual. contact_ref e um
    identificador LOCAL do dispositivo (nao sensivel, opaco pro backend),
    devolvido de volta so pra o cliente saber qual contato da agenda deu
    match sem precisar re-expor o telefone de ninguem.

    Como nenhum usuario tem telefone salvo ainda (ver User.phone_number),
    isso genuinamente nao deve retornar matches hoje -- infraestrutura
    pronta pra quando/se telefone passar a ser coletado em algum momento.
    """
    if not payload.contacts:
        return []

    number_to_ref: dict[str, str] = {}
    all_numbers: set[str] = set()
    for entry in payload.contacts:
        for number in entry.phone_numbers:
            all_numbers.add(number)
            number_to_ref.setdefault(number, entry.contact_ref)

    if not all_numbers:
        return []

    rows = (
        db.query(User)
        .filter(
            User.phone_number.isnot(None),
            User.phone_number.in_(all_numbers),
            User.id != current_user.id,
            not_blocked(User.id, current_user.id),
        )
        .all()
    )

    following_ids = {
        row[0] for row in db.query(Follow.following_id).filter(Follow.follower_id == current_user.id).all()
    }
    results = []
    for u in rows:
        ref = number_to_ref.get(u.phone_number)
        if ref:
            results.append(
                MatchedContact(
                    contact_ref=ref,
                    id=u.id,
                    name=u.name,
                    is_following=u.id in following_ids,
                    **avatar_fields(u, current_user.id),
                )
            )
    return results


@router.get("/{user_id}/profile", response_model=PublicProfileOut)
def get_public_profile(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Perfil publico: id, nome, avatar, selo Pro/Team, contagens de seguidores/seguindo e, para maiores de 18 com data
    de nascimento, Overall + 4 atributos (30 dias) e sequencias. Avatar e estatisticas seguem core/avatar_visibility
    (menores e quem nao informou a data: avatar e estatisticas null). Nunca devolve calorias, refeicoes, peso, localizacao,
    e-mail nem data de nascimento. Numero constante de consultas (sem laco por registro). 404 se nao existir (id invalido
    tambem)."""
    try:
        parsed_id = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")
    user = db.query(User).filter(User.id == parsed_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")

    # Quem me bloqueou nao me deixa ver o perfil (404 generico, sem revelar o bloqueio); eu bloqueei: perfil normal.
    is_self = user.id == current_user.id
    if not is_self and has_blocked(db, user.id, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")
    is_blocked_by_me = (not is_self) and has_blocked(db, current_user.id, user.id)

    badges = compute_user_badges(db, user.id)
    followers_count, following_count = db.query(
        db.query(func.count(Follow.id)).filter(Follow.following_id == user.id).scalar_subquery(),
        db.query(func.count(Follow.id)).filter(Follow.follower_id == user.id).scalar_subquery(),
    ).one()

    stats: dict = {}
    if can_show_stats(user, current_user.id):
        overall = compute_overall(db, user.id)
        current_streak_days, best_streak_days = _compute_training_streaks(db, user.id)
        stats = {
            **overall.model_dump(),
            "current_streak_days": current_streak_days,
            "best_streak_days": best_streak_days,
        }

    return PublicProfileOut(
        id=user.id,
        name=user.name,
        **avatar_fields(user, current_user.id),
        **stats,
        is_pro=badges.is_pro,
        teams=badges.teams,
        followers_count=followers_count,
        following_count=following_count,
        is_blocked_by_me=is_blocked_by_me,
        username=user.username,
        # Bio e link: o dono sempre ve; para outras pessoas, so de maiores de 18 com data de nascimento (mesma regra das estatisticas).
        bio=user.bio if can_show_stats(user, current_user.id) else None,
        link=user.link if can_show_stats(user, current_user.id) else None,
    )


def compute_user_badges(db: Session, user_id: uuid.UUID) -> UserBadgesOut:
    """Selo Pro (assinatura base ativa). `teams` continua na resposta, sempre vazio: o selo Team (modo professor) saiu do
    produto, e o campo fica so para o app antigo nao quebrar ate ele deixar de le-lo."""
    return UserBadgesOut(is_pro=has_active_pro_subscription(db, user_id), teams=[])


@router.get("/{user_id}/badges", response_model=UserBadgesOut)
def get_user_badges(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Selo Pro (assinatura da plataforma). `teams` vem sempre vazio (selo Team removido com o modo professor; o campo
    fica so para compatibilidade com o app antigo).
    Publico pra qualquer usuario autenticado ver, tanto no proprio perfil
    quanto no perfil de terceiros — e informacao que faz sentido como prova
    social.
    """
    parsed_id = _parse_user_id(user_id, db)
    # Bloqueio em qualquer sentido: mesmo 404 de usuario inexistente (nao revela o bloqueio).
    if parsed_id != current_user.id and is_blocked_between(db, current_user.id, parsed_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")

    return compute_user_badges(db, parsed_id)
