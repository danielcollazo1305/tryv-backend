from datetime import date

from sqlalchemy import Boolean, Column, Date, Integer, text

from app.core.database import Base


class ImageModerationUsage(Base):
    """Contador GLOBAL de chamadas a IA na analise de fotos de post, uma linha por DIA (fuso America/Sao_Paulo, core.timezone.local_today).

    TABELA SEM DADOS DE USUARIO: nao tem user_id nem nenhuma chave para `users`; so dia, contagem e duas marcas de "alerta ja
    registrado no log hoje". Por isso NAO entra em USER_OWNED_TABLES nem na exclusao de conta (o teste de introspecao do E4a so
    cobra tabelas com FK para users). Atualizada por upsert atomico (services/image_moderation_usage.py): segura com varios
    processos/replicas."""

    __tablename__ = "image_moderation_usage"

    day = Column(Date, primary_key=True, default=date.today)
    calls = Column(Integer, nullable=False, default=0, server_default=text("0"))
    alert_logged = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    cap_logged = Column(Boolean, nullable=False, default=False, server_default=text("false"))
