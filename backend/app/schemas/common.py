from pydantic import BaseModel


class StatusMessageOut(BaseModel):
    """Resposta estatica de sucesso/cancelamento (paginas de retorno de checkout)."""
    status: str
    message: str


class WebhookAckOut(BaseModel):
    """Ack minimo esperado pelo Stripe apos processar um evento de webhook."""
    received: bool
