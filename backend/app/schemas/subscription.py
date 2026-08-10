from pydantic import BaseModel


class CheckoutSessionOut(BaseModel):
    checkout_url: str


class TeamBadge(BaseModel):
    trainer_name: str
    professional_type: str  # 'personal_trainer' | 'nutritionist'


class UserBadgesOut(BaseModel):
    is_pro: bool
    teams: list[TeamBadge]
