import os
from datetime import datetime, timedelta, timezone
from typing import Optional
from dotenv import load_dotenv
from fastapi import HTTPException, status
import jwt
from passlib.context import CryptContext
from uuid import UUID

# Configuração do algoritmo de criptografia para as senhas
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

load_dotenv()

# Configurações do JWT puxadas do .env (coloque uma chave bem forte lá)
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))

# Validação: SECRET_KEY é obrigatória
if not SECRET_KEY:
    raise ValueError("❌ A variável de ambiente SECRET_KEY não foi definida. Verifique seu arquivo .env")

# ==========================================
# GESTÃO DE SENHAS (HASHING)
# ==========================================

def gerar_senha_hash(senha_pura: str) -> str:
    # Codifica para bytes, pega até 72 bytes e decodifica de volta
    senha_truncada = senha_pura.encode('utf-8')[:72].decode('utf-8', errors='ignore')
    return pwd_context.hash(senha_truncada)

def verificar_senha(senha_pura: str, senha_hash: str) -> bool:
    senha_truncada = senha_pura.encode('utf-8')[:72].decode('utf-8', errors='ignore')
    return pwd_context.verify(senha_truncada, senha_hash)


# ==========================================
# GESTÃO DE TOKENS (JWT)
# ==========================================

from app.models import UserRole

def criar_token_acesso(usuario_id: UUID, role: UserRole, permissions: list[str] | None = None) -> str:
    """Gera o token JWT embutindo o ID, role e permissions do usuario no payload."""
    tempo_expiracao = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    payload = {
        "sub": str(usuario_id),
        "role": role.value if isinstance(role, UserRole) else role,
        "permissions": permissions or [],
        "exp": tempo_expiracao
    }
    
    token_codificado = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return token_codificado

def decodificar_token_acesso(token: str) -> tuple[UUID, str, list[str]]:
    """Decodifica o token, valida a expiracao e extrai o UUID, role e permissions do usuario."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        usuario_id_str: Optional[str] = payload.get("sub")
        role_str: Optional[str] = payload.get("role")
        permissions: list[str] = payload.get("permissions", [])
        
        if usuario_id_str is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token invalido: identificador do usuario ausente.",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        return UUID(usuario_id_str), role_str or "superintendente", permissions
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="O token de acesso expirou. Faca login novamente.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except (jwt.InvalidTokenError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de acesso invalido ou corrompido.",
            headers={"WWW-Authenticate": "Bearer"},
        )