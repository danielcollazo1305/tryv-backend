from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Tryv API"

    # Fuso (nome IANA) que define o "dia do usuario" (metas, sequencias, resumos) -- ver
    # core/timezone.py. Fixo por enquanto; env APP_TIMEZONE. Validado no boot.
    app_timezone: str = "America/Sao_Paulo"

    # Banco de dados
    database_url: str = "postgresql://postgres:postgres@localhost:5432/fitness_app"

    # Autenticação
    secret_key: str = "CHANGE_ME_IN_PRODUCTION"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 dias

    # Limite de tentativas de login (janela deslizante em memoria, ver core/login_throttle.py). Envs:
    # LOGIN_MAX_FAILED_ATTEMPTS, LOGIN_WINDOW_MINUTES, LOGIN_MAX_FAILED_ATTEMPTS_PER_IP.
    login_max_failed_attempts: int = 5  # falhas por e-mail na janela; a seguinte recebe 429
    login_window_minutes: int = 15
    login_max_failed_attempts_per_ip: int = 30  # teto por IP na mesma janela

    # Claude API
    anthropic_api_key: str = ""

    # Analise automatica de FOTOS de post (E3e fase 4, services/image_moderation.py). Envs:
    # IMAGE_MODERATION_MODEL (vazio = o modelo leve que o projeto ja usa, ai_client.LIGHT_MODEL; troque aqui sem mexer no codigo);
    # IMAGE_MODERATION_SIMULATED (true = aprova tudo SEM chamar a IA; so para desenvolvimento local, desligado por padrao;
    # sem chave e sem este modo a analise FALHA FECHADA: nada e publicado);
    # POST_MEDIA_REQUIRES_APPROVAL (true = POST /posts so aceita media_url de foto aprovada no upload; false volta ao
    # comportamento antigo -- valvula de emergencia, ver o review do E3e fase 4).
    image_moderation_model: str = ""
    image_moderation_simulated: bool = False
    post_media_requires_approval: bool = True
    # Chave do feed Explorar (GET /feed?scope=explore). DESLIGADA por padrao: desligada, o Explorar responde 404 e nunca devolve posts.
    explore_feed_enabled: bool = False
    # Teto GLOBAL diario de chamadas a IA na analise de fotos (services/image_moderation_usage.py). Envs:
    # IMAGE_MODERATION_DAILY_CAP (texto de proposito: vazio/invalido/negativo = padrao seguro, nunca "sem teto"; 0 = analise
    # desligada, nunca "sem teto") e IMAGE_MODERATION_ALERT_RATIO (fracao do teto que dispara o aviso no log; padrao 0.8).
    image_moderation_daily_cap: str = ""
    image_moderation_alert_ratio: str = ""

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
    # Teto de TENTATIVAS de avatar por usuario por dia (env AVATAR_DAILY_ATTEMPT_LIMIT), com ou sem sucesso: falha que nao consome a cota de
    # geracoes (moderacao, recusa da OpenAI) nao pode virar gasto ilimitado de IA. Janela de 24 h.
    avatar_daily_attempt_limit: int = 10
    # Teto DIARIO, por usuario, de insights gerados por IA em POST /insights/generate (services/ai_usage.py). Env AI_INSIGHT_DAILY_LIMIT.
    # Texto de proposito (como image_moderation_daily_cap): vazio/invalido/negativo = padrao (AI_INSIGHT_DAILY_LIMIT_DEFAULT, generoso);
    # 0 = geracao desligada (nunca "sem teto"). O dia e o dia local (APP_TIMEZONE).
    ai_insight_daily_limit: str = ""

    # Validade (segundos) da URL assinada das imagens PRIVADAS do perfil (foto original e avatar guardados), so para o dono.
    private_image_url_expires_seconds: int = 600

    # Equipamentos (env DEFAULT_SHOE_LIFESPAN_KM / DEFAULT_BIKE_MAINTENANCE_KM): padroes quando o item nao
    # informa vida util (tenis) ou intervalo de revisao (bike) -- ver routers/equipment.py.
    default_shoe_lifespan_km: float = 600.0
    default_bike_maintenance_km: float = 1000.0

    # RevenueCat (assinatura Pro por compra dentro do app, Apple IAP) — ver routers/webhooks.py e services/revenuecat.py.
    # revenuecat_webhook_auth: segredo compartilhado; o mesmo valor vai no campo "Authorization header" do webhook no painel do
    # RevenueCat (aceito como "<valor>" ou "Bearer <valor>"). Vazio = o webhook responde 503 (nunca aceita sem segredo).
    # revenuecat_pro_entitlement: nome do entitlement que significa "Tryv Pro" no RevenueCat.
    # revenuecat_api_secret: chave SECRETA da API REST v1 do RevenueCat (nunca a chave publica do SDK), usada so para pedir a exclusao do
    # assinante quando a conta e excluida (services/revenuecat_api.py). Vazia = essa etapa e pulada.
    revenuecat_webhook_auth: str = ""
    revenuecat_api_secret: str = ""
    revenuecat_pro_entitlement: str = "pro"

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
        # Variaveis desconhecidas (ex.: STRIPE_* de um .env antigo) sao ignoradas em vez de derrubar a partida.
        extra = "ignore"


settings = Settings()
