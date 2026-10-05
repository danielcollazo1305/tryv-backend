from sqlalchemy import Boolean, Column, Float, Integer, String, text

from app.core.database import Base


class ShoeModel(Base):
    """
    Catalogo de tenis (marca + familia de modelo, SEM numero de versao: "Nike Pegasus", nao "Pegasus 40")
    pra escolher no cadastro de equipamento. type: "road" | "trail" | "racing" (validacao de aplicacao,
    nao enum do banco). search_name usa a mesma normalizacao de core/search_text.normalize_search_text
    (a mesma regra da tabela foods), entao a busca ignora acento, caixa e ordem das palavras.
    A tabela nasce vazia; a carga do catalogo e uma migration posterior.
    """
    __tablename__ = "shoe_models"

    id = Column(Integer, primary_key=True)
    brand = Column(String, nullable=False)
    model = Column(String, nullable=False)
    type = Column(String, nullable=False)
    default_lifespan_km = Column(Float, nullable=False)
    active = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    search_name = Column(String, nullable=False, index=True)
