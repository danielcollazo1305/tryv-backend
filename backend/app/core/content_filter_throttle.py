"""
Limite de tentativas BLOQUEADAS por IP, em MEMORIA, para o cadastro (POST /auth/register), onde ainda nao existe usuario.
Mesmo estilo de core/login_throttle.py: nada de IP no banco; o estado vive neste processo (hoje o servico roda com 1
instancia; com mais de uma, cada instancia teria o seu contador, e um reinicio zera tudo).

Regras (as mesmas do limite por usuario, em services/content_filter_guard.py):
  - 10 bloqueios na ultima hora  -> pausa de 30 minutos (a partir do ULTIMO bloqueio);
  - 30 bloqueios nas ultimas 24 h -> pausa de 24 horas.
Tentativa durante a pausa NAO e registrada (nao prolonga a pausa). O relogio e core.timezone.utc_now() (os testes o congelam).
"""
import threading
from collections import deque
from datetime import datetime, timedelta

from app.core import timezone as tz

HOURLY_LIMIT = 10
HOURLY_PAUSE = timedelta(minutes=30)
DAILY_LIMIT = 30
DAILY_PAUSE = timedelta(hours=24)

_MAX_TRACKED_IPS = 50_000


def pause_end_from_timestamps(timestamps_desc: list, now: datetime) -> datetime | None:
    """Fim da pausa dado os instantes (mais recente primeiro) dos bloqueios nas ultimas 24 h; None se nao ha pausa.
    Regra unica, usada tambem pelo limite por usuario."""
    if not timestamps_desc:
        return None
    latest = timestamps_desc[0]
    last_hour = sum(1 for t in timestamps_desc if t > now - timedelta(hours=1))
    ends = []
    if last_hour >= HOURLY_LIMIT:
        ends.append(latest + HOURLY_PAUSE)
    if len(timestamps_desc) >= DAILY_LIMIT:
        ends.append(latest + DAILY_PAUSE)
    end = max(ends) if ends else None
    return end if end is not None and end > now else None


class ContentFilterIpThrottle:
    def __init__(self):
        self._lock = threading.Lock()
        self._events: dict[str, deque] = {}

    def _recent(self, ip: str, now: datetime) -> list:
        dq = self._events.get(ip)
        if not dq:
            return []
        limit = now - timedelta(hours=24)
        while dq and dq[0] <= limit:
            dq.popleft()
        if not dq:
            self._events.pop(ip, None)
            return []
        return sorted(dq, reverse=True)

    def pause_remaining_seconds(self, ip: str) -> int:
        """Segundos de pausa que faltam (0 = livre)."""
        now = tz.utc_now()
        with self._lock:
            end = pause_end_from_timestamps(self._recent(ip, now), now)
        if end is None:
            return 0
        return max(1, int((end - now).total_seconds() + 0.999))

    def record(self, ip: str) -> None:
        now = tz.utc_now()
        with self._lock:
            if ip not in self._events and len(self._events) >= _MAX_TRACKED_IPS:
                return  # protecao de memoria: IP novo deixa de ser rastreado
            self._events.setdefault(ip, deque(maxlen=DAILY_LIMIT + 5)).append(now)

    def clear(self) -> None:
        with self._lock:
            self._events.clear()


ip_throttle = ContentFilterIpThrottle()
