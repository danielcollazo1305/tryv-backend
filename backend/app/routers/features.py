from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.config import settings
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/features", tags=["features"])


class FeaturesOut(BaseModel):
    sleep_api_enabled: bool
    agent_enabled: bool


@router.get("", response_model=FeaturesOut)
def get_features(current_user: User = Depends(get_current_user)):
    """
    Chaves de funcionalidades do servidor (env SLEEP_API_ENABLED e AGENT_ENABLED, ambas desligadas por padrao), para o app decidir
    o que mostrar. Exige login (como o resto da API), mas nao exige Pro: quem pode usar cada funcionalidade e decidido em cada rota.
    Os valores sao lidos a cada chamada, nao ficam em cache no app pelo servidor.
    """
    return FeaturesOut(sleep_api_enabled=settings.sleep_api_enabled, agent_enabled=settings.agent_enabled)
