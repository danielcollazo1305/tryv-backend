"""
Checagem deterministica e simples de plausibilidade de dados de atividade
fisica rastreada por GPS — usada antes de gerar qualquer insight via IA
(activity_insight.py, daily_insight.py), pra nao depender do modelo
"perceber" sozinho uma falha obvia de GPS/sensor (ex: poucos metros
percorridos numa atividade de varios minutos). Nao valida fisiologia de
verdade, so sinaliza os padroes mais comuns de dado quebrado — a IA decide
como comentar isso na resposta.
"""

# So faz sentido aplicar o range de velocidade de corrida/caminhada pra essas
# modalidades — bike facilmente passa de 25 km/h sem ser anomalia nenhuma.
_RUN_LIKE_TYPES = {"run", "walk"}

_MIN_PLAUSIBLE_SPEED_KMH = 1.0
_MAX_PLAUSIBLE_SPEED_KMH = 25.0

# Anomalia de velocidade so e conclusiva se sustentada por alguns minutos —
# evita falso positivo em atividades muito curtas onde o calculo de
# velocidade media e naturalmente ruidoso.
_MIN_SUSTAINED_SECONDS = 180


def check_activity_plausibility(
    activity_type: str | None,
    distance_meters: float | None,
    duration_seconds: float | None,
) -> str | None:
    """
    Retorna uma descricao curta da inconsistencia encontrada, ou None se o
    dado parecer plausivel (ou nao houver GPS/duracao suficiente pra
    avaliar — ex: atividade manual sem distancia, ou atividade curta demais).
    """
    if not duration_seconds or duration_seconds < _MIN_SUSTAINED_SECONDS or distance_meters is None:
        return None

    duration_minutes = round(duration_seconds / 60)

    if distance_meters <= 1:
        return f"distancia praticamente zero apesar de {duration_minutes} min de duracao registrada"

    if activity_type in _RUN_LIKE_TYPES:
        speed_kmh = (distance_meters / 1000) / (duration_seconds / 3600)
        if speed_kmh < _MIN_PLAUSIBLE_SPEED_KMH or speed_kmh > _MAX_PLAUSIBLE_SPEED_KMH:
            return (
                f"velocidade media de {speed_kmh:.1f} km/h sustentada por {duration_minutes} min "
                "fora do range plausivel para corrida/caminhada"
            )

    return None
