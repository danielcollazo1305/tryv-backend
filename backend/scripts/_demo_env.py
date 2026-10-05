"""
Configuracao compartilhada dos scripts de demonstracao (seed_demo_data.py e verify_trainers_and_challenges.py).

Nenhum segredo nem URL de producao fica no codigo: tudo vem de variaveis de ambiente, e o script PARA com uma
mensagem clara se faltar alguma (sem valor padrao).

Variaveis:
    TRYV_API_URL         URL base da API alvo (ex: http://localhost:8000). Obrigatoria.
    TRYV_DEMO_PASSWORD   senha das contas de demonstracao. Obrigatoria (escolha uma senha forte; nao a reutilize).

Antes de rodar contra qualquer API que NAO seja local, o script pede confirmacao explicita (digitar o host).
"""

import os
import sys
from urllib.parse import urlparse

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _fail(message: str) -> None:
    print(f"ERRO: {message}", file=sys.stderr)
    sys.exit(1)


def get_base_url() -> str:
    url = os.environ.get("TRYV_API_URL", "").strip().rstrip("/")
    if not url:
        _fail(
            "defina TRYV_API_URL com a URL da API alvo (ex: TRYV_API_URL=http://localhost:8000). "
            "Nao ha valor padrao, de proposito: assim o script nunca atinge producao por engano."
        )
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        _fail(f"TRYV_API_URL invalida: {url!r} (use o formato http://host:porta ou https://host)")
    return url


def get_demo_password() -> str:
    password = os.environ.get("TRYV_DEMO_PASSWORD", "")
    if not password:
        _fail(
            "defina TRYV_DEMO_PASSWORD com a senha das contas de demonstracao. "
            "Nao ha valor padrao, de proposito: a senha nao pode ficar no codigo."
        )
    return password


def confirm_target(base_url: str) -> None:
    """Alvo local segue direto. Qualquer outro host (ex: producao) exige digitar o nome do host, num terminal
    interativo; sem terminal (CI, pipe) o script aborta em vez de assumir que pode seguir."""
    host = urlparse(base_url).hostname or ""
    if host in LOCAL_HOSTS:
        print(f"Alvo local: {base_url}")
        return

    print("=" * 78)
    print(f"ATENCAO: este script vai CRIAR dados reais em {base_url}")
    print("Se isso for producao, as contas e registros criados ficam la.")
    print("=" * 78)
    if not sys.stdin.isatty():
        _fail("sem terminal interativo para confirmar. Rode manualmente num terminal.")
    try:
        typed = input(f"Para continuar, digite exatamente o host ({host}) ou Enter para cancelar: ").strip()
    except EOFError:
        # Alguns ambientes (ex: Windows com NUL/pipe) se declaram terminal mas nao entregam entrada.
        print()
        _fail("nao foi possivel ler a confirmacao (sem entrada interativa). Rode manualmente num terminal.")
    if typed != host:
        print("Cancelado. Nada foi enviado.")
        sys.exit(1)
    print("Confirmado.\n")
