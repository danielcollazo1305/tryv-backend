"""
Calculo de metricas de corrida a partir da rota bruta enviada pelo app
mobile. O backend nunca confia em distancia/pace/calorias calculados no
cliente — tudo aqui e recalculado a partir de route_points, started_at e
finished_at.
"""
import math
from datetime import datetime
from typing import Protocol, TypedDict

EARTH_RADIUS_METERS = 6_371_000

# Corte de cada split, em metros.
_SPLIT_METERS = 1000.0

# Ganho de elevacao — limiar minimo de variacao pra contar como subida de
# verdade (dead-band simples), pra nao inflar o total com ruido do GPS
# (altitude de celular oscila alguns metros mesmo parado). Nao e um filtro
# sofisticado (tipo suavizacao/media movel), so o suficiente pra evitar que
# jitter puro vire "ganho de elevacao" — validar com dado real de device
# depois se precisar refinar.
_ELEVATION_GAIN_THRESHOLD_M = 1.0


class _LatLng(Protocol):
    lat: float
    lng: float


def haversine_distance_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distancia em linha reta (grande circulo) entre duas coordenadas, em metros."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)

    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_METERS * c


def calculate_distance_meters(route_points: list[_LatLng]) -> float:
    """Soma as distancias haversine entre pontos consecutivos da rota."""
    if len(route_points) < 2:
        return 0.0
    return sum(
        haversine_distance_meters(prev.lat, prev.lng, curr.lat, curr.lng)
        for prev, curr in zip(route_points, route_points[1:])
    )


def calculate_duration_seconds(started_at: datetime, finished_at: datetime) -> int:
    return round((finished_at - started_at).total_seconds())


def calculate_avg_pace_seconds_per_km(distance_meters: float, duration_seconds: int) -> float | None:
    if distance_meters <= 0:
        return None
    return duration_seconds / (distance_meters / 1000)


# elevation_gain_meters/calculate_km_splits abaixo operam sobre route_points
# JA SALVOS (lidos de volta do banco como list[dict] puro, com "timestamp"
# em string ISO — e assim que a coluna JSON de Run.route_points volta da
# query, diferente de calculate_distance_meters acima, chamada so na
# CRIACAO da corrida com os RoutePoint do Pydantic, que tem atributo
# .lat/.lng e "timestamp" ja como datetime). Por isso os 2 usam
# point["lat"]/point.get("alt")/datetime.fromisoformat(point["timestamp"])
# em vez de atributo.


def elevation_gain_meters(route_points: list[dict] | None) -> float:
    """
    Soma so as subidas (delta positivo acima do limiar) entre pontos
    consecutivos com altitude presente. alt ausente (rota gravada antes da
    captura de altitude existir, ou ponto sem leitura de altitude do GPS)
    quebra a sequencia em vez de contar como salto de/pra 0.

    Movida de routers/dashboard.py (onde so era usada no agregado semanal
    da Home) pra ca, pra ser reaproveitada tambem por corrida individual
    (GET /runs/{id}) sem duplicar a logica — mesmo corpo, comportamento
    identico.
    """
    if not route_points:
        return 0.0
    gain = 0.0
    prev_alt = None
    for point in route_points:
        alt = point.get("alt") if isinstance(point, dict) else None
        if alt is None:
            prev_alt = None
            continue
        if prev_alt is not None:
            delta = alt - prev_alt
            if abs(delta) >= _ELEVATION_GAIN_THRESHOLD_M:
                if delta > 0:
                    gain += delta
                prev_alt = alt
            # delta pequeno (ruido): mantem prev_alt como estava
        else:
            prev_alt = alt
    return gain


class KmSplit(TypedDict):
    km: int
    distance_meters: float
    duration_seconds: int
    avg_pace_seconds_per_km: float | None
    # True so no ultimo split quando a corrida nao fecha um km inteiro no
    # final (distance_meters < 1000 nesse caso) — nunca descartado
    # silenciosamente, so marcado pra quem exibe decidir como rotular.
    is_partial: bool


# Sobra minima pra contar como um split parcial de verdade em vez de ruido
# de ponto flutuante bem no limite exato de um km fechado.
_PARTIAL_SPLIT_MIN_METERS = 1.0


