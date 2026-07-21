"""Initial migration: create usuarios and agendamentos tables

Revision ID: 2760e435dafc
Revises: 
Create Date: 2026-07-20 13:27:12.086501

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2760e435dafc'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Criar tabela usuarios
    op.create_table(
        'usuarios',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('nome', sa.String(length=100), nullable=False),
        sa.Column('login', sa.String(length=50), nullable=False),
        sa.Column('senha_hash', sa.String(length=255), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('login'),
        sa.Index(sa.text('ix_usuarios_login'), 'login')
    )
    
    # Criar tabela agendamentos
    op.create_table(
        'agendamentos',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('nome_evento', sa.String(length=150), nullable=False),
        sa.Column('data_evento', sa.Date(), nullable=False),
        sa.Column('hora_inicio', sa.Time(), nullable=False),
        sa.Column('hora_fim', sa.Time(), nullable=False),
        sa.Column('quantidade_participantes', sa.Text(), nullable=True),
        sa.Column('observacoes', sa.Text(), nullable=True),
        sa.Column('usuario_id', sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.Index(sa.text('ix_agendamentos_data_evento'), 'data_evento')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('agendamentos')
    op.drop_table('usuarios')
