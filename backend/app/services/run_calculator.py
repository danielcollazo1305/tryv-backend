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


def calculate_calories_burned(
    distance_meters: float,
    duration_seconds: int,
    weight_kg: float | None,
) -> float | None:
    """
    Estima calorias via MET, com o MET variando conforme o pace: quanto
    mais rapida a corrida, maior o gasto por minuto. Usa a equacao de
    corrida do ACSM para VO2 em piso plano (VO2 = 0.2 * velocidade em
    m/min + 3.5 ml/kg/min), convertida para MET (MET = VO2 / 3.5).

    Retorna None se nao houver peso disponivel para o calculo ou se a
    duracao for zero.
    """
    if not weight_kg or duration_seconds <= 0:
        return None

    speed_m_per_min = (distance_meters / duration_seconds) * 60
    met = 1 + (0.2 * speed_m_per_min) / 3.5

    duration_hours = duration_seconds / 3600
    return met * weight_kg * duration_hours
