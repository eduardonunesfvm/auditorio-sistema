from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import Usuario, UserRole
from .security import decodificar_token_acesso

security = HTTPBearer()


async def obter_usuario_atual(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)) -> Usuario:
    try:
        usuario_id, _role = decodificar_token_acesso(credentials.credentials)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Falha ao validar credenciais.", headers={"WWW-Authenticate": "Bearer"})
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=401, detail="Usuário não encontrado.", headers={"WWW-Authenticate": "Bearer"})
    return usuario


async def check_can_edit(current_user: Usuario = Depends(obter_usuario_atual)) -> Usuario:
    if current_user.role == UserRole.VISUALIZADOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Seu perfil possui apenas permissão para visualização.")
    return current_user
