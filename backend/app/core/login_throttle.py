"""
Limite de tentativas de login (POST /auth/login): janela deslizante em MEMORIA.

Regras (Settings, env automatica: LOGIN_MAX_FAILED_ATTEMPTS, LOGIN_WINDOW_MINUTES,
LOGIN_MAX_FAILED_ATTEMPTS_PER_IP):
  - conta SO tentativas que FALHARAM, por e-mail normalizado (minusculo, sem espacos) e tambem por IP;
  - e-mail com >= login_max_failed_attempts falhas na janela, ou IP com >= login_max_failed_attempts_per_ip,
    fica bloqueado: o endpoint responde 429 (com Retry-After) ANTES de olhar a senha -- vale igual para e-mail
    que existe e que nao existe, e mesmo com a senha certa, ate a falha mais antiga sair da janela;
  - tentativa bloqueada (429) nao e contada: nao prolonga o bloqueio;
  - login com sucesso zera o contador daquele e-mail (o do IP nao: um atacante com uma conta propria nao pode
    "lavar" o teto por IP).

LIMITACAO: o estado vive na memoria deste processo. Hoje o servico roda com 1 instancia (Railway); com mais de
uma, cada instancia teria seu proprio contador (o limite efetivo viraria N x o configurado) e um reinicio zera
tudo. Se escalar, trocar o armazenamento por tabela no Postgres ou Redis mantendo esta mesma interface.
"""

import threading
import time
from collections import deque

from fastapi import Request

from app.core.config import settings

# Protecao de memoria: passou disso (mesmo apos limpar o vencido), e-mails novos deixam de ser rastreados.
# O teto por IP continua valendo.
_MAX_TRACKED_KEYS = 100_000
_CLEANUP_INTERVAL_SECONDS = 60


def _now() -> float:
    """Relogio unico do modulo (monotonico). Os testes substituem esta funcao para congelar/avancar o tempo."""
    return time.monotonic()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def client_ip(request: Request) -> str:
    """IP de quem chamou. Atras do proxy do Railway, request.client.host e o do proxy (igual para todo mundo),
    entao usa a ULTIMA entrada de X-Forwarded-For -- a que o proxy confiavel acrescentou, que o cliente nao
    controla (as anteriores podem ser forjadas). Sem o cabecalho (dev local), usa o IP da conexao."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        last = forwarded.split(",")[-1].strip()
        if last:
            return last
    return request.client.host if request.client else "unknown"


class LoginThrottle:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._by_email: dict[str, deque[float]] = {}
        self._by_ip: dict[str, deque[float]] = {}
        self._last_cleanup = _now()

    # -- internos (chamar com o lock) ------------------------------------------------------------------
    @staticmethod
    def _window_seconds() -> float:
        return settings.login_window_minutes * 60

    def _prune(self, bucket: dict[str, deque[float]], now: float) -> None:
        limit = now - self._window_seconds()
        for key in [k for k, dq in bucket.items() if not dq or dq[-1] <= limit]:
            del bucket[key]

    def _maybe_cleanup(self, now: float, force: bool = False) -> None:
        if force or now - self._last_cleanup >= _CLEANUP_INTERVAL_SECONDS:
            self._prune(self._by_email, now)
            self._prune(self._by_ip, now)
            self._last_cleanup = now

    def _live(self, bucket: dict[str, deque[float]], key: str, now: float) -> deque[float] | None:
        dq = bucket.get(key)
        if dq is None:
            return None
        limit = now - self._window_seconds()
        while dq and dq[0] <= limit:
            dq.popleft()
        if not dq:
            del bucket[key]
            return None
        return dq

    def _retry_after(self, dq: deque[float], max_failures: int, now: float) -> int:
        """Segundos ate a contagem cair abaixo do limite (quando a falha que 'sobra' sai da janela)."""
        blocking = dq[len(dq) - max_failures]
        return max(1, int(blocking + self._window_seconds() - now + 0.999))

    # -- API publica -----------------------------------------------------------------------------------
    def blocked_for(self, email: str, ip: str) -> int:
        """0 se pode tentar; senao, segundos de espera (Retry-After)."""
        key = normalize_email(email)
        now = _now()
        with self._lock:
            self._maybe_cleanup(now)
            waits = []
            dq = self._live(self._by_email, key, now)
            if dq is not None and len(dq) >= settings.login_max_failed_attempts:
                waits.append(self._retry_after(dq, settings.login_max_failed_attempts, now))
            dq_ip = self._live(self._by_ip, ip, now)
            if dq_ip is not None and len(dq_ip) >= settings.login_max_failed_attempts_per_ip:
                waits.append(self._retry_after(dq_ip, settings.login_max_failed_attempts_per_ip, now))
            return max(waits) if waits else 0

    def record_failure(self, email: str, ip: str) -> None:
        key = normalize_email(email)
        now = _now()
        with self._lock:
            if len(self._by_email) >= _MAX_TRACKED_KEYS:
                self._maybe_cleanup(now, force=True)
            if key in self._by_email or len(self._by_email) < _MAX_TRACKED_KEYS:
                self._by_email.setdefault(key, deque()).append(now)
            if ip in self._by_ip or len(self._by_ip) < _MAX_TRACKED_KEYS:
                self._by_ip.setdefault(ip, deque()).append(now)

    def reset_email(self, email: str) -> None:
        with self._lock:
            self._by_email.pop(normalize_email(email), None)

    def clear(self) -> None:
        """So para testes."""
        with self._lock:
            self._by_email.clear()
            self._by_ip.clear()


login_throttle = LoginThrottle()
