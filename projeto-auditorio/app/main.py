from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
import os

from app.database import get_db
from app.routers import auth, agendamentos

app = FastAPI(
    title="API de Agendamento do Auditorio",
    description="Sistema interno corporativo para gerenciamento e reservas do auditorio pelos Superintendentes.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(agendamentos.router)


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


STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "static")


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(full_path: str):
    file_path = os.path.join(STATIC_DIR, full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="Not found")