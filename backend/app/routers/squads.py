import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.points_event import PointsEvent
from app.models.squad import Squad, SquadMembership
from app.models.user import User
from app.schemas.squad import (
    MAX_SQUAD_MEMBERS,
    LevelInfoOut,
    SquadCreate,
    SquadJoin,
    SquadMemberOut,
    SquadMeOut,
    SquadOut,
)
from app.services.leveling import compute_level_info
from app.services.squad_invite import generate_unique_invite_code

router = APIRouter(prefix="/squads", tags=["squads"])


def _total_xp(db: Session, user_id: uuid.UUID) -> int:
    return int(db.query(func.sum(PointsEvent.amount)).filter(PointsEvent.user_id == user_id).scalar() or 0)


def _get_membership(db: Session, user_id: uuid.UUID) -> SquadMembership | None:
    return db.query(SquadMembership).filter(SquadMembership.user_id == user_id).first()


def _to_squad_out(db: Session, squad: Squad, current_user_id: uuid.UUID) -> SquadOut:
    memberships = db.query(SquadMembership).filter(SquadMembership.squad_id == squad.id).all()
    member_ids = [m.user_id for m in memberships]
    users_by_id = {
        u.id: u for u in db.query(User).filter(User.id.in_(member_ids)).all()
    } if member_ids else {}

    members = [
        SquadMemberOut(
            user_id=member_id,
            name=users_by_id[member_id].name if member_id in users_by_id else "",
            total_xp=_total_xp(db, member_id),
            is_you=member_id == current_user_id,
        )
        for member_id in member_ids
    ]

    return SquadOut(
        id=squad.id,
        name=squad.name,
        invite_code=squad.invite_code,
        created_by=squad.created_by,
        created_at=squad.created_at,
        member_count=len(members),
        max_members=MAX_SQUAD_MEMBERS,
        members=members,
    )


@router.post("/", response_model=SquadOut, status_code=status.HTTP_201_CREATED)
def create_squad(
    payload: SquadCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if _get_membership(db, current_user.id) is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Voce ja esta em um squad -- saia antes de criar um novo",
        )

    squad = Squad(
        name=payload.name,
        created_by=current_user.id,
        invite_code=generate_unique_invite_code(db),
    )
    db.add(squad)
    db.commit()
    db.refresh(squad)

    membership = SquadMembership(squad_id=squad.id, user_id=current_user.id)
    db.add(membership)
    db.commit()

    return _to_squad_out(db, squad, current_user.id)


@router.post("/join", response_model=SquadOut)
def join_squad(
    payload: SquadJoin,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    squad = db.query(Squad).filter(Squad.invite_code == payload.invite_code.upper()).first()
    if not squad:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Codigo de convite invalido")

    existing_membership = _get_membership(db, current_user.id)
    if existing_membership is not None:
        if existing_membership.squad_id == squad.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voce ja esta nesse squad")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Voce ja esta em outro squad -- saia antes de entrar em um novo",
        )

    member_count = db.query(SquadMembership).filter(SquadMembership.squad_id == squad.id).count()
    if member_count >= MAX_SQUAD_MEMBERS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Este squad ja esta cheio")

    membership = SquadMembership(squad_id=squad.id, user_id=current_user.id)
    db.add(membership)
    db.commit()

    return _to_squad_out(db, squad, current_user.id)


@router.delete("/membership", status_code=status.HTTP_204_NO_CONTENT)
def leave_squad(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    membership = _get_membership(db, current_user.id)
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Voce nao esta em nenhum squad")

    db.delete(membership)
    db.commit()


@router.delete("/{squad_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_squad(
    squad_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    squad = db.query(Squad).filter(Squad.id == squad_id).first()
    if not squad:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Squad nao encontrado")
    if squad.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="So o dono pode deletar o squad")

    # Sem CASCADE no banco (decisao da Fase 1) -- apaga as memberships
    # manualmente antes do squad, na mesma transacao.
    db.query(SquadMembership).filter(SquadMembership.squad_id == squad.id).delete()
    db.delete(squad)
    db.commit()


@router.get("/me", response_model=SquadMeOut)
def get_my_squad(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    level_info = compute_level_info(_total_xp(db, current_user.id))

    membership = _get_membership(db, current_user.id)
    squad_out = None
    if membership is not None:
        squad = db.query(Squad).filter(Squad.id == membership.squad_id).first()
        squad_out = _to_squad_out(db, squad, current_user.id)

    return SquadMeOut(
        level_info=LevelInfoOut(
            level=level_info.level,
            xp_current=level_info.xp_current,
            xp_next_level=level_info.xp_next_level,
            total_xp=level_info.total_xp,
        ),
        squad=squad_out,
    )
