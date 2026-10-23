"""Privacidade do trajeto de uma corrida compartilhada: funcoes PURAS (sem banco, sem FastAPI), testadas em Claude outputs/try_corrida_backend.py.

O trajeto revela onde a pessoa mora ou trabalha. Para desenhar o mapa do post de corrida o servidor entrega SO o trecho do meio: corta os primeiros
e os ultimos ~200 m do percurso (distancia pelo caminho, haversine) e reduz a no maximo ~300 pontos. Percurso total menor que ~600 m = nenhum
ponto (o app mostra o resumo sem mapa). A rota completa nunca sai deste modulo: so o dono a recebe (GET /runs/{id}), e so adulto recebe a cortada."""
import math
from typing import Any, Iterable

EARTH_RADIUS_M = 6_371_000.0
TRIM_METERS = 200.0          # corte em cada ponta
MIN_TOTAL_METERS = 600.0     # abaixo disso nao ha mapa (cortar 200 m de cada lado deixaria quase nada)
MAX_PUBLIC_POINTS = 300
SPIKE_METERS = 1000.0        # um ponto isolado a mais disto dos vizinhos (que estao perto um do outro) e erro de GPS


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def _coords(point: Any) -> tuple[float, float] | None:
    """(lat, lng) de um ponto dict/tupla/lista; None se invalido (nao numerico, NaN, fora do intervalo)."""
    try:
        if isinstance(point, dict):
            lat, lng = point["lat"], point["lng"]
        else:
            lat, lng = point[0], point[1]
        if isinstance(lat, bool) or isinstance(lng, bool):
            return None
        lat, lng = float(lat), float(lng)
    except (KeyError, IndexError, TypeError, ValueError):
        return None
    if not (math.isfinite(lat) and math.isfinite(lng)) or not (-90.0 <= lat <= 90.0) or not (-180.0 <= lng <= 180.0):
        return None
    return lat, lng


def clean_route(points: Iterable[Any]) -> list[tuple[float, float]]:
    """Pontos validos, sem repeticoes seguidas e sem 'espinhos' de GPS (ponto isolado absurdamente longe que volta logo em seguida)."""
    valid: list[tuple[float, float]] = []
    for point in points or []:
        c = _coords(point)
        if c is None:
            continue
        if valid and valid[-1] == c:
            continue
        valid.append(c)
    # espinho: o ponto i esta a mais de SPIKE_METERS dos dois vizinhos, que estao a menos de SPIKE_METERS entre si
    out: list[tuple[float, float]] = []
    for i, c in enumerate(valid):
        if 0 < i < len(valid) - 1:
            prev = out[-1] if out else valid[i - 1]
            nxt = valid[i + 1]
            if haversine_m(*prev, *c) > SPIKE_METERS and haversine_m(*c, *nxt) > SPIKE_METERS and haversine_m(*prev, *nxt) < SPIKE_METERS:
                continue
        out.append(c)
    return out


def path_length_m(route: list[tuple[float, float]]) -> float:
    return sum(haversine_m(*route[i - 1], *route[i]) for i in range(1, len(route)))


def trim_route_ends(
    points: Iterable[Any], trim_m: float = TRIM_METERS, min_total_m: float = MIN_TOTAL_METERS
) -> list[tuple[float, float]]:
    """Pontos SEM os primeiros e ultimos `trim_m` metros do percurso (contados pelo caminho). Percurso menor que `min_total_m`, ponto unico
    ou nada sobrando = lista vazia (sem mapa). Nunca devolve um ponto a menos de `trim_m` m (pelo caminho) de qualquer ponta."""
    route = clean_route(points)
    if len(route) < 2:
        return []
    cumulative = [0.0]
    for i in range(1, len(route)):
        cumulative.append(cumulative[-1] + haversine_m(*route[i - 1], *route[i]))
    total = cumulative[-1]
    if total < min_total_m:
        return []
    kept = [route[i] for i in range(len(route)) if cumulative[i] >= trim_m and (total - cumulative[i]) >= trim_m]
    return kept if len(kept) >= 2 else []


def downsample(route: list[tuple[float, float]], max_points: int = MAX_PUBLIC_POINTS) -> list[tuple[float, float]]:
    """Reducao simples e uniforme (mantem o primeiro e o ultimo) para no maximo `max_points` pontos."""
    n = len(route)
    if n <= max_points or max_points < 2:
        return list(route)
    step = (n - 1) / (max_points - 1)
    indexes = sorted({round(i * step) for i in range(max_points)} | {0, n - 1})
    return [route[i] for i in indexes]


def public_route(points: Iterable[Any]) -> list[dict[str, float]]:
    """O que o dono adulto recebe para desenhar o mapa do post: pontos {lat, lng} cortados nas pontas e reduzidos (sem horario, sem altitude)."""
    trimmed = downsample(trim_route_ends(points))
    return [{"lat": round(lat, 5), "lng": round(lng, 5)} for lat, lng in trimmed]
