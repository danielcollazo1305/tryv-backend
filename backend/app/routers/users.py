import logging
import math
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.avatar_generation import AvatarGeneration
from app.models.social import Follow
from app.models.subscription import Subscription
from app.models.trainer import Trainer
from app.models.user import User
from app.routers.media import MAX_IMAGE_FILE_SIZE_BYTES
from app.schemas.subscription import TeamBadge, UserBadgesOut
from app.schemas.user import AvatarOut, ContactsMatchRequest, MatchedContact, UserOut, UserSearchResult, UserUpdate
from app.services.avatar_generation import AvatarGenerationError, AvatarServiceUnavailableError, generate_ps1_avatar
from app.services.storage import StorageError, upload_image

router = APIRouter(prefix="/users", tags=["users"])
logger = logging.getLogger(__name__)


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
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(current_user, field, value)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/me/avatar", response_model=AvatarOut, status_code=status.HTTP_201_CREATED)
async def generate_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Gera um avatar estilizado (estetica PS1, ver services/avatar_generation.py)
    a partir de uma selfie enviada pelo usuario. A foto original NUNCA e
    persistida (nem disco, nem S3, nem banco) -- os bytes ficam so em
    memoria entre a leitura do upload e a chamada a IA, descartados junto
    com o fim desta funcao. So o resultado estilizado (retorno da propria
    IA) e salvo, via upload_image() ja existente (pasta 'profiles', mesmo
    bucket S3 de fotos de refeicao/feed).

    Endpoint dedicado, nao reaproveita POST /media/upload generico -- esse
    fluxo tem logica propria (chama IA, descarta o original, so entao sobe
    o resultado), diferente do upload direto que esse outro endpoint faz.
    """
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

    # Limite de geracoes (settings.avatar_generation_limit a cada
    # settings.avatar_limit_window_days dias, janela deslizante), ANTES de gastar com a
    # OpenAI. Duas requisicoes simultaneas podem passar juntas pela checagem e estourar o
    # limite por 1 (aceito: nao ha lock, e o custo extra e de uma geracao).
    # max(1, ...): um valor invalido na env (0, negativo) nao pode travar nem bloquear tudo.
    limit = max(1, settings.avatar_generation_limit)
    window_days = max(1, settings.avatar_limit_window_days)
    window = timedelta(days=window_days)
    now = datetime.utcnow()
    recent_times = [
        row[0]
        for row in db.query(AvatarGeneration.created_at)
        .filter(AvatarGeneration.user_id == current_user.id, AvatarGeneration.created_at >= now - window)
        .order_by(AvatarGeneration.created_at.asc())
        .all()
    ]
    if len(recent_times) >= limit:
        # A vaga que abre primeiro e a da geracao de indice (count - limite) na ordem
        # crescente: depois que ela sai da janela, sobram limite-1 dentro dela. (Se por
        # corrida count passar do limite, so esse indice libera de verdade.) Abre em
        # created_at + janela; arredonda pra cima, minimo 1 dia.
        opens_at = recent_times[len(recent_times) - limit] + window
        days_left = max(1, math.ceil((opens_at - now).total_seconds() / 86400))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Voce atingiu o limite de {limit} avatares a cada {window_days} dias. Tente novamente em {days_left} dia(s).",
        )

    try:
        result_bytes = generate_ps1_avatar(file_bytes, content_type, user_id=current_user.id)
    except AvatarServiceUnavailableError as e:
        # Saldo/cota ou chave da OpenAI (o servico ja logou o marcador em nivel ERROR).
        # 503, nao 429: nao pode parecer o limite de geracoes. Nao consome a cota do usuario.
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except AvatarGenerationError as e:
        # Falha comum (moderacao, timeout, rede, resposta vazia): 502, nao consome a cota.
        logger.error("Falha ao gerar avatar (user_id=%s): %s", current_user.id, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    # Registra a geracao logo apos a OpenAI responder com sucesso e ANTES do S3: o
    # custo ja foi incorrido mesmo se o upload falhar. Falha em gravar o registro
    # nao bloqueia o usuario (so loga).
    try:
        db.add(AvatarGeneration(user_id=current_user.id))
        db.commit()
    except Exception:
        db.rollback()
        logger.error("Falha ao registrar geracao de avatar (user_id=%s)", current_user.id, exc_info=True)

    try:
        url = upload_image(result_bytes, "image/png", "profiles")
    except StorageError as e:
        logger.error("Falha no upload do avatar gerado (user_id=%s): %s", current_user.id, e)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

    current_user.avatar_url = url
    db.commit()
    db.refresh(current_user)
    return AvatarOut(avatar_url=url)


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
        .filter(User.name.ilike(f"%{q}%"), User.id != current_user.id)
        .order_by(User.name.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    following_ids = {
        row[0] for row in db.query(Follow.following_id).filter(Follow.follower_id == current_user.id).all()
    }
    return [UserSearchResult(id=u.id, name=u.name, is_following=u.id in following_ids) for u in rows]


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
        .filter(User.id != current_user.id, User.id.notin_(following_ids))
        .order_by(User.created_at.desc())
        .limit(limit)
        .all()
    )
    return [UserSearchResult(id=u.id, name=u.name, is_following=False) for u in rows]


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
            results.append(MatchedContact(contact_ref=ref, id=u.id, name=u.name, is_following=u.id in following_ids))
    return results


@router.get("/{user_id}/badges", response_model=UserBadgesOut)
def get_user_badges(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Selo Pro (assinatura da plataforma) e selos "Team [Professor]" (um por
    professor/nutricionista com assinatura ativa — sem prioridade unica entre
    eles, um aluno pode ter Team Personal e Team Nutri ao mesmo tempo).
    Publico pra qualquer usuario autenticado ver, tanto no proprio perfil
    quanto no perfil de terceiros — e informacao que faz sentido como prova
    social.
    """
    parsed_id = _parse_user_id(user_id, db)

    is_pro = (
        db.query(Subscription)
        .filter(
            Subscription.user_id == parsed_id,
            Subscription.type == "base",
            Subscription.status == "active",
        )
        .first()
        is not None
    )

    team_rows = (
        db.query(Trainer.professional_type, User.name)
        .select_from(Subscription)
        .join(Trainer, Subscription.trainer_id == Trainer.id)
        .join(User, Trainer.user_id == User.id)
        .filter(
            Subscription.user_id == parsed_id,
            Subscription.type == "trainer_addon",
            Subscription.status == "active",
        )
        .all()
    )
    teams = [
        TeamBadge(trainer_name=name, professional_type=professional_type)
        for professional_type, name in team_rows
    ]

    return UserBadgesOut(is_pro=is_pro, teams=teams)
