from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from ..schemas import LoginRequest, TokenResponse
from ..service import AuthService
from ..repository import UsuarioRepository

from ..database import get_db

router = APIRouter(prefix="/auth", tags=["Autenticação"])

@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    repo = UsuarioRepository(db)
    service = AuthService(repo)
    
    return service.autenticar_usuario(login=payload.login, senha_pura=payload.senha)

from app.schemas import LoginRequest, TokenResponse, UsuarioCreate, UsuarioResponse # Atualize os imports

@router.post("/cadastro", response_model=UsuarioResponse, status_code=201)
def cadastrar_usuario(payload: UsuarioCreate, db: Session = Depends(get_db)):
    repo = UsuarioRepository(db)
    service = AuthService(repo)
    
    return service.cadastrar_novo_usuario(payload)


