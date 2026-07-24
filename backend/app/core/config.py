from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Tryv API"

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

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
