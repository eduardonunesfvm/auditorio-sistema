import uuid
from datetime import date
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import Session, joinedload
from app.models import Agendamento, Usuario, ComunicacaoInterna
from app.schemas import AgendamentoUpdate
from uuid import UUID
import datetime as dt
from datetime import datetime

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
    
    def listar_todos(self) -> list[Agendamento]:
        """Retorna todos os agendamentos ordenados por data e hora."""
        return self.db.query(Agendamento).order_by(
            Agendamento.data_evento.asc(), 
            Agendamento.hora_inicio.asc()
        ).all()

    def buscar_por_id(self, agendamento_id: UUID) -> Agendamento | None:
        """Busca um agendamento específico pelo UUID."""
        return self.db.query(Agendamento).filter(Agendamento.id == agendamento_id).first()

    def buscar_proximo_evento(self) -> Agendamento | None:
        """Busca o primeiro evento que acontecerá a partir de hoje."""
        hoje = datetime.now().date()
        return self.db.query(Agendamento).filter(
            Agendamento.data_evento >= hoje
        ).order_by(
            Agendamento.data_evento.asc(), 
            Agendamento.hora_inicio.asc()
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
    

class ComunicacaoInternaRepository:
    def __init__(self, db: Session):
        self.db = db

    def obter_max_numero_ci(self) -> int | None:
        from sqlalchemy import func
        result = self.db.query(func.max(ComunicacaoInterna.numero_ci)).scalar()
        return result

    def criar(self, ci: ComunicacaoInterna) -> ComunicacaoInterna:
        self.db.add(ci)
        self.db.commit()
        self.db.refresh(ci)
        return ci

    def buscar_por_id(self, ci_id: UUID) -> ComunicacaoInterna | None:
        return self.db.query(ComunicacaoInterna).options(
            joinedload(ComunicacaoInterna.usuario)
        ).filter(ComunicacaoInterna.id == ci_id).first()

    def listar_por_usuario(self, usuario_id: UUID) -> list[ComunicacaoInterna]:
        return self.db.query(ComunicacaoInterna).options(
            joinedload(ComunicacaoInterna.usuario)
        ).filter(
            ComunicacaoInterna.usuario_id == usuario_id
        ).order_by(ComunicacaoInterna.created_at.desc()).all()

    def listar_todas(self) -> list[ComunicacaoInterna]:
        return self.db.query(ComunicacaoInterna).options(
            joinedload(ComunicacaoInterna.usuario)
        ).order_by(ComunicacaoInterna.created_at.desc()).all()

