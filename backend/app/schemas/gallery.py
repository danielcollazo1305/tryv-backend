import uuid
from datetime import datetime

from pydantic import BaseModel


class GalleryItem(BaseModel):
    post_id: uuid.UUID
    # Foto do post (o post nao tem miniatura propria). Nunca devolve legenda, autor nem contagens: so o minimo da grade.
    url: str
    created_at: datetime
    # Quantas fotos o post tem (>= 1); a grade mostra so a capa e usa isto para o icone de varias fotos.
    photo_count: int = 1


class GalleryPage(BaseModel):
    items: list[GalleryItem]
    # Cursor opaco da proxima pagina; null = acabaram as fotos. Nao montar nem interpretar.
    next_cursor: str | None = None
