from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

engine = create_engine(settings.database_url)


@event.listens_for(engine, "connect")
def _set_session_timezone_utc(dbapi_connection, _connection_record):
    """Toda conexao nova do pool nasce com a sessao em UTC. Instantes sao guardados em
    timestamp SEM fuso (UTC naive); sem isto, um datetime com tzinfo enviado pelo app seria
    convertido pro fuso da sessao do banco (producao: UTC; dev local: Sao Paulo), e
    now() devolveria horarios diferentes por ambiente. SET TIME ZONE via evento (e nao
    options=-c timezone=utc na URL) porque a opcao de startup quebra atras de pooler.
    O commit e necessario: o psycopg2 abre uma transacao no 1o comando, e um SET dentro
    de transacao revertida (rollback no retorno ao pool) seria desfeito."""
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("SET TIME ZONE 'UTC'")
    finally:
        cursor.close()
    dbapi_connection.commit()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency do FastAPI: abre e fecha a sessão do banco por request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
