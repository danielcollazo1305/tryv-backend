from sqlalchemy import Boolean, Column, Float, Integer, String

from app.core.database import Base


class Food(Base):
    """Alimento da Tabela Brasileira de Composicao de Alimentos (TACO, 4a ed.,
    NEPA/UNICAMP) -- valores POR 100 g de parte comestivel. Tabela de
    referencia, somente leitura em runtime: carregada pela migration
    (c8d1f5a3e927) a partir de app/data/taco_foods.csv, sem endpoint de escrita.
    O `id` e o proprio id da TACO (estavel), nao um autoincremento.

    kcal/macros nulos = dado ausente na fonte (nao zero). kcal_estimated=True
    quando a kcal foi calculada por 4*P + 4*C + 9*L por estar ausente na TACO.
    Atribuicao/licenca: app/data/TACO_ATTRIBUTION.md."""
    __tablename__ = "foods"

    id = Column(Integer, primary_key=True, autoincrement=False)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    search_name = Column(String, nullable=False, index=True)  # ver app/core/search_text.py

    kcal = Column(Float, nullable=True)
    protein = Column(Float, nullable=True)
    carbohydrates = Column(Float, nullable=True)
    lipids = Column(Float, nullable=True)
    kcal_estimated = Column(Boolean, nullable=False, default=False, server_default="false")
