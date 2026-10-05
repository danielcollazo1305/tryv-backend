from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Tryv API"

    # Fuso (nome IANA) que define o "dia do usuario" (metas, sequencias, resumos) -- ver
    # core/timezone.py. Fixo por enquanto; env APP_TIMEZONE. Validado no boot.
    app_timezone: str = "America/Sao_Paulo"

    # URL publica desta API — usada para montar success_url/cancel_url do
    # Stripe Checkout (o navegador do usuario e redirecionado para ca).
    app_base_url: str = "http://localhost:8000"

    # Banco de dados
    database_url: str = "postgresql://postgres:postgres@localhost:5432/fitness_app"

    # Autenticação
    secret_key: str = "CHANGE_ME_IN_PRODUCTION"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 dias

    # Claude API
    anthropic_api_key: str = ""

    # OpenAI API — usada so pelas chamadas de baixo risco (insights curtos a
    # partir de dados ja agregados); analise de foto e geracao de treino
    # continuam no Claude. Mesmo padrao de seguranca da chave acima: nunca
    # commitada, sempre via .env.
    openai_api_key: str = ""

    # Modelo da geracao de avatar (env AVATAR_IMAGE_MODEL) -- ver services/avatar_generation.py.
    # Trocavel sem novo codigo. O gpt-image-1-mini nao suporta input_fidelity.
    avatar_image_model: str = "gpt-image-1.5"
    # Limite de geracoes de avatar por usuario numa janela deslizante (env
    # AVATAR_GENERATION_LIMIT e AVATAR_LIMIT_WINDOW_DAYS) -- ver routers/users.py.
    # Cada geracao custa dinheiro real; pra testar, suba o valor no Railway e volte depois.
    avatar_generation_limit: int = 3
    avatar_limit_window_days: int = 30

    # Equipamentos (env DEFAULT_SHOE_LIFESPAN_KM / DEFAULT_BIKE_MAINTENANCE_KM): padroes quando o item nao
    # informa vida util (tenis) ou intervalo de revisao (bike) -- ver routers/equipment.py.
    default_shoe_lifespan_km: float = 600.0
    default_bike_maintenance_km: float = 1000.0

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    # Price ID do plano Tryv Pro (R$49/mes, preco fixo criado uma vez no
    # Stripe) — diferente da assinatura de professor, que monta o preco
    # dinamicamente porque cada profissional define o proprio valor.
    stripe_pro_price_id: str = ""

    # AWS S3 — upload de imagens (refeicoes, posts do feed, perfis)
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_s3_bucket: str = "tryv-media-2026"
    aws_s3_region: str = "sa-east-1"

    # Resend — envio de e-mail (hoje so recuperacao de senha, ver
    # services/email.py). Remetente de teste enquanto o dominio nao e
    # verificado no Resend — so entrega pro proprio e-mail da conta Resend
    # ate la (ver docstring de services/email.py).
    resend_api_key: str = ""
    resend_from_email: str = "Tryv Fit <onboarding@resend.dev>"

    @field_validator("app_timezone")
    @classmethod
    def _validate_app_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError, OSError) as exc:
            raise ValueError(
                f"APP_TIMEZONE invalido: {value!r} nao e um fuso IANA valido (ex: America/Sao_Paulo). "
                "Em Linux sem base de fusos, confirme que o pacote tzdata esta instalado."
            ) from exc
        return value

    class Config:
        env_file = ".env"


settings = Settings()
