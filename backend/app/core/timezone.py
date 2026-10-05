"""
Helpers de fuso horario -- a UNICA fonte da verdade do "dia do usuario".

CONVENCAO (vale pro projeto inteiro):
- Colunas de INSTANTE (logged_at, started_at, completed_at, performed_at, created_at...)
  sao `timestamp without time zone` e guardam UTC "naive" (sem tzinfo). A sessao do
  banco e forcada pra UTC em core/database.py, entao o valor gravado e sempre o
  instante UTC, em qualquer ambiente.
- "Dia" (meta batida, sequencia, resumo diario, check-in...) e o dia no FUSO LOCAL,
  nao em UTC: uma refeicao as 22h em Brasilia (01h UTC do dia seguinte) pertence ao
  dia local em que a pessoa a registrou.
- Fuso FIXO hoje (Settings.app_timezone, env APP_TIMEZONE, padrao America/Sao_Paulo).
  Por usuario depois: toda funcao aceita `tz` opcional (nome IANA ou ZoneInfo), entao
  trocar pro fuso do usuario e so passar outro valor, sem mudar as funcoes.
- PONTO UNICO DE RELOGIO: utc_now(). Quando `now_utc` nao e passado, local_now/local_today/
  local_week_start usam utc_now() (consultado a cada chamada, pelo nome do modulo), entao os
  testes congelam o tempo patchando so `app.core.timezone.utc_now`. `now_utc` tambem pode ser
  passado por funcao; naive e entendido como UTC, e com tzinfo e convertido.
- Filtros WHERE comparam a COLUNA CRUA com limites UTC (local_day_bounds / local_range_bounds),
  pra manter o uso de indice; a expressao local_date(col) so entra no SELECT / GROUP BY.

Estado atual: os passos 1-2 da migracao estao feitos -- metas, XP, resumos, dashboard, desafios,
ranking, insights e prontidao ja usam o dia LOCAL daqui. INSTANTES PUROS continuam em UTC e nao passam
por estas funcoes (tokens/expiracoes, janelas rolantes de N dias, synced_at, created_at/logged_at
gravados). Challenge.start_date/end_date sao INSTANTES (o app envia toISOString()).
"""
from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache
from zoneinfo import ZoneInfo

from sqlalchemy import Date, cast, func

from app.core.config import settings

UTC = timezone.utc

TzLike = str | ZoneInfo | None


def utc_now() -> datetime:
    """Agora em UTC, como datetime NAIVE (o mesmo formato das colunas de instante). Unico
    ponto de relogio do backend pra logica de "dia": monkeypatche esta funcao nos testes."""
    return datetime.now(UTC).replace(tzinfo=None)


@lru_cache(maxsize=32)
def _zone(name: str) -> ZoneInfo:
    return ZoneInfo(name)


def get_tz(tz: TzLike = None) -> ZoneInfo:
    """ZoneInfo do fuso pedido; None = o fuso configurado (Settings.app_timezone)."""
    if isinstance(tz, ZoneInfo):
        return tz
    return _zone(tz or settings.app_timezone)


def _tz_name(tz: TzLike = None) -> str:
    return get_tz(tz).key


def _as_aware_utc(moment: datetime | None) -> datetime:
    """Naive = UTC; com tzinfo = converte pra UTC; None = agora (utc_now())."""
    if moment is None:
        moment = utc_now()
    if moment.tzinfo is None:
        return moment.replace(tzinfo=UTC)
    return moment.astimezone(UTC)


def local_now(tz: TzLike = None, now_utc: datetime | None = None) -> datetime:
    """Agora, como datetime COM fuso (o fuso local)."""
    return _as_aware_utc(now_utc).astimezone(get_tz(tz))


def local_today(tz: TzLike = None, now_utc: datetime | None = None) -> date:
    """A data de hoje no fuso local (substitui date.today()/utcnow().date())."""
    return local_now(tz, now_utc).date()


def to_local_date(dt_naive_utc: datetime, tz: TzLike = None) -> date:
    """Dia local de um instante guardado no banco (naive UTC; tambem aceita datetime com tzinfo)."""
    return _as_aware_utc(dt_naive_utc).astimezone(get_tz(tz)).date()


def local_day_bounds(day: date, tz: TzLike = None) -> tuple[datetime, datetime]:
    """
    Limites de um dia LOCAL como instantes UTC naive: (inicio, fim_EXCLUSIVO).
    Filtre sempre com `col >= inicio` e `col < fim` (nunca `<= fim`).
    Calculado pela meia-noite local de `day` e de `day + 1`, entao tambem funciona
    em fusos com horario de verao (dia de 23/25 h).
    """
    zone = get_tz(tz)

    def midnight_utc(d: date) -> datetime:
        return datetime.combine(d, time.min, tzinfo=zone).astimezone(UTC).replace(tzinfo=None)

    return midnight_utc(day), midnight_utc(day + timedelta(days=1))


def local_range_bounds(start_day: date, end_day: date, tz: TzLike = None) -> tuple[datetime, datetime]:
    """Limites UTC naive de um intervalo de dias LOCAIS, inclusivo nos dois extremos:
    (inicio de start_day, fim EXCLUSIVO de end_day). Filtre com `col >= inicio` e `col < fim`."""
    return local_day_bounds(start_day, tz)[0], local_day_bounds(end_day, tz)[1]


def local_week_start(tz: TzLike = None, now_utc: datetime | None = None) -> date:
    """Segunda-feira (data local) da semana corrente no fuso local."""
    today = local_today(tz, now_utc)
    return today - timedelta(days=today.weekday())


def local_timestamp(col, tz: TzLike = None):
    """
    Expressao SQL: o horario LOCAL (timestamp sem fuso) de uma coluna de instante em UTC naive:
    timezone(<tz>, timezone('UTC', col)). Base de local_date; use direto quando precisar de
    partes do horario local (ex: extract('month', local_timestamp(col))). NAO depende do
    fuso da sessao do banco.
    """
    return func.timezone(_tz_name(tz), func.timezone("UTC", col))


def local_date(col, tz: TzLike = None):
    """
    Expressao SQL: o dia LOCAL de uma coluna de instante (timestamp sem fuso em UTC).

        timezone(<tz>, timezone('UTC', col))::date

    `timezone('UTC', col)` le o timestamp naive como UTC (-> timestamptz) e
    `timezone(<tz>, ...)` converte pro horario local (-> timestamp naive); o cast da
    a data. Tudo com fuso EXPLICITO: o resultado NAO depende do fuso da sessao do
    banco. Substitui func.date(col) em filtros/agrupamentos por dia.
    """
    return cast(local_timestamp(col, tz), Date)
