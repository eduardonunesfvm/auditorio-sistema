import uuid
from fastapi import HTTPException, status
from fastapi.responses import Response
from app.repository import AgendamentoRepository, UsuarioRepository, ComunicacaoInternaRepository
from app.schemas import AgendamentoCreate, UsuarioCreate, AgendamentoUpdate, ComunicacaoInternaCreate
from app.models import Agendamento, Usuario, UserRole, ComunicacaoInterna
from app.security import verificar_senha, criar_token_acesso, gerar_senha_hash
from uuid import UUID
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML
from datetime import date
import os
import base64

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
        token = criar_token_acesso(usuario_id=usuario.id, role=usuario.role, permissions=usuario.permissions or [])
        
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


class ComunicacaoInternaService:
    def __init__(self, repo: ComunicacaoInternaRepository):
        self.repo = repo
        template_dir = os.path.join(os.path.dirname(__file__), "templates")
        self.jinja_env = Environment(loader=FileSystemLoader(template_dir))
        banner_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..", "docs", "secretariabanner.png")
        )
        self.banner_src = self._load_banner_base64(banner_path)

    def _load_banner_base64(self, path: str) -> str:
        try:
            with open(path, "rb") as f:
                data = base64.b64encode(f.read()).decode("utf-8")
            return f"data:image/png;base64,{data}"
        except Exception:
            return ""

    def _render_template(self, numero_ci: int, titulo: str, descricao: str, data_str: str, usuario_nome: str, usuario_role: str) -> str:
        template = self.jinja_env.get_template("ci_template.html")
        return template.render(
            banner_src=self.banner_src,
            numero_ci=numero_ci,
            titulo=titulo,
            descricao=descricao,
            data=data_str,
            usuario_nome=usuario_nome,
            usuario_role=usuario_role,
        )

    def _calcular_proximo_numero(self) -> int:
        max_numero = self.repo.obter_max_numero_ci()
        proximo = (max_numero or 0) + 1
        return ((proximo - 1) % 100) + 1

    def criar_e_gerar_pdf(self, dados: ComunicacaoInternaCreate, usuario: Usuario) -> bytes:
        numero_ci = self._calcular_proximo_numero()

        nova_ci = ComunicacaoInterna(
            numero_ci=numero_ci,
            titulo=dados.titulo,
            descricao=dados.descricao,
            data=dados.data,
            usuario_id=usuario.id,
        )
        self.repo.criar(nova_ci)

        html_renderizado = self._render_template(
            numero_ci=numero_ci,
            titulo=dados.titulo,
            descricao=dados.descricao,
            data_str=dados.data.strftime("%d/%m/%Y"),
            usuario_nome=usuario.nome,
            usuario_role=usuario.role.value if isinstance(usuario.role, UserRole) else usuario.role,
        )

        pdf_bytes = HTML(string=html_renderizado).write_pdf()
        return pdf_bytes

    def gerar_pdf_por_id(self, ci_id: UUID) -> bytes:
        ci = self.repo.buscar_por_id(ci_id)
        if not ci:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comunicacao Interna nao encontrada.")

        html_renderizado = self._render_template(
            numero_ci=ci.numero_ci,
            titulo=ci.titulo,
            descricao=ci.descricao,
            data_str=ci.data.strftime("%d/%m/%Y"),
            usuario_nome=ci.usuario.nome,
            usuario_role=ci.usuario.role.value if isinstance(ci.usuario.role, UserRole) else ci.usuario.role,
        )

        pdf_bytes = HTML(string=html_renderizado).write_pdf()
        return pdf_bytes

    def listar_cis(self, usuario: Usuario) -> list[ComunicacaoInterna]:
        if usuario.role == UserRole.ADMIN:
            return self.repo.listar_todas()
        return self.repo.listar_por_usuario(usuario.id)