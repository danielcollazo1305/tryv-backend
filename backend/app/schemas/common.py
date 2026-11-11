from pydantic import BaseModel


class WebhookAckOut(BaseModel):
    """Ack minimo devolvido ao provedor (RevenueCat) apos processar um evento de webhook."""
    received: bool
