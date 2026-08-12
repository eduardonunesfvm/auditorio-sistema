from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
import os

from app.database import engine, get_db
from app.observability import setup_observability
from app.routers import auth, agendamentos

ENV = os.getenv("ENV", "development")
_docs_enabled = ENV != "production"


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    app.state.observability.shutdown()


app = FastAPI(
    title="Sistema do Auditório",
    description="Sistema interno para gerenciamento do auditório.",
    version="2.0.0",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url=None,
    openapi_url="/openapi.json" if _docs_enabled else None,
    lifespan=lifespan,
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
app.state.observability = setup_observability(app, engine)


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


STATIC_DIR = os.getenv(
    "STATIC_DIR",
    os.path.join(os.path.dirname(__file__), "..", "..", "auditorio-front")
)


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(full_path: str):
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    file_path = os.path.join(STATIC_DIR, full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="Not found")
