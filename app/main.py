from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.routers import auth, agendamentos

app = FastAPI(
    title="API de Agendamento do Auditório",
    description="Sistema interno corporativo para gerenciamento e reservas do auditório pelos Superintendentes.",
    version="1.0.0"
)

# Configuração de CORS (Essencial para o seu Front-end conseguir conversar com o Back-end)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Em produção na empresa, mude para o IP/URL exato do seu front-end
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# REGISTRO DOS ROUTERS
# ==========================================
app.include_router(auth.router)
app.include_router(agendamentos.router)


# ==========================================
# ENDPOINT DE MONITORAMENTO (HEALTH CHECK)
# ==========================================
@app.get("/health", status_code=status.HTTP_200_OK, tags=["Monitoramento"])
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "database": "connected"
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database connection failed: {str(e)}"
        )