"""
Cliente Stripe compartilhado — usado pelo onboarding de professores
(Stripe Connect) e futuramente por assinaturas/pagamentos.
"""
import stripe

from app.core.config import settings

_client: stripe.StripeClient | None = None


def get_client() -> stripe.StripeClient:
    """Lazy init: evita quebrar a importacao do app se a chave da Stripe
    nao estiver configurada ainda (ex: rodando localmente sem .env preenchido)."""
    global _client
    if _client is None:
        _client = stripe.StripeClient(settings.stripe_secret_key)
    return _client
