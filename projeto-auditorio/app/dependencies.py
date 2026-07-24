from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from uuid import UUID

from .security import decodificar_token_acesso
from .database import get_db
from .models import Usuario, UserRole

security = HTTPBearer()


async def obter_usuario_atual(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> Usuario:
    token = credentials.credentials

    try:
        usuario_id, _role, _permissions = decodificar_token_acesso(token)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Falha ao validar credenciais.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario nao encontrado.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return usuario


async def check_can_edit(
    current_user: Usuario = Depends(obter_usuario_atual),
) -> Usuario:
    if current_user.role == UserRole.VISUALIZADOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seu perfil possui apenas permissão para visualização.",
        )
    return current_user


async def check_ci_access(
    current_user: Usuario = Depends(obter_usuario_atual),
) -> Usuario:
    if current_user.role == UserRole.VISUALIZADOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seu perfil possui apenas permissão para visualização.",
        )
    if current_user.role == UserRole.ADMIN:
        return current_user
    if "ci" not in (current_user.permissions or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não tem permissão para acessar o módulo de Comunicação Interna.",
        )
    return current_user
