"""
Filtro de texto (E3e, fase 1): diz se um texto contem termo da lista de conteudo improprio, SEM nunca devolver o termo.

Listas: arquivos de texto versionados em app/content_filter/ (blocked_<categoria>.txt e allowed.txt; ver o README.md de
la). Este modulo so le as listas e compara; nenhuma regra de endpoint, banco ou mensagem mora aqui.

API publica:
    check_text(text) -> str | None      categoria encontrada ("selfharm", "threat", "hate", "sexual", "insult") ou None
    check_texts(*texts) -> str | None   o mesmo para varios textos (ignora None/vazio)
    lint_lists() -> list[str]           problemas nas listas (usado pelos testes)
    reload_lists()                      relê os arquivos (testes)

Como o texto e comparado (o texto original NUNCA e alterado; isto vale so para comparar):
 1. Unicode: NFKC (letras estilizadas/largas viram letras normais), remove caracteres invisiveis (categoria Cf), minusculas,
    NFKD e remove acentos/marcas combinantes (tambem riscado, sublinhado...), troca letras parecidas de outros alfabetos
    (cirilico/grego) pelas latinas.
 2. Palavras = sequencias de letras, numeros, "@" e "$". Qualquer outra coisa (espaco, ponto, emoji, hifen...) separa.
 3. Troca de letras por numeros/simbolos (0->o 1->i/l 3->e 4->a 5->s 7->t @->a $->s) SO dentro de palavras que misturam
    letras com esses numeros/simbolos ("p0rr4", "put@"). Numeros sozinhos ("10", "3x12") nao mudam. Numeros colados no
    comeco/fim tambem sao testados sem eles ("puta69").
 4. Letras repetidas viram uma so, tanto no texto quanto nas listas ("puuuuta" = "puta"). Um teste garante que isso nunca
    transforma palavra comum em termo da lista.
 5. Espacos/simbolos no meio da palavra: 3 ou mais letras soltas em sequencia ("p u t a", "p.u.t.a", "p-u-t-a") sao
    juntadas e testadas contra os termos de UMA palavra.
 6. Comparacao por PALAVRA INTEIRA (ou frase com palavras inteiras, nessa ordem): "computador" nao casa "puta". Excecao
    deliberada: dentro de uma sequencia de letras soltas (item 5) nao ha como saber onde a palavra comeca.
 7. Frases de allowed.txt sao "apagadas" antes da comparacao (ex.: "morrer de rir").
"""
import logging
import re
import unicodedata
from pathlib import Path

logger = logging.getLogger(__name__)

# Ordem = prioridade quando um texto cai em mais de uma categoria (a mensagem de autolesao e a mais importante).
CATEGORIES = ("selfharm", "threat", "hate", "sexual", "insult")
LISTS_DIR = Path(__file__).resolve().parent.parent / "content_filter"

# Letras de outros alfabetos que parecem latinas (so minusculas: o texto ja passou por casefold).
_CONFUSABLES = {
    "а": "a", "в": "b", "е": "e", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p", "с": "c", "т": "t", "у": "y",
    "х": "x", "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "ɡ": "g", "ο": "o", "α": "a", "ρ": "p", "ν": "v", "ι": "i",
    "κ": "k", "τ": "t", "υ": "u", "ε": "e", "ı": "i", "ɑ": "a",
}
_LEET = {"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s"}
_TOKEN_RE = re.compile(r"[a-z0-9@$]+")
_REPEAT_RE = re.compile(r"([a-z])\1+")
_MAX_CHARS = 100_000  # protecao de CPU: o que passar disso nao e analisado (os endpoints limitam o tamanho antes)
_MIN_RUN = 3  # letras soltas em sequencia para tentar juntar


def _clean(text: str) -> str:
    t = unicodedata.normalize("NFKC", text)
    t = "".join(ch for ch in t if unicodedata.category(ch) != "Cf")
    t = t.casefold()
    t = unicodedata.normalize("NFKD", t)
    t = "".join(ch for ch in t if unicodedata.category(ch) not in ("Mn", "Me"))
    return "".join(_CONFUSABLES.get(ch, ch) for ch in t)


def _squash(s: str) -> str:
    return _REPEAT_RE.sub(r"\1", s)


def _has_letter(s: str) -> bool:
    return any("a" <= c <= "z" for c in s)


def _forms(token: str) -> frozenset:
    """Formas pelas quais uma palavra do texto pode ser lida (original, com letras/numeros trocados, sem numeros nas pontas)."""
    forms = {token}
    if _has_letter(token) and any(c in _LEET for c in token):
        for one in ("i", "l"):
            forms.add("".join(one if c == "1" else _LEET.get(c, c) for c in token))
    forms |= {f.strip("0123456789") for f in forms if _has_letter(f)}
    return frozenset(_squash(f) for f in forms if f)


class _Lists:
    def __init__(self):
        self.single: dict[str, str] = {}
        self.stems: list[tuple[str, str]] = []
        self.phrases: dict[str, list[tuple[tuple[str, ...], str]]] = {}
        self.allowed_single: set[str] = set()
        self.allowed_phrases: dict[str, list[tuple[str, ...]]] = {}
        self.single_lengths: list[int] = []
        self.problems: list[str] = []


def _entry_tokens(raw: str) -> tuple[list[str], bool]:
    stem = raw.rstrip().endswith("*")
    cleaned = _clean(raw.rstrip().rstrip("*"))
    return [_squash(t) for t in _TOKEN_RE.findall(cleaned)], stem


