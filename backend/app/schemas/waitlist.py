from pydantic import BaseModel, EmailStr


class WaitlistSignupCreate(BaseModel):
    email: EmailStr
    # Honeypot: campo escondido no formulario real via CSS (nunca visivel
    # pra humano) -- so bot de preenchimento automatico preenche isso.
    # Vazio = humano; preenchido = bot.
    website: str | None = None


class WaitlistSignupOut(BaseModel):
    ok: bool = True
