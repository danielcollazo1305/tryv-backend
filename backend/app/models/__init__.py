"""
Importa todos os modelos para que Base.metadata os conheça (e as foreign
keys entre eles resolvam corretamente) independente de quais routers/
servicos estejam sendo carregados no momento.
"""
from app.models.challenge import Challenge, ChallengeCheckin  # noqa: F401
from app.models.daily_insight import DailyInsight  # noqa: F401
from app.models.diet_plan import DietPlan  # noqa: F401
from app.models.heart_rate import HeartRateSample  # noqa: F401
from app.models.live_activity import LiveActivity  # noqa: F401
from app.models.manual_activity import ManualActivity  # noqa: F401
from app.models.meal import Meal  # noqa: F401
from app.models.readiness_score import ReadinessScore  # noqa: F401
from app.models.run import Run  # noqa: F401
from app.models.smartwatch import SmartwatchData  # noqa: F401
from app.models.social import Comment, Follow, Like, Post  # noqa: F401
from app.models.subscription import Subscription  # noqa: F401
from app.models.trainer import Trainer  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.weight_log import WeightLog  # noqa: F401
from app.models.workout import WorkoutPlan, WorkoutSession  # noqa: F401
