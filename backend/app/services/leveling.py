"""
Nivel a partir do XP total (points_events.amount somado) -- curva
quadratica simples, calculada sob demanda, sem tabela de thresholds pra
manter: XP total necessario pra alcancar o nivel N e' 100*(N-1)^2 (nivel 1
= 0, nivel 2 = 100, nivel 3 = 400, nivel 4 = 900...), cada nivel
proporcionalmente mais dificil que o anterior.
"""
import math

LEVEL_XP_CONSTANT = 100


class LevelInfo:
    def __init__(self, level: int, xp_current: int, xp_next_level: int, total_xp: int):
        self.level = level
        self.xp_current = xp_current
        self.xp_next_level = xp_next_level
        self.total_xp = total_xp


def _xp_to_reach_level(level: int) -> int:
    return LEVEL_XP_CONSTANT * (level - 1) ** 2


def compute_level_info(total_xp: int) -> LevelInfo:
    level = int(math.isqrt(total_xp // LEVEL_XP_CONSTANT)) + 1
    xp_current = total_xp - _xp_to_reach_level(level)
    xp_next_level = _xp_to_reach_level(level + 1) - _xp_to_reach_level(level)
    return LevelInfo(level=level, xp_current=xp_current, xp_next_level=xp_next_level, total_xp=total_xp)
