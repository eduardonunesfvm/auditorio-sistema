import uuid
from fastapi import HTTPException, status
from app.repository import AgendamentoRepository
from app.schemas import AgendamentoCreate
from app.models import Agendamento

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