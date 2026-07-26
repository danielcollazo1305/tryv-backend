"""
Calculo de metricas de corrida a partir da rota bruta enviada pelo app
mobile. O backend nunca confia em distancia/pace/calorias calculados no
cliente — tudo aqui e recalculado a partir de route_points, started_at e
finished_at.
"""
import math
from datetime import datetime
from typing import Protocol

EARTH_RADIUS_METERS = 6_371_000


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
