"""add auditorium scheduling constraints

Revision ID: a84d12f6c9e1
Revises: e13f61b9ac42
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a84d12f6c9e1"
down_revision: Union[str, Sequence[str], None] = "e13f61b9ac42"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INVALID_SCHEDULES_SQL = sa.text(
    """
    SELECT id::text
    FROM agendamentos
    WHERE NOT (
        hora_fim > hora_inicio
        AND (
            (hora_inicio >= TIME '07:00:00' AND hora_fim <= TIME '11:00:00')
            OR
            (hora_inicio >= TIME '13:00:00' AND hora_fim <= TIME '20:00:00')
        )
    )
    ORDER BY data_evento, hora_inicio, id
    """
)

OVERLAPPING_SCHEDULES_SQL = sa.text(
    """
    SELECT primeiro.id::text AS primeiro_id, segundo.id::text AS segundo_id
    FROM agendamentos AS primeiro
    JOIN agendamentos AS segundo
      ON primeiro.data_evento = segundo.data_evento
     AND primeiro.id::text < segundo.id::text
     AND primeiro.hora_inicio < segundo.hora_fim
     AND primeiro.hora_fim > segundo.hora_inicio
    ORDER BY primeiro.data_evento, primeiro.hora_inicio, primeiro.id
    """
)


def _validate_existing_schedules() -> None:
    connection = op.get_bind()
    if connection.dialect.name != "postgresql":
        raise RuntimeError(
            "A migration de disponibilidade dinâmica requer PostgreSQL."
        )

    connection.execute(
        sa.text("LOCK TABLE agendamentos IN ACCESS EXCLUSIVE MODE")
    )
    invalid_ids = list(connection.execute(INVALID_SCHEDULES_SQL).scalars())
    overlapping_pairs = list(connection.execute(OVERLAPPING_SCHEDULES_SQL).all())

    if not invalid_ids and not overlapping_pairs:
        return

    details = []
    if invalid_ids:
        sample = ", ".join(invalid_ids[:20])
        details.append(
            f"{len(invalid_ids)} agendamento(s) fora do expediente: {sample}"
        )
    if overlapping_pairs:
        sample = ", ".join(
            f"{first}/{second}" for first, second in overlapping_pairs[:20]
        )
        details.append(
            f"{len(overlapping_pairs)} sobreposição(ões) existente(s): {sample}"
        )

    raise RuntimeError(
        "Não foi possível aplicar as regras de disponibilidade. "
        + " | ".join(details)
        + ". Ajuste esses registros manualmente e execute a migration novamente."
    )


def upgrade() -> None:
    _validate_existing_schedules()

    op.create_check_constraint(
        "ck_agendamentos_hora_fim_apos_inicio",
        "agendamentos",
        "hora_fim > hora_inicio",
    )
    op.create_check_constraint(
        "ck_agendamentos_dentro_expediente",
        "agendamentos",
        """
        (hora_inicio >= TIME '07:00:00' AND hora_fim <= TIME '11:00:00')
        OR
        (hora_inicio >= TIME '13:00:00' AND hora_fim <= TIME '20:00:00')
        """,
    )
    op.execute(
        sa.text(
            """
            ALTER TABLE agendamentos
            ADD CONSTRAINT ex_agendamentos_sem_sobreposicao
            EXCLUDE USING gist (
                tsrange(
                    data_evento + hora_inicio,
                    data_evento + hora_fim,
                    '[)'
                ) WITH &&
            )
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "ALTER TABLE agendamentos "
            "DROP CONSTRAINT ex_agendamentos_sem_sobreposicao"
        )
    )
    op.drop_constraint(
        "ck_agendamentos_dentro_expediente",
        "agendamentos",
        type_="check",
    )
    op.drop_constraint(
        "ck_agendamentos_hora_fim_apos_inicio",
        "agendamentos",
        type_="check",
    )