def calculate_km_splits(route_points: list[dict] | None) -> list[KmSplit]:
    """
    Splits por km, cortados a cada _SPLIT_METERS acumulados ao longo da
    rota — mesmo calculo haversine ponto-a-ponto de calculate_distance_meters
    (soma das distancias entre pontos consecutivos), so que aqui o corte de
    cada km e interpolado linearmente DENTRO do segmento GPS onde a marca
    cai (a marca de 1km quase nunca coincide com um ponto GPS exato) — sem
    interpolacao, o tempo de cada split ficaria com um erro de ate um
    intervalo de amostragem do GPS.

    Requer pelo menos 2 pontos; corridas mais curtas que 1km ainda geram 1
    split parcial (nunca uma lista vazia so por nao fechar o primeiro km).
    """
    if not route_points or len(route_points) < 2:
        return []

    splits: list[KmSplit] = []
    cumulative_distance = 0.0
    split_start_distance = 0.0
    split_start_time = datetime.fromisoformat(route_points[0]["timestamp"])
    next_split_boundary = _SPLIT_METERS

    for prev, curr in zip(route_points, route_points[1:]):
        seg_start_distance = cumulative_distance
        seg_start_time = datetime.fromisoformat(prev["timestamp"])
        seg_end_time = datetime.fromisoformat(curr["timestamp"])
        seg_distance = haversine_distance_meters(prev["lat"], prev["lng"], curr["lat"], curr["lng"])
        cumulative_distance += seg_distance

        while seg_distance > 0 and cumulative_distance >= next_split_boundary:
            # Fracao do segmento percorrida ate cruzar o proximo km.
            fraction = (next_split_boundary - seg_start_distance) / seg_distance
            crossing_time = seg_start_time + (seg_end_time - seg_start_time) * fraction

            split_distance = next_split_boundary - split_start_distance
            split_duration = round((crossing_time - split_start_time).total_seconds())
            splits.append(
                KmSplit(
                    km=len(splits) + 1,
                    distance_meters=round(split_distance, 1),
                    duration_seconds=split_duration,
                    avg_pace_seconds_per_km=calculate_avg_pace_seconds_per_km(split_distance, split_duration),
                    is_partial=False,
                )
            )
            split_start_distance = next_split_boundary
            split_start_time = crossing_time
            next_split_boundary += _SPLIT_METERS

    remaining_distance = cumulative_distance - split_start_distance
    if remaining_distance > _PARTIAL_SPLIT_MIN_METERS:
        last_point_time = datetime.fromisoformat(route_points[-1]["timestamp"])
        split_duration = round((last_point_time - split_start_time).total_seconds())
        splits.append(
            KmSplit(
                km=len(splits) + 1,
                distance_meters=round(remaining_distance, 1),
                duration_seconds=split_duration,
                avg_pace_seconds_per_km=calculate_avg_pace_seconds_per_km(remaining_distance, split_duration),
                is_partial=True,
            )
        )

    return splits


def _run_met(speed_m_per_min: float) -> float:
    """Equacao de corrida do ACSM para piso plano: VO2 = 0.2*v + 3.5 ml/kg/min, MET = VO2/3.5."""
    return 1 + (0.2 * speed_m_per_min) / 3.5


def _walk_met(speed_m_per_min: float) -> float:
    """Equacao de caminhada do ACSM (coeficiente menor que a de corrida): VO2 = 0.1*v + 3.5."""
    return 1 + (0.1 * speed_m_per_min) / 3.5


def _bike_met(speed_kmh: float) -> float:
    """Faixas de velocidade para ciclismo do Compendium of Physical Activities."""
    if speed_kmh < 16:
        return 4.0
    if speed_kmh < 19:
        return 6.8
    if speed_kmh < 22:
        return 8.0
    if speed_kmh < 25:
        return 10.0
    if speed_kmh < 30:
        return 12.0
    return 15.8


# Funcoes de MET baseadas em velocidade (recebem velocidade em m/min).
_SPEED_BASED_MET_M_PER_MIN = {
    "run": _run_met,
    "walk": _walk_met,
}

# MET fixo para modalidades sem pace relevante — seja porque tipicamente
# nao tem GPS (natacao em piscina, luta), seja porque velocidade nao reflete
# intensidade real (HIIT e feito em intervalos parados/variados). Valores de
# referencia do Compendium of Physical Activities.
_FLAT_MET_BY_ACTIVITY = {
    "swim": 6.0,   # nado livre, esforco moderado
    "fight": 10.3,  # boxe/artes marciais, treino
    "hiit": 8.0,   # circuito de alta intensidade
    "other": 5.0,  # generico, esforco moderado
}


def calculate_met(activity_type: str, distance_meters: float, duration_seconds: int) -> float:
    """
    MET estimado para a atividade. Corrida e caminhada usam as equacoes do
    ACSM baseadas na velocidade (mais rapido = MET mais alto); ciclismo usa
    faixas de velocidade do Compendium; as demais modalidades usam um MET
    fixo representativo (ver _FLAT_MET_BY_ACTIVITY).
    """
    if duration_seconds > 0 and activity_type in _SPEED_BASED_MET_M_PER_MIN:
        speed_m_per_min = (distance_meters / duration_seconds) * 60
        return _SPEED_BASED_MET_M_PER_MIN[activity_type](speed_m_per_min)

    if duration_seconds > 0 and activity_type == "bike":
        speed_kmh = (distance_meters / duration_seconds) * 3.6
        return _bike_met(speed_kmh)

    return _FLAT_MET_BY_ACTIVITY.get(activity_type, _FLAT_MET_BY_ACTIVITY["other"])


def calculate_calories_burned(
    activity_type: str,
    distance_meters: float,
    duration_seconds: int,
    weight_kg: float | None,
) -> float | None:
    """
    Estima calorias via MET (ver calculate_met). Retorna None se nao houver
    peso disponivel para o calculo ou se a duracao for zero.
    """
    if not weight_kg or duration_seconds <= 0:
        return None

    met = calculate_met(activity_type, distance_meters, duration_seconds)
    duration_hours = duration_seconds / 3600
    return met * weight_kg * duration_hours
