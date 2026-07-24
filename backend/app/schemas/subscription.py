from pydantic import BaseModel


class CheckoutSessionOut(BaseModel):
    checkout_url: str
