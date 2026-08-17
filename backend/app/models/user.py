import uuid
from datetime import datetime

from sqlalchemy import Column, String, Float, Date, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)

    weight = Column(Float, nullable=True)  # kg
    height = Column(Float, nullable=True)  # cm
    goal = Column(String, nullable=True)  # 'emagrecimento' | 'hipertrofia' | 'resistencia' etc.
    daily_calorie_goal = Column(Float, nullable=True)  # meta de kcal/dia, definida manualmente pelo usuario (ou sugerida no cadastro, ver onboarding expandido)

    # Onboarding expandido (colunas novas) -- todas nullable porque
    # usuarios existentes nao tem esse dado retroativamente, e alguns
    # campos sao opcionais mesmo no fluxo novo (ver body_fat_percentage).
    # Guardamos data de nascimento, nao idade pronta -- idade muda com o
    # tempo, calculada sob demanda (ver utils/healthCalculations.ts no
    # mobile) em vez de um numero fixo que ficaria desatualizado.
    date_of_birth = Column(Date, nullable=True)
    # 'masculino' | 'feminino' | 'prefiro_nao_informar' -- a formula de
    # metabolismo basal (Mifflin-St Jeor) so tem coeficiente pra
    # masculino/feminino; 'prefiro_nao_informar' existe por respeito a
    # privacidade mas faz a meta calorica cair no fallback generico (ver
    # calculateSuggestedCalorieGoal).
    biological_sex = Column(String, nullable=True)
    body_fat_percentage = Column(Float, nullable=True)  # % -- sempre opcional, poucas pessoas sabem de cabeca
    # Mesmos valores de LEVEL_OPTIONS em workout-plan/generate.tsx
    # ('iniciante' | 'intermediario' | 'avancado') -- vocabulario
    # reaproveitado de proposito, nao duplicado.
    training_level = Column(String, nullable=True)
    # Mesmos valores de EQUIPMENT_OPTIONS em workout-plan/generate.tsx
    # (string livre, ex: "Academia completa") -- idem, vocabulario reaproveitado.
    available_equipment = Column(String, nullable=True)

    subscription_status = Column(String, default="inactive")  # 'active' | 'inactive' | 'trial'
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False, nullable=False)
    stripe_customer_id = Column(String, nullable=True)

    # Numero normalizado (so digitos, com DDI) -- nullable porque ninguem
    # preenche isso no cadastro hoje (nao existe campo de telefone em
    # nenhum lugar do onboarding). Usado so pelo match de contatos (POST
    # /users/match-contacts, ver app/routers/users.py) -- so vai comecar a
    # gerar match de verdade quando/se o telefone passar a ser coletado em
    # algum momento (onboarding ou edicao de perfil), decisao separada
    # deste trabalho.
    phone_number = Column(String, nullable=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow)
