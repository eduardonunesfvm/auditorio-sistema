import uuid
from datetime import date
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import Session
from app.models import Agendamento

class AgendamentoRepository:
    def __init__(self, db: Session):
        self.db = db

    def criar(self, agendamento: Agendamento) -> Agendamento:
        self.db.add(agendamento)
        self.db.commit()
        self.db.refresh(agendamento)
        return agendamento

    def buscar_conflitos(self, data: date, hora_inicio, hora_fim) -> list[Agendamento]:
        """
        Executa a query matemática para descobrir se há sobreposição de horários
        na mesma data informada.
        """
        stmt = select(Agendamento).where(
            and_(
                Agendamento.data_evento == data,
                # Lógica: Inicio_Novo < Fim_Existente E Fim_Novo > Inicio_Existente
                Agendamento.hora_inicio < hora_fim,
                Agendamento.hora_fim > hora_inicio
            )
        )
        return self.db.scalars(stmt).all()