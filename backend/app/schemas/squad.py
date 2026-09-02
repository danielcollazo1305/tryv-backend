import uuid
from datetime import datetime

from pydantic import BaseModel, Field

MAX_SQUAD_MEMBERS = 9


class SquadCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)


class SquadJoin(BaseModel):
    invite_code: str = Field(..., min_length=6, max_length=6)


class SquadMemberOut(BaseModel):
    user_id: uuid.UUID
    name: str
    total_xp: int
    is_you: bool


class SquadOut(BaseModel):
    id: uuid.UUID
    name: str
    invite_code: str
    created_by: uuid.UUID
    created_at: datetime
    member_count: int
    max_members: int = MAX_SQUAD_MEMBERS
    members: list[SquadMemberOut] = []

    class Config:
        from_attributes = True


class LevelInfoOut(BaseModel):
    level: int
    xp_current: int
    xp_next_level: int
    total_xp: int


class SquadMeOut(BaseModel):
    level_info: LevelInfoOut
    squad: SquadOut | None = None


class IndividualRankingEntryOut(BaseModel):
    position: int
    user_id: uuid.UUID
    name: str
    squad_name: str | None = None
    total_xp: int
    weekly_xp: int


class SquadRankingEntryOut(BaseModel):
    position: int
    squad_id: uuid.UUID
    name: str
    member_count: int
    total_xp: int
    weekly_xp: int


class TerritoryCityOut(BaseModel):
    city: str
    total_points: int
    dominant_squad_id: uuid.UUID | None = None
    dominant_squad_name: str | None = None
    dominant_squad_percent: float | None = None
