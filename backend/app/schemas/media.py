from pydantic import BaseModel


class MediaUploadOut(BaseModel):
    url: str
