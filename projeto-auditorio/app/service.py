import uuid
from fastapi import HTTPException, status
from app.repository import AgendamentoRepository, UsuarioRepository
from app.schemas import AgendamentoCreate, UsuarioCreate, AgendamentoUpdate
from app.models import Agendamento, Usuario, UserRole
from fastapi import HTTPException, status
from app.repository import UsuarioRepository
from app.security import verificar_senha, criar_token_acesso, gerar_senha_hash
from uuid import UUID

class AgendamentoService:
    def __init__(self, repo: AgendamentoRepository):
        self.repo = repo

    def criar_novo_agendamento(self, dados: AgendamentoCreate, usuario_id: uuid.UUID) -> Agendamento:
        # 1. Validação de consistência básica do horário
        if dados.hora_inicio >= dados.hora_fim:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A hora de início deve ser menor que a hora de término."
            )

        # 2. Executa a regra de ouro: verificar choque de horários no banco
        conflitos = self.repo.buscar_conflitos(
            data=dados.data_evento,
            hora_inicio=dados.hora_inicio,
            hora_fim=dados.hora_fim
        )

        if conflitos:
            # Pegamos o nome do primeiro evento conflitante para dar um feedback rico na tela
            evento_conflito = conflitos[0].nome_evento
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Conflito de horários! O auditório já está reservado para o evento '{evento_conflito}' neste intervalo."
            )

        # 3. Se passou pelas validações, transforma o Schema em Modelo e salva
        novo_agendamento = Agendamento(
            nome_evento=dados.nome_evento,
            data_evento=dados.data_evento,
            hora_inicio=dados.hora_inicio,
            hora_fim=dados.hora_fim,
            quantidade_participantes=dados.quantidade_participantes,
            observacoes=dados.observacoes,
            usuario_id=usuario_id
        )

        return self.repo.criar(novo_agendamento)
    
    def listar_agendamentos(self):
        return self.repo.listar_todos()

    def obter_proximo_evento(self):
        return self.repo.buscar_proximo_evento()

    def atualizar_agendamento(self, agendamento_id: UUID, dados: AgendamentoUpdate, usuario_id: UUID):
        agendamento = self.repo.buscar_por_id(agendamento_id)
        if not agendamento:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agendamento não encontrado.")
        
        # Garante que só quem criou (ou admin) pode editar
        if agendamento.usuario_id != usuario_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado para alterar este agendamento. Somente o criador do evento pode editar o evento")
            
        return self.repo.atualizar(agendamento, dados)

    def deletar_agendamento(self, agendamento_id: UUID, usuario_id: UUID):
        agendamento = self.repo.buscar_por_id(agendamento_id)
        if not agendamento:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agendamento não encontrado.")
        
        if agendamento.usuario_id != usuario_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado para excluir este agendamento.")
            
        self.repo.deletar(agendamento)
    

class AuthService:
    def __init__(self, repo: UsuarioRepository):
        self.repo = repo

    def autenticar_usuario(self, login: str, senha_pura: str) -> dict:
        """Valida as credenciais e retorna o token de acesso."""
        # 1. Busca o usuário via repositório
        usuario = self.repo.buscar_por_login(login)
        
        # 2. Se não achar ou a senha não bater, estoura 401 (mensagem genérica por segurança)
        if not usuario or not verificar_senha(senha_pura, usuario.senha_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Usuário ou senha incorretos.",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        # 3. Gera o token com o UUID real do usuário do banco
        token = criar_token_acesso(usuario_id=usuario.id, role=usuario.role)
        
        return {
            "access_token": token,
            "token_type": "bearer",
            "role": usuario.role
        }


    def cadastrar_novo_usuario(self, payload: UsuarioCreate) -> Usuario:
        """Gera o hash da senha e salva o usuário através do repositório."""
        # 1. Transforma a senha digitada em um hash seguro antes de mandar pro banco
        senha_criptografada = gerar_senha_hash(payload.senha)
        
        role = payload.role or UserRole.SUPERINTENDENTE
        
        # 2. Cria a instância do modelo do banco
        novo_usuario = Usuario(
            nome=payload.nome,
            login=payload.login,
            senha_hash=senha_criptografada,
            role=role
        )
        
        # 3. Manda pro repositório salvar
        return self.repo.criar_usuario(novo_usuario)