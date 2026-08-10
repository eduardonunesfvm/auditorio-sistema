"""remove comunicacao interna

Revision ID: e13f61b9ac42
Revises: 995701902ab4

O downgrade recria apenas a estrutura; os dados apagados não são recuperados.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e13f61b9ac42"
down_revision: Union[str, Sequence[str], None] = "995701902ab4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("comunicacoes_internas")
    op.drop_column("usuarios", "permissions")


def downgrade() -> None:
    op.add_column("usuarios", sa.Column("permissions", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
    op.create_table(
        "comunicacoes_internas",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("numero_ci", sa.Integer(), nullable=False),
        sa.Column("tipo", sa.String(length=50), nullable=False),
        sa.Column("de", sa.String(length=255), nullable=False),
        sa.Column("para", sa.String(length=255), nullable=False),
        sa.Column("titulo", sa.String(length=255), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("nome_signatario", sa.String(length=255), nullable=True),
        sa.Column("sobrenome_signatario", sa.String(length=255), nullable=True),
        sa.Column("cargo_signatario", sa.String(length=255), nullable=True),
        sa.Column("usuario_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
