from datetime import date
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.models import Agendamento, Usuario
from app.schemas import AgendamentoUpdate
from app.scheduling import auditorium_today


class UsuarioRepository:
    def __init__(self, db: Session):
        self.db = db

    def buscar_por_login(self, login: str) -> Usuario | None:
        """Busca um usuário no banco de dados com base no campo login."""
        return self.db.query(Usuario).filter(Usuario.login == login).first()

    def criar_usuario(self, usuario_db: Usuario) -> Usuario:
        """Salva o novo usuário no banco de dados."""
        self.db.add(usuario_db)
        self.db.commit()
        self.db.refresh(usuario_db)
        return usuario_db


class AgendamentoRepository:
    def __init__(self, db: Session):
        self.db = db

    def criar(self, agendamento: Agendamento) -> Agendamento:
        self.db.add(agendamento)
        self.db.commit()
        self.db.refresh(agendamento)
        return agendamento

    def buscar_conflitos(
        self,
        data: date,
        hora_inicio,
        hora_fim,
        excluir_id: UUID | None = None,
    ) -> list[Agendamento]:
        """Busca intervalos sobrepostos usando limites semiabertos [início, fim)."""
        stmt = select(Agendamento).where(
            and_(
                Agendamento.data_evento == data,
                Agendamento.hora_inicio < hora_fim,
                Agendamento.hora_fim > hora_inicio,
            )
        )
        if excluir_id is not None:
            stmt = stmt.where(Agendamento.id != excluir_id)
        return list(self.db.scalars(stmt).all())

    def listar_por_data(
        self,
        data: date,
        excluir_id: UUID | None = None,
    ) -> list[Agendamento]:
        stmt = select(Agendamento).where(Agendamento.data_evento == data)
        if excluir_id is not None:
            stmt = stmt.where(Agendamento.id != excluir_id)
        stmt = stmt.order_by(Agendamento.hora_inicio.asc(), Agendamento.hora_fim.asc())
        return list(self.db.scalars(stmt).all())

    def listar_todos(self) -> list[Agendamento]:
        """Retorna todos os agendamentos ordenados por data e hora."""
        return self.db.query(Agendamento).order_by(
            Agendamento.data_evento.asc(),
            Agendamento.hora_inicio.asc(),
        ).all()

    def buscar_por_id(self, agendamento_id: UUID) -> Agendamento | None:
        """Busca um agendamento específico pelo UUID."""
        return self.db.query(Agendamento).filter(Agendamento.id == agendamento_id).first()

    def buscar_proximo_evento(self) -> Agendamento | None:
        """Busca o primeiro evento a partir da data atual de Campo Grande."""
        return self.db.query(Agendamento).filter(
            Agendamento.data_evento >= auditorium_today()
        ).order_by(
            Agendamento.data_evento.asc(),
            Agendamento.hora_inicio.asc(),
        ).first()

    def atualizar(self, agendamento: Agendamento, dados: AgendamentoUpdate) -> Agendamento:
        """Atualiza os campos de um agendamento existente."""
        for campo, valor in dados.model_dump(exclude_unset=True).items():
            setattr(agendamento, campo, valor)
        self.db.commit()
        self.db.refresh(agendamento)
        return agendamento

    def deletar(self, agendamento: Agendamento) -> None:
        """Remove o agendamento do banco de dados."""
        self.db.delete(agendamento)
        self.db.commit()

    def rollback(self) -> None:
        self.db.rollback()
