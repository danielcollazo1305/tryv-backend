"""
Carga de treino em MINUTOS EQUIVALENTES, para o pilar de carga da prontidao (routers/readiness.py).

Corrida (Run) e atividade manual (ManualActivity) ja tem duracao real. A MUSCULACAO (WorkoutSession) nao: workout_sessions.duration_minutes existe
como coluna, mas nenhum fluxo do app a preenche hoje (ver routers/dashboard.py:_session_stats). Entao a sessao e convertida a partir das SERIES:

  minutos equivalentes = series CONCLUIDAS x STRENGTH_MINUTES_PER_SET   (limitado a STRENGTH_SESSION_MAX_MINUTES por sessao)

  - STRENGTH_MINUTES_PER_SET = 2,5: uma serie e ~40-60 s de esforco mais ~90-120 s de descanso entre series, ou seja, ~2,5 min de relogio. E o mesmo
    tempo que a pessoa de fato "gasta" treinando, que e o que o pilar de carga mede (minutos, como na corrida).
  - So conta serie com completed == true (mesmo criterio de dashboard._session_stats e de GET /dashboard/exercise-volume). Serie sem marcar, exercicio
    sem serie e sessao vazia valem 0.
  - Usa SERIES e nao o volume em kg (peso x reps): volume nao e comparavel entre pessoas nem entre exercicios (um agachamento e uma rosca), e a carga
    e uma medida pessoal de "quanto treinei" que precisa de uma unidade comum com a corrida.
  - Se a sessao tiver duration_minutes > 0 (app futuro com cronometro), vale a duracao real, com o mesmo teto por sessao.
  - Teto de 120 min por sessao (48 series): protege o pilar de uma sessao registrada por engano (ex.: centenas de series marcadas de uma vez).

Exemplos: 12 series = 30 min; 20 series = 50 min; 48 ou mais series = 120 min (teto).
"""
from typing import Any

STRENGTH_MINUTES_PER_SET = 2.5
STRENGTH_SESSION_MAX_MINUTES = 120.0


def completed_sets_count(exercises_json: Any) -> int:
    """Series concluidas de uma sessao (campo WorkoutSession.exercises: {"exercises": [{"sets": [{"completed": bool, ...}]}]}).
    Tolerante a JSON incompleto ou fora do formato: nunca levanta, o que nao for reconhecido vale 0."""
    if not isinstance(exercises_json, dict):
        return 0
    exercises = exercises_json.get("exercises")
    if not isinstance(exercises, list):
        return 0
    total = 0
    for exercise in exercises:
        if not isinstance(exercise, dict):
            continue
        sets = exercise.get("sets")
        if not isinstance(sets, list):
            continue
        total += sum(1 for set_log in sets if isinstance(set_log, dict) and set_log.get("completed") is True)
    return total


def strength_session_minutes(exercises_json: Any, duration_minutes: float | None = None) -> float:
    """Minutos equivalentes de UMA sessao de musculacao (ver a regra no topo do modulo). Sempre entre 0 e STRENGTH_SESSION_MAX_MINUTES."""
    if isinstance(duration_minutes, (int, float)) and not isinstance(duration_minutes, bool) and duration_minutes > 0:
        return float(min(duration_minutes, STRENGTH_SESSION_MAX_MINUTES))
    return float(min(completed_sets_count(exercises_json) * STRENGTH_MINUTES_PER_SET, STRENGTH_SESSION_MAX_MINUTES))
