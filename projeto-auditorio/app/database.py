import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

if not SQLALCHEMY_DATABASE_URL:
    print("ERRO: variavel de ambiente DATABASE_URL nao definida.")
    print("No Render, configure DATABASE_URL em Environment Variables do Web Service.")
    sys.exit(1)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=300
)

# Criamos a fábrica de sessões (Session Local)
SessionLocal = sessionmaker(
    autocommit=False, 
    autoflush=False, 
    bind=engine
)

# Função geradora que abre a sessão no banco, injeta na rota e garante o fechamento ao final
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()