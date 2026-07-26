from pydantic import BaseModel


class ActivityInsightOut(BaseModel):
    summary: str
    highlight: str | None = None
    suggestion: str
