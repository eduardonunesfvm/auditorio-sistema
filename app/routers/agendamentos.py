from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from uuid import UUID

from ..database import get_db
from ..dependencies import obter_usuario_atual
from ..schemas import AgendamentoCreate, AgendamentoResponse
from ..repository import AgendamentoRepository
from ..service import AgendamentoService

router = APIRouter(prefix="/agendamentos", tags=["Agendamentos"])

@router.post("/criar_agendamento", response_model=AgendamentoResponse, status_code=status.HTTP_201_CREATED)
def criar_agendamento(
    payload: AgendamentoCreate, 
    db: Session = Depends(get_db),
    usuario_id: UUID = Depends(obter_usuario_atual)
):
    # Instancia as camadas passando as dependências para frente
    repo = AgendamentoRepository(db)
    service = AgendamentoService(repo)
    
    return service.criar_novo_agendamento(payload, usuario_id=usuario_id)