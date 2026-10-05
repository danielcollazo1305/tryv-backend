from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.search_text import normalize_search_text
from app.models.shoe_model import ShoeModel
from app.models.user import User
from app.schemas.shoe_model import ShoeModelOut

# Catalogo de tenis (marca + familia de modelo) pro cadastro de equipamento. Sem Pro-gate: cadastrar
# equipamento e gratuito. Mesmo padrao de busca de routers/foods.py.
router = APIRouter(prefix="/shoe-models", tags=["shoe-models"])


def _escape_like(token: str) -> str:
    """Escapa %, _ e a propria barra pra o token valer como texto literal no LIKE."""
    return token.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("", response_model=list[ShoeModelOut])
@router.get("/", response_model=list[ShoeModelOut], include_in_schema=False)
def search_shoe_models(
    q: str = Query(..., min_length=2),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Busca no catalogo. A consulta e normalizada (minuscula, sem acento, pontuacao vira espaco) e quebrada
    em tokens; TODOS precisam aparecer como substring de search_name, em qualquer ordem ("pegasus nike"
    acha "Nike Pegasus"). Ranking: nome que COMECA com o primeiro token, depois mais curto, depois
    alfabetico. So modelos ativos. Tabela vazia -> [].
    """
    tokens = normalize_search_text(q).split()
    if not tokens:
        return []

    query = db.query(ShoeModel).filter(ShoeModel.active.is_(True))
    for token in tokens:
        query = query.filter(ShoeModel.search_name.ilike(f"%{_escape_like(token)}%", escape="\\"))

    starts_with_first = case(
        (ShoeModel.search_name.ilike(f"{_escape_like(tokens[0])}%", escape="\\"), 0),
        else_=1,
    )
    return (
        query.order_by(starts_with_first, func.length(ShoeModel.search_name), ShoeModel.search_name)
        .limit(limit)
        .all()
    )
