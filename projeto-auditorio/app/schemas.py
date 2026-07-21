from pydantic import BaseModel, ConfigDict, Field
from datetime import date, time
from typing import Optional
from uuid import UUID

# ==========================================
# SCHEMAS DE USUÁRIO / AUTENTICAÇÃO
# ==========================================

class UsuarioBase(BaseModel):
    nome: str = Field(..., max_length=100)
    login: str = Field(..., max_length=50)

class UsuarioResponse(UsuarioBase):
    id: UUID

    # Permite que o Pydantic leia os dados diretamente do modelo do SQLAlchemy
    model_config = ConfigDict(from_attributes=True)

class LoginRequest(BaseModel):
    login: str
    senha: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str


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
    
class LoginRequest(BaseModel):
    login: str
    senha: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    
class UsuarioCreate(BaseModel):
    nome: str
    login: str
    senha: str

class UsuarioResponse(BaseModel):
    id: UUID
    nome: str
    login: str

    class Config:
        from_attributes = True
        

class AgendamentoUpdate(BaseModel):
    nome_evento: Optional[str] = None
    data_evento: Optional[date] = None
    hora_inicio: Optional[time] = None
    hora_fim: Optional[time] = None
    quantidade_participantes: Optional[int] = None
    observacoes: Optional[str] = None
    
    class Config:
        from_attributes = True