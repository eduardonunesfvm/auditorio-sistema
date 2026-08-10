import uuid
from uuid import UUID

from fastapi import HTTPException, status

from app.models import Agendamento, Usuario, UserRole
from app.repository import AgendamentoRepository, UsuarioRepository
from app.schemas import AgendamentoCreate, AgendamentoUpdate, UsuarioCreate
from app.security import criar_token_acesso, gerar_senha_hash, verificar_senha


class AgendamentoService:
    def __init__(self, repo: AgendamentoRepository):
        self.repo = repo

    def criar_novo_agendamento(self, dados: AgendamentoCreate, usuario_id: uuid.UUID) -> Agendamento:
        if dados.hora_inicio >= dados.hora_fim:
            raise HTTPException(status_code=400, detail="A hora de início deve ser menor que a hora de término.")
        conflitos = self.repo.buscar_conflitos(dados.data_evento, dados.hora_inicio, dados.hora_fim)
        if conflitos:
            raise HTTPException(status_code=400, detail=f"Conflito de horários! O auditório já está reservado para o evento '{conflitos[0].nome_evento}' neste intervalo.")
        return self.repo.criar(Agendamento(nome_evento=dados.nome_evento, data_evento=dados.data_evento, hora_inicio=dados.hora_inicio, hora_fim=dados.hora_fim, quantidade_participantes=dados.quantidade_participantes, observacoes=dados.observacoes, usuario_id=usuario_id))

    def listar_agendamentos(self):
        return self.repo.listar_todos()

    def obter_proximo_evento(self):
        return self.repo.buscar_proximo_evento()

    def atualizar_agendamento(self, agendamento_id: UUID, dados: AgendamentoUpdate, usuario_id: UUID):
        agendamento = self.repo.buscar_por_id(agendamento_id)
        if not agendamento:
            raise HTTPException(status_code=404, detail="Agendamento não encontrado.")
        if agendamento.usuario_id != usuario_id:
            raise HTTPException(status_code=403, detail="Acesso negado para alterar este agendamento. Somente o criador do evento pode editar o evento")
        return self.repo.atualizar(agendamento, dados)

    def deletar_agendamento(self, agendamento_id: UUID, usuario_id: UUID):
        agendamento = self.repo.buscar_por_id(agendamento_id)
        if not agendamento:
            raise HTTPException(status_code=404, detail="Agendamento não encontrado.")
        if agendamento.usuario_id != usuario_id:
            raise HTTPException(status_code=403, detail="Acesso negado para excluir este agendamento.")
        self.repo.deletar(agendamento)


class AuthService:
    def __init__(self, repo: UsuarioRepository):
        self.repo = repo

    def autenticar_usuario(self, login: str, senha_pura: str) -> dict:
        usuario = self.repo.buscar_por_login(login)
        if not usuario or not verificar_senha(senha_pura, usuario.senha_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário ou senha incorretos.", headers={"WWW-Authenticate": "Bearer"})
        return {"access_token": criar_token_acesso(usuario.id, usuario.role), "token_type": "bearer", "role": usuario.role}

    def cadastrar_novo_usuario(self, payload: UsuarioCreate) -> Usuario:
        usuario = Usuario(nome=payload.nome, login=payload.login, senha_hash=gerar_senha_hash(payload.senha), role=payload.role or UserRole.SUPERINTENDENTE)
        return self.repo.criar_usuario(usuario)
