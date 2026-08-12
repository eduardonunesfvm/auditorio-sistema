import uuid
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.exc import DBAPIError

from app.models import Agendamento, Usuario, UserRole
from app.observability import domain_metrics
from app.repository import AgendamentoRepository, UsuarioRepository
from app.schemas import AgendamentoCreate, AgendamentoUpdate, UsuarioCreate
from app.scheduling import (
    AUDITORIUM_TIMEZONE_NAME,
    LUNCH_END,
    LUNCH_START,
    WORKDAY_END,
    WORKDAY_START,
    format_schedule_time,
    is_valid_schedule_window,
)
from app.security import criar_token_acesso, gerar_senha_hash, verificar_senha


class AgendamentoService:
    def __init__(self, repo: AgendamentoRepository):
        self.repo = repo

    def criar_novo_agendamento(
        self,
        dados: AgendamentoCreate,
        usuario_id: uuid.UUID,
    ) -> Agendamento:
        self._validar_janela(dados.hora_inicio, dados.hora_fim)
        conflitos = self.repo.buscar_conflitos(
            dados.data_evento,
            dados.hora_inicio,
            dados.hora_fim,
        )
        if conflitos:
            self._raise_schedule_conflict()

        agendamento = Agendamento(
            nome_evento=dados.nome_evento,
            data_evento=dados.data_evento,
            hora_inicio=dados.hora_inicio,
            hora_fim=dados.hora_fim,
            quantidade_participantes=dados.quantidade_participantes,
            observacoes=dados.observacoes,
            usuario_id=usuario_id,
        )
        try:
            resultado = self.repo.criar(agendamento)
            domain_metrics.reservation_created()
            return resultado
        except DBAPIError as exc:
            self.repo.rollback()
            if self._is_schedule_conflict(exc):
                self._raise_schedule_conflict()
            raise

    def listar_agendamentos(self):
        return self.repo.listar_todos()

    def obter_proximo_evento(self):
        return self.repo.buscar_proximo_evento()

    def obter_disponibilidade(
        self,
        data_evento,
        usuario: Usuario,
        agendamento_id: UUID | None = None,
    ) -> dict:
        if agendamento_id is not None:
            if usuario.role == UserRole.VISUALIZADOR:
                raise HTTPException(
                    status_code=403,
                    detail="Seu perfil possui apenas permissão para visualização.",
                )
            agendamento = self.repo.buscar_por_id(agendamento_id)
            if not agendamento:
                raise HTTPException(status_code=404, detail="Agendamento não encontrado.")
            if agendamento.usuario_id != usuario.id:
                raise HTTPException(
                    status_code=403,
                    detail="Acesso negado para consultar a disponibilidade desta edição.",
                )

        ocupados = self.repo.listar_por_data(data_evento, excluir_id=agendamento_id)
        return {
            "data": data_evento,
            "timezone": AUDITORIUM_TIMEZONE_NAME,
            "jornada": {
                "inicio": format_schedule_time(WORKDAY_START),
                "fim": format_schedule_time(WORKDAY_END),
            },
            "bloqueios": [
                {
                    "inicio": format_schedule_time(LUNCH_START),
                    "fim": format_schedule_time(LUNCH_END),
                    "tipo": "almoco",
                }
            ],
            "ocupados": [
                {
                    "id": item.id,
                    "nome_evento": item.nome_evento,
                    "inicio": format_schedule_time(item.hora_inicio),
                    "fim": format_schedule_time(item.hora_fim),
                }
                for item in ocupados
            ],
        }

    def atualizar_agendamento(
        self,
        agendamento_id: UUID,
        dados: AgendamentoUpdate,
        usuario_id: UUID,
    ):
        agendamento = self.repo.buscar_por_id(agendamento_id)
        if not agendamento:
            raise HTTPException(status_code=404, detail="Agendamento não encontrado.")
        if agendamento.usuario_id != usuario_id:
            raise HTTPException(
                status_code=403,
                detail=(
                    "Acesso negado para alterar este agendamento. "
                    "Somente o criador do evento pode editar o evento."
                ),
            )

        alteracoes = dados.model_dump(exclude_unset=True)
        data_final = alteracoes.get("data_evento", agendamento.data_evento)
        inicio_final = alteracoes.get("hora_inicio", agendamento.hora_inicio)
        fim_final = alteracoes.get("hora_fim", agendamento.hora_fim)
        self._validar_janela(inicio_final, fim_final)

        conflitos = self.repo.buscar_conflitos(
            data_final,
            inicio_final,
            fim_final,
            excluir_id=agendamento.id,
        )
        if conflitos:
            self._raise_schedule_conflict()

        try:
            resultado = self.repo.atualizar(agendamento, dados)
            domain_metrics.reservation_updated()
            return resultado
        except DBAPIError as exc:
            self.repo.rollback()
            if self._is_schedule_conflict(exc):
                self._raise_schedule_conflict()
            raise

    def deletar_agendamento(self, agendamento_id: UUID, usuario_id: UUID):
        agendamento = self.repo.buscar_por_id(agendamento_id)
        if not agendamento:
            raise HTTPException(status_code=404, detail="Agendamento não encontrado.")
        if agendamento.usuario_id != usuario_id:
            raise HTTPException(
                status_code=403,
                detail="Acesso negado para excluir este agendamento.",
            )
        self.repo.deletar(agendamento)
        domain_metrics.reservation_deleted()

    @staticmethod
    def _validar_janela(hora_inicio, hora_fim) -> None:
        if not is_valid_schedule_window(hora_inicio, hora_fim):
            domain_metrics.invalid_schedule_window()
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "invalid_schedule_window",
                    "message": (
                        "Escolha um horário entre 07:00 e 11:00 ou entre "
                        "13:00 e 20:00. O evento não pode atravessar o almoço."
                    ),
                },
            )

    @staticmethod
    def _raise_schedule_conflict() -> None:
        domain_metrics.scheduling_conflict()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "schedule_conflict",
                "message": "O horário selecionado não está mais disponível.",
            },
        )

    @staticmethod
    def _is_schedule_conflict(exc: DBAPIError) -> bool:
        original = getattr(exc, "orig", None)
        sqlstate = getattr(original, "pgcode", None) or getattr(
            original,
            "sqlstate",
            None,
        )
        return sqlstate in {"23P01", "40P01"}


class AuthService:
    def __init__(self, repo: UsuarioRepository):
        self.repo = repo

    def autenticar_usuario(self, login: str, senha_pura: str) -> dict:
        usuario = self.repo.buscar_por_login(login)
        if not usuario or not verificar_senha(senha_pura, usuario.senha_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Usuário ou senha incorretos.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return {
            "access_token": criar_token_acesso(usuario.id, usuario.role),
            "token_type": "bearer",
            "role": usuario.role,
        }

    def cadastrar_novo_usuario(self, payload: UsuarioCreate) -> Usuario:
        usuario = Usuario(
            nome=payload.nome,
            login=payload.login,
            senha_hash=gerar_senha_hash(payload.senha),
            role=payload.role or UserRole.SUPERINTENDENTE,
        )
        return self.repo.criar_usuario(usuario)
