"""
Importa todos os modelos para que Base.metadata os conheça (e as foreign
keys entre eles resolvam corretamente) independente de quais routers/
servicos estejam sendo carregados no momento.
"""
from app.models.challenge import Challenge  # noqa: F401
from app.models.meal import Meal  # noqa: F401
from app.models.smartwatch import SmartwatchData  # noqa: F401
from app.models.subscription import Subscription  # noqa: F401
from app.models.trainer import Trainer  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.workout import WorkoutPlan, WorkoutSession  # noqa: F401