def _read_entries(path: Path) -> list[str]:
    entries = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            entries.append(line)
    return entries


def _load() -> _Lists:
    lists = _Lists()
    for category in CATEGORIES:
        path = LISTS_DIR / f"blocked_{category}.txt"
        for raw in _read_entries(path):
            tokens, stem = _entry_tokens(raw)
            if not tokens:
                lists.problems.append(f"{path.name}: entrada sem letras: {raw!r}")
                continue
            if len(tokens) == 1:
                term = tokens[0]
                if len(term) < 3:
                    lists.problems.append(f"{path.name}: termo curto demais (menos de 3 letras): {raw!r}")
                if stem:
                    lists.stems.append((term, category))
                else:
                    if lists.single.get(term, category) != category:
                        lists.problems.append(f"{path.name}: termo repetido em outra categoria: {raw!r}")
                    lists.single[term] = category
            else:
                if stem:
                    lists.problems.append(f"{path.name}: '*' so vale em palavra solta: {raw!r}")
                lists.phrases.setdefault(tokens[0], []).append((tuple(tokens), category))
    for raw in _read_entries(LISTS_DIR / "allowed.txt"):
        tokens, _ = _entry_tokens(raw)
        if not tokens:
            lists.problems.append(f"allowed.txt: entrada sem letras: {raw!r}")
        elif len(tokens) == 1:
            lists.allowed_single.add(tokens[0])
        else:
            lists.allowed_phrases.setdefault(tokens[0], []).append(tuple(tokens))
    lists.single_lengths = sorted({len(t) for t in lists.single})
    return lists


_LISTS = _load()


def reload_lists() -> None:
    global _LISTS
    _LISTS = _load()


def lint_lists() -> list[str]:
    """Problemas encontrados ao ler as listas (lista vazia = tudo certo)."""
    problems = list(_LISTS.problems)
    clash = sorted(set(_LISTS.single) & _LISTS.allowed_single)
    problems += [f"termo bloqueado tambem esta em allowed.txt: {t!r}" for t in clash]
    return problems


def term_snapshot() -> dict:
    """Termos ja 'limpos' (para os testes de colisao). Nao e usado em producao."""
    return {
        "single": dict(_LISTS.single),
        "stems": list(_LISTS.stems),
        "phrases": {k: list(v) for k, v in _LISTS.phrases.items()},
    }


def _match_at(forms: list, i: int, phrase: tuple) -> bool:
    if i + len(phrase) > len(forms):
        return False
    return all(word in forms[i + k] for k, word in enumerate(phrase))


def _single_hit(lists: _Lists, form_set) -> str | None:
    for f in form_set:
        category = lists.single.get(f)
        if category:
            return category
        for prefix, cat in lists.stems:
            if f.startswith(prefix):
                return cat
    return None


def _find(text: str) -> set:
    lists = _LISTS
    cleaned = _clean(text[:_MAX_CHARS])
    raw_tokens = _TOKEN_RE.findall(cleaned)
    n = len(raw_tokens)
    if not n:
        return set()
    forms = [_forms(t) for t in raw_tokens]

    masked = [False] * n
    for i in range(n):
        for f in forms[i]:
            if f in lists.allowed_single:
                masked[i] = True
            for phrase in lists.allowed_phrases.get(f, ()):
                if _match_at(forms, i, phrase):
                    for k in range(len(phrase)):
                        masked[i + k] = True

    found: set = set()
    for i in range(n):
        if masked[i]:
            continue
        hit = _single_hit(lists, forms[i])
        if hit:
            found.add(hit)
        for f in forms[i]:
            for phrase, cat in lists.phrases.get(f, ()):
                if cat not in found and _match_at(forms, i, phrase) and not any(masked[i : i + len(phrase)]):
                    found.add(cat)

    # letras soltas em sequencia ("p u t a"): junta a sequencia inteira e procura termos de uma palavra em qualquer janela
    if lists.single_lengths or lists.stems:
        i = 0
        while i < n:
            if len(raw_tokens[i]) == 1 and not masked[i]:
                j = i
                while j < n and len(raw_tokens[j]) == 1 and not masked[j]:
                    j += 1
                if j - i >= _MIN_RUN:
                    joined = "".join(raw_tokens[i:j])
                    for variant in {joined, "".join("l" if c == "1" else _LEET.get(c, c) for c in joined),
                                    "".join("i" if c == "1" else _LEET.get(c, c) for c in joined)}:
                        squashed = _squash(variant)
                        for length in lists.single_lengths:
                            for a in range(len(squashed) - length + 1):
                                cat = lists.single.get(squashed[a : a + length])
                                if cat:
                                    found.add(cat)
                        for prefix, cat in lists.stems:
                            if prefix in squashed:
                                found.add(cat)
                i = j
            else:
                i += 1
    return found


def check_text(text: str | None) -> str | None:
    """Categoria do primeiro problema encontrado (prioridade em CATEGORIES) ou None. NUNCA devolve o termo."""
    if not text or not text.strip():
        return None
    found = _find(text)
    for category in CATEGORIES:
        if category in found:
            return category
    return None


def check_texts(*texts: str | None) -> str | None:
    """Como check_text para varios textos; devolve a categoria de maior prioridade entre todos."""
    best = None
    for text in texts:
        category = check_text(text)
        if category and (best is None or CATEGORIES.index(category) < CATEGORIES.index(best)):
            best = category
    return best
