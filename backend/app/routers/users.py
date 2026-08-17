import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.social import Follow
from app.models.subscription import Subscription
from app.models.trainer import Trainer
from app.models.user import User
from app.schemas.subscription import TeamBadge, UserBadgesOut
from app.schemas.user import ContactsMatchRequest, MatchedContact, UserOut, UserSearchResult, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


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
