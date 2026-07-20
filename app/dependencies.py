from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from uuid import UUID

from .security import decodificar_token_acesso

# Instancia o esquema de segurança HTTPBearer
security = HTTPBearer()


async def obter_usuario_atual(credentials: HTTPAuthorizationCredentials = security) -> UUID:
    """
    Dependência que extrai o token JWT do header Authorization e retorna o UUID do usuário.
    
    Esta função é usada como dependência (Depends) nas rotas que requerem autenticação.
    
    Args:
        credentials: As credenciais capturadas pelo HTTPBearer (token no header Authorization)
        
    Returns:
        UUID: O identificador do usuário autenticado extraído do payload do token
        
    Raises:
        HTTPException: 401 Unauthorized se o token for inválido ou expirado
    """
    token = credentials.credentials
    
    try:
        usuario_id = decodificar_token_acesso(token)
        return usuario_id
    except HTTPException:
        # Re-lança a HTTPException já formatada do decodificar_token_acesso
        raise
    except Exception:
        # Caso haja alguma exceção inesperada, retorna 401
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Falha ao validar credenciais.",
            headers={"WWW-Authenticate": "Bearer"},
        )
