"""
Limite de requisicoes por chave (janela deslizante) em MEMORIA, para rotas que poderiam virar enumeracao em massa
(GET /users/username-available). Mesmo estilo e mesma limitacao de core/login_throttle.py: o estado vive neste processo
(hoje o servico roda com 1 instancia; com mais de uma, cada instancia teria o seu contador, e um reinicio zera tudo).

Cada chamada conta (diferente do login, que so conta falhas). Passou do teto na janela: responde 429 com Retry-After.
O relogio e `_now()` (monotonico); os testes o substituem para congelar/avancar o tempo.
"""
import threading
import time
from collections import deque

from fastapi import HTTPException, status

_MAX_TRACKED_KEYS = 100_000


def _now() -> float:
    return time.monotonic()


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = window_seconds
        self._lock = threading.Lock()
        self._hits: dict[str, deque[float]] = {}

    def check(self, key: str) -> int:
        """Registra uma chamada. Devolve 0 se ainda cabe; senao, os segundos ate liberar (a chamada barrada NAO e contada)."""
        now = _now()
        with self._lock:
            if len(self._hits) > _MAX_TRACKED_KEYS:
                self._hits = {k: q for k, q in self._hits.items() if q and now - q[-1] < self.window}
            q = self._hits.setdefault(key, deque())
            while q and now - q[0] >= self.window:
                q.popleft()
            if len(q) >= self.limit:
                return max(1, int(self.window - (now - q[0]) + 0.999))
            q.append(now)
            return 0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


def enforce(limiter: SlidingWindowLimiter, key: str, message: str = "Muitas consultas. Tente novamente em instantes.") -> None:
    retry_after = limiter.check(key)
    if retry_after:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=message,
            headers={"Retry-After": str(retry_after)},
        )
