import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Buscamos a URL do banco das variáveis de ambiente (.env). 
# Caso não encontre, deixamos um fallback padrão para desenvolvimento local.
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://postgres:2212@localhost:5432/auditorio_db"
)

# Criamos a engine de conexão do SQLAlchemy 2.0
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,  # Testa a conexao antes de usar para evitar erros de conexoes derrubadas
    pool_size=10,         # Quantidade maxima de conexoes ativas mantidas no pool
    max_overflow=20,      # Conexoes extras permitidas alem do pool_size se houver pico de acessos
    pool_recycle=300      # Recicla conexoes a cada 5 minutos (necessario para Neon/serverless)
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