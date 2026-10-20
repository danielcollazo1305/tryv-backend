"""
Regras do perfil (E7): @usuario (username), bio e link. Funcoes PURAS (sem banco): o endpoint decide o que fazer com o resultado.

@usuario: 3 a 20 caracteres; so a-z, 0-9, ponto e sublinhado; nao comeca nem termina com ponto/sublinhado; sem dois pontos ou
sublinhados seguidos (nem "._"); salvo em MINUSCULAS (a entrada pode vir com maiusculas); lista de reservados.
Link: so https://, URL valida, sem credenciais embutidas (user:pass@), no maximo 200 caracteres, nome de dominio ASCII (dominio
internacional vem em punycode).
"""
import math
import re
from datetime import datetime, timedelta
from urllib.parse import urlsplit

USERNAME_MIN = 3
USERNAME_MAX = 20
BIO_MAX = 150
LINK_MAX = 200
USERNAME_CHANGE_INTERVAL_DAYS = 30

# Mensagens (portugues; revisar com o dono).
USERNAME_INVALID_MESSAGE = (
    "O @usuário deve ter de 3 a 20 caracteres, só letras minúsculas, números, ponto e sublinhado, "
    "sem começar ou terminar com ponto ou sublinhado e sem dois seguidos."
)
USERNAME_RESERVED_MESSAGE = "Esse @usuário não pode ser usado. Escolha outro."
USERNAME_TAKEN_MESSAGE = "Esse @usuário já está em uso. Escolha outro."
USERNAME_CANNOT_CLEAR_MESSAGE = "O @usuário não pode ser removido depois de definido."
def username_cooldown_message(days_left: int) -> str:
    unit = "dia" if days_left == 1 else "dias"
    return f"Você só pode trocar o @usuário a cada {USERNAME_CHANGE_INTERVAL_DAYS} dias. Tente novamente em {days_left} {unit}."


LINK_INVALID_MESSAGE = "O link precisa começar com https:// e ser um endereço válido, sem usuário e senha."
PROFILE_EMPTY_MESSAGE = "Informe o @usuário, a bio e/ou o link para atualizar o perfil."

_USERNAME_RE = re.compile(r"^[a-z0-9]+(?:[._][a-z0-9]+)*$")

# Reservados (comparacao exata, em minusculas, e tambem sem pontos/sublinhados para pegar "t.r.y.v").
RESERVED_USERNAMES = frozenset(
    {
        "admin", "administrador", "administrator", "adm", "tryv", "tryvfit", "tryvapp", "tryvoficial", "suporte", "support",
        "contato", "contact", "moderacao", "moderador", "moderator", "mod", "oficial", "official", "root", "api", "null",
        "undefined", "none", "me", "eu", "you", "voce", "system", "sistema", "staff", "team", "time", "equipe", "ajuda", "help",
        "info", "sac", "noreply", "naoresponda", "security", "seguranca", "abuse", "privacidade", "privacy", "termos", "terms",
        "login", "logout", "signup", "cadastro", "register", "settings", "config", "perfil", "profile", "feed", "explorar",
        "explore", "seguindo", "following", "followers", "seguidores", "stripe", "apple", "google", "instagram", "whatsapp",
        "pro", "premium", "verified", "verificado", "vip", "tryvpro", "ranking", "desafios", "clubes", "social", "refeicoes",
        "home", "inicio", "treinar", "treino", "atividades", "galeria", "conquistas", "progresso", "convidar", "bloqueados",
        "excluir", "deletar",
    }
)

_LABEL_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")


def normalize_username(raw: str) -> str:
    """Espacos das pontas saem e vira minuscula (como e salvo)."""
    return raw.strip().lower()


def username_change_wait_days(changed_at: datetime | None, now: datetime) -> int:
    """Dias que faltam (arredondando para cima) para poder trocar o @usuario de novo; 0 = ja pode. Sem data da ultima troca = livre."""
    if changed_at is None:
        return 0
    remaining = changed_at + timedelta(days=USERNAME_CHANGE_INTERVAL_DAYS) - now
    if remaining.total_seconds() <= 0:
        return 0
    return math.ceil(remaining.total_seconds() / 86400)


def is_valid_username_format(username: str) -> bool:
    """Formato (ja normalizado): tamanho 3 a 20 e padrao de caracteres/separadores."""
    return USERNAME_MIN <= len(username) <= USERNAME_MAX and bool(_USERNAME_RE.match(username))


def is_reserved_username(username: str) -> bool:
    return username in RESERVED_USERNAMES or username.replace(".", "").replace("_", "") in RESERVED_USERNAMES


def username_filter_texts(username: str) -> list[str]:
    """Textos para o filtro de linguagem: o @usuario com separadores trocados por espaco (cada pedaco como palavra) e colado
    (para pegar palavra quebrada por ponto/sublinhado)."""
    spaced = username.replace(".", " ").replace("_", " ")
    return [spaced, username.replace(".", "").replace("_", "")]


def clean_link(raw: str) -> str | None:
    """Link validado (sem espacos nas pontas) ou None se nao aceito. So https, sem credenciais, ate 200 caracteres."""
    link = raw.strip()
    if not link or len(link) > LINK_MAX or any(ch.isspace() or ord(ch) < 32 or ord(ch) == 127 for ch in link):
        return None
    try:
        parts = urlsplit(link)
        hostname = parts.hostname
        parts.port  # noqa: B018 -- levanta ValueError se a porta for invalida
    except ValueError:
        return None
    if parts.scheme.lower() != "https" or not hostname:
        return None
    if parts.username is not None or parts.password is not None or "@" in parts.netloc:
        return None
    host = hostname.lower()
    labels = host.split(".")
    if len(labels) < 2 or len(host) > 253 or not all(_LABEL_RE.match(label) and len(label) <= 63 for label in labels):
        return None
    if not labels[-1].isalpha() and not labels[-1].startswith("xn--"):
        return None
    return link
