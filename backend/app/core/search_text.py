import re
import unicodedata

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def normalize_search_text(text: str) -> str:
    """
    Texto de busca: minusculo, sem acentos (NFKD + remove marcas combinantes),
    e tudo que nao for letra/numero (virgula, barra, parenteses, hifen...) vira
    espaco, com espacos colapsados. E a MESMA regra usada pra gerar a coluna
    `search_name` da tabela foods (app/data/taco_foods.csv), entao a busca por
    "linguica" casa "Lingüiça" e "cozido arroz" casa "Arroz, integral, cozido".
    """
    decomposed = unicodedata.normalize("NFKD", text)
    without_accents = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return _NON_ALNUM.sub(" ", without_accents.lower()).strip()
