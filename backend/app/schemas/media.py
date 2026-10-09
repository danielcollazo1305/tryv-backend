from pydantic import BaseModel


class MediaUploadOut(BaseModel):
    url: str
    # Miniatura 320x240 WebP; so para folder=meals e null se nao foi possivel gerar (ou para as demais pastas).
    thumb_url: str | None = None
