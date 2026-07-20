import uuid
from datetime import date, time
from typing import List, Optional
from sqlalchemy import String, Date, Time, Text, ForeignKey, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass

class Usuario(Base):
    __tablename__ = "usuarios"

    # Definimos o id como UUID. O default=uuid.uuid4 garante que o Python gere um novo se você não passar.
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    login: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    senha_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    agendamentos: Mapped[List["Agendamento"]] = relationship(
        "Agendamento", 
        back_populates="criador", 
        cascade="all, delete-orphan"
    )

class Agendamento(Base):
    __tablename__ = "agendamentos"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    nome_evento: Mapped[str] = mapped_column(String(150), nullable=False)
    data_evento: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    hora_inicio: Mapped[time] = mapped_column(Time, nullable=False)
    hora_fim: Mapped[time] = mapped_column(Time, nullable=False)
    quantidade_participantes: Mapped[Optional[int]] = mapped_column(Text, nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # A chave estrangeira agora precisa apontar para o tipo UUID também
    usuario_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    
    criador: Mapped["Usuario"] = relationship("Usuario", back_populates="agendamentos")