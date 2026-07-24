from pydantic import BaseModel, ConfigDict, Field
from datetime import date, time, datetime
from typing import Optional
from uuid import UUID
from app.models import UserRole

# ==========================================
# SCHEMAS DE USUARIO / AUTENTICACAO
# ==========================================

class UsuarioBase(BaseModel):
    nome: str = Field(..., max_length=100)
    login: str = Field(..., max_length=50)

class UsuarioResponse(UsuarioBase):
    id: UUID
    role: UserRole

    model_config = ConfigDict(from_attributes=True)

class LoginRequest(BaseModel):
    login: str
    senha: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole


# ==========================================
# SCHEMAS DE AGENDAMENTO
# ==========================================

class AgendamentoBase(BaseModel):
    nome_evento: str = Field(..., max_length=150, min_length=3)
    data_evento: date
    hora_inicio: time
    hora_fim: time
    quantidade_participantes: Optional[int] = Field(None, ge=1)
    observacoes: Optional[str] = None

class AgendamentoCreate(AgendamentoBase):
    pass

class AgendamentoResponse(AgendamentoBase):
    id: UUID
    usuario_id: UUID
    criador: Optional[UsuarioResponse] = None

    model_config = ConfigDict(from_attributes=True)
    
class UsuarioCreate(BaseModel):
    nome: str
    login: str
    senha: str
    role: Optional[UserRole] = None


class AgendamentoUpdate(BaseModel):
    nome_evento: Optional[str] = None
    data_evento: Optional[date] = None
    hora_inicio: Optional[time] = None
    hora_fim: Optional[time] = None
    quantidade_participantes: Optional[int] = None
    observacoes: Optional[str] = None
    
    class Config:
        from_attributes = True


class ComunicacaoInternaCreate(BaseModel):
    tipo: str = Field(..., max_length=50, min_length=1)
    de: str = Field(..., max_length=255, min_length=1)
    para: str = Field(..., max_length=255, min_length=1)
    titulo: str = Field(..., max_length=255, min_length=1)
    descricao: str = Field(..., min_length=1)
    data: date
    nome_signatario: Optional[str] = Field(None, max_length=255)
    sobrenome_signatario: Optional[str] = Field(None, max_length=255)
    cargo_signatario: Optional[str] = Field(None, max_length=255)


class ComunicacaoInternaResponse(BaseModel):
    id: UUID
    numero_ci: int
    tipo: str
    de: str
    para: str
    titulo: str
    descricao: str
    data: date
    nome_signatario: Optional[str] = None
    sobrenome_signatario: Optional[str] = None
    cargo_signatario: Optional[str] = None
    usuario_id: UUID
    criador_nome: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ComunicacaoInternaUpdate(BaseModel):
    tipo: Optional[str] = None
    de: Optional[str] = None
    para: Optional[str] = None
    titulo: Optional[str] = None
    descricao: Optional[str] = None
    data: Optional[date] = None
    nome_signatario: Optional[str] = None
    sobrenome_signatario: Optional[str] = None
    cargo_signatario: Optional[str] = None