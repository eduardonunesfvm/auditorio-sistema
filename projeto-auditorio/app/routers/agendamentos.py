from datetime import date
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import check_can_edit, obter_usuario_atual
from ..models import Usuario
from ..repository import AgendamentoRepository
from ..schemas import (
    AgendamentoCreate,
    AgendamentoResponse,
    AgendamentoUpdate,
    DisponibilidadeResponse,
)
from ..service import AgendamentoService


router = APIRouter(prefix="/agendamentos", tags=["Agendamentos"])


@router.post(
    "/criar_agendamento",
    response_model=AgendamentoResponse,
    status_code=status.HTTP_201_CREATED,
)
def criar_agendamento(
    payload: AgendamentoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(check_can_edit),
):
    service = AgendamentoService(AgendamentoRepository(db))
    return service.criar_novo_agendamento(payload, usuario_id=current_user.id)


@router.get("", response_model=List[AgendamentoResponse])
def listar_agendamentos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(obter_usuario_atual),
):
    service = AgendamentoService(AgendamentoRepository(db))
    return service.listar_agendamentos()


@router.get("/proximo", response_model=Optional[AgendamentoResponse])
def obter_proximo_evento(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(obter_usuario_atual),
):
    service = AgendamentoService(AgendamentoRepository(db))
    return service.obter_proximo_evento()


@router.get("/disponibilidade", response_model=DisponibilidadeResponse)
def obter_disponibilidade(
    data: date,
    agendamento_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(obter_usuario_atual),
):
    service = AgendamentoService(AgendamentoRepository(db))
    return service.obter_disponibilidade(data, current_user, agendamento_id)


@router.put("/{agendamento_id}", response_model=AgendamentoResponse)
def atualizar_agendamento(
    agendamento_id: UUID,
    payload: AgendamentoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(check_can_edit),
):
    service = AgendamentoService(AgendamentoRepository(db))
    return service.atualizar_agendamento(agendamento_id, payload, current_user.id)


@router.delete("/{agendamento_id}", status_code=status.HTTP_204_NO_CONTENT)
def deletar_agendamento(
    agendamento_id: UUID,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(check_can_edit),
):
    service = AgendamentoService(AgendamentoRepository(db))
    service.deletar_agendamento(agendamento_id, current_user.id)
    return None
