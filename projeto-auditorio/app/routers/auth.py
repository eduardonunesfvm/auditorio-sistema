from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session
from ..schemas import LoginRequest, TokenResponse
from ..service import AuthService
from ..repository import UsuarioRepository

from ..database import get_db
from ..login_rate_limit import login_rate_limiter

router = APIRouter(prefix="/auth", tags=["Autenticação"])

@router.post("/login", response_model=TokenResponse)
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    login_rate_limiter.check(request, payload.login)
    repo = UsuarioRepository(db)
    service = AuthService(repo)
    
    return service.autenticar_usuario(login=payload.login, senha_pura=payload.senha)

from app.schemas import LoginRequest, TokenResponse, UsuarioCreate, UsuarioResponse # Atualize os imports

@router.post("/cadastro", response_model=UsuarioResponse, status_code=201)
def cadastrar_usuario(payload: UsuarioCreate, db: Session = Depends(get_db)):
    repo = UsuarioRepository(db)
    service = AuthService(repo)
    
    return service.cadastrar_novo_usuario(payload)


