import logging
import sys

# Marca o handler que ESTE modulo instalou, pra configurar de novo (reimport,
# reload, mais de um import do app.main) nunca adicionar um segundo handler.
_HANDLER_FLAG = "_tryv_app_log_handler"
_LOG_FORMAT = "%(levelname)s [%(name)s] %(message)s"


def configure_app_logging(level: int = logging.INFO) -> logging.Logger:
    """
    Faz os logs INFO dos modulos do app aparecerem em producao.

    O projeto nao configurava logging: o nivel raiz ficava em WARNING e so o
    uvicorn (loggers "uvicorn.*") escrevia INFO, entao linhas como
    `avatar_generated` (tokens de custo) sumiam. Todos os modulos usam
    getLogger(__name__), ou seja, sao filhos do logger "app" -- e so ele e
    configurado aqui: nivel INFO e um StreamHandler em stdout (o que o Railway
    captura). Bibliotecas de terceiros (httpx, openai, boto3, sqlalchemy...) NAO sao
    tocadas: seguem sob o nivel raiz (WARNING) como antes.

    propagate=False: o logger "app" ja tem o proprio handler, entao a linha nao
    sobe pro root (que nao tem handler em producao, mas teria duplicado se um dia
    tivesse). Idempotente.
    """
    app_logger = logging.getLogger("app")
    app_logger.setLevel(level)
    app_logger.propagate = False
    if not any(getattr(handler, _HANDLER_FLAG, False) for handler in app_logger.handlers):
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter(_LOG_FORMAT))
        setattr(handler, _HANDLER_FLAG, True)
        app_logger.addHandler(handler)
    return app_logger
