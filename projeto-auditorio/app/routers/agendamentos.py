from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List, Optional

from ..database import get_db
from ..dependencies import obter_usuario_atual, check_can_edit
from ..models import Usuario
from ..schemas import AgendamentoCreate, AgendamentoResponse
from ..repository import AgendamentoRepository
from ..service import AgendamentoService
from ..schemas import AgendamentoResponse, AgendamentoUpdate

router = APIRouter(prefix="/agendamentos", tags=["Agendamentos"])

@router.post("/criar_agendamento", response_model=AgendamentoResponse, status_code=status.HTTP_201_CREATED)
def criar_agendamento(
    payload: AgendamentoCreate, 
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(check_can_edit)
):
    repo = AgendamentoRepository(db)
    service = AgendamentoService(repo)
    
    return service.criar_novo_agendamento(payload, usuario_id=current_user.id)

@router.get("", response_model=List[AgendamentoResponse])
def listar_agendamentos(
    db: Session = Depends(get_db), 
    current_user: Usuario = Depends(obter_usuario_atual)
):
    service = AgendamentoService(AgendamentoRepository(db))
    return service.listar_agendamentos()

@router.get("/proximo", response_model=Optional[AgendamentoResponse])
def obter_proximo_evento(
    db: Session = Depends(get_db), 
    current_user: Usuario = Depends(obter_usuario_atual)
):
    service = AgendamentoService(AgendamentoRepository(db))
    return service.obter_proximo_evento()

@router.put("/{agendamento_id}", response_model=AgendamentoResponse)
def atualizar_agendamento(
    agendamento_id: UUID,
    payload: AgendamentoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(check_can_edit)
):
    service = AgendamentoService(AgendamentoRepository(db))
    return service.atualizar_agendamento(agendamento_id, payload, current_user.id)

@router.delete("/{agendamento_id}", status_code=status.HTTP_204_NO_CONTENT)
def deletar_agendamento(
    agendamento_id: UUID,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(check_can_edit)
):
    service = AgendamentoService(AgendamentoRepository(db))
    service.deletar_agendamento(agendamento_id, current_user.id)
    return None