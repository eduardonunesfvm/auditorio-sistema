import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, time
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi import HTTPException
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import sessionmaker


POSTGRES_TEST_DATABASE_URL = os.getenv("POSTGRES_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not POSTGRES_TEST_DATABASE_URL,
    reason="POSTGRES_TEST_DATABASE_URL não configurada",
)

if POSTGRES_TEST_DATABASE_URL:
    os.environ["DATABASE_URL"] = POSTGRES_TEST_DATABASE_URL
os.environ.setdefault("SECRET_KEY", "postgres-tests-secret-key-with-32-bytes")

from app.models import Agendamento, Usuario, UserRole  # noqa: E402
from app.repository import AgendamentoRepository  # noqa: E402
from app.schemas import AgendamentoCreate  # noqa: E402
from app.service import AgendamentoService  # noqa: E402


PROJECT_DIR = Path(__file__).resolve().parents[1]


def _alembic_config() -> Config:
    config = Config(str(PROJECT_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", POSTGRES_TEST_DATABASE_URL)
    return config


@pytest.fixture(scope="module")
def pg_engine():
    engine = create_engine(POSTGRES_TEST_DATABASE_URL, pool_pre_ping=True)
    command.upgrade(_alembic_config(), "head")
    yield engine
    engine.dispose()


@pytest.fixture(autouse=True)
def clean_database(pg_engine):
    command.upgrade(_alembic_config(), "head")
    with pg_engine.begin() as connection:
        connection.execute(text("DELETE FROM agendamentos"))
        connection.execute(text("DELETE FROM usuarios"))
    yield
    command.upgrade(_alembic_config(), "head")
    with pg_engine.begin() as connection:
        connection.execute(text("DELETE FROM agendamentos"))
        connection.execute(text("DELETE FROM usuarios"))


def test_postgresql_impede_duas_reservas_concorrentes(pg_engine):
    session_factory = sessionmaker(bind=pg_engine, expire_on_commit=False)
    usuario_id = uuid.uuid4()
    with session_factory() as session:
        session.add(
            Usuario(
                id=usuario_id,
                nome="Usuário concorrente",
                login="concorrencia",
                senha_hash="hash-interno-do-teste",
                role=UserRole.SUPERINTENDENTE,
            )
        )
        session.commit()

    barrier = threading.Barrier(2)

    def reservar(nome: str) -> str:
        with session_factory() as session:
            repo = AgendamentoRepository(session)
            buscar_conflitos_original = repo.buscar_conflitos

            def buscar_conflitos_sincronizado(*args, **kwargs):
                conflitos = buscar_conflitos_original(*args, **kwargs)
                barrier.wait(timeout=10)
                return conflitos

            repo.buscar_conflitos = buscar_conflitos_sincronizado
            service = AgendamentoService(repo)
            try:
                service.criar_novo_agendamento(
                    AgendamentoCreate(
                        nome_evento=nome,
                        data_evento=date(2027, 4, 5),
                        hora_inicio=time(14, 0),
                        hora_fim=time(15, 0),
                    ),
                    usuario_id,
                )
                return "created"
            except HTTPException as exc:
                assert exc.status_code == 409
                assert exc.detail["code"] == "schedule_conflict"
                return "conflict"

    with ThreadPoolExecutor(max_workers=2) as executor:
        resultados = list(executor.map(reservar, ["Evento A", "Evento B"]))

    assert sorted(resultados) == ["conflict", "created"]
    with session_factory() as session:
        total = session.scalar(select(func.count()).select_from(Agendamento))
    assert total == 1


def test_migration_falha_sem_alterar_agendamento_incompativel(pg_engine):
    config = _alembic_config()
    invalid_id = uuid.uuid4()
    usuario_id = uuid.uuid4()

    command.downgrade(config, "e13f61b9ac42")
    try:
        with pg_engine.begin() as connection:
            constraint_names = set(
                connection.execute(
                    text(
                        "SELECT conname FROM pg_constraint "
                        "WHERE conrelid = 'agendamentos'::regclass"
                    )
                ).scalars()
            )
            assert "ex_agendamentos_sem_sobreposicao" not in constraint_names
            assert "ck_agendamentos_dentro_expediente" not in constraint_names

            connection.execute(
                text(
                    """
                    INSERT INTO usuarios (id, nome, login, senha_hash, role)
                    VALUES (:id, 'Usuário migration', 'migration', 'hash', 'superintendente')
                    """
                ),
                {"id": usuario_id},
            )
            connection.execute(
                text(
                    """
                    INSERT INTO agendamentos (
                        id, nome_evento, data_evento, hora_inicio, hora_fim, usuario_id
                    ) VALUES (
                        :id, 'Evento durante almoço', DATE '2027-04-06',
                        TIME '10:00:00', TIME '12:00:00', :usuario_id
                    )
                    """
                ),
                {"id": invalid_id, "usuario_id": usuario_id},
            )

        with pytest.raises(RuntimeError, match=str(invalid_id)):
            command.upgrade(config, "head")

        with pg_engine.connect() as connection:
            intervalo = connection.execute(
                text(
                    "SELECT hora_inicio, hora_fim FROM agendamentos WHERE id = :id"
                ),
                {"id": invalid_id},
            ).one()
            assert intervalo == (time(10, 0), time(12, 0))
    finally:
        with pg_engine.begin() as connection:
            connection.execute(
                text("DELETE FROM agendamentos WHERE id = :id"),
                {"id": invalid_id},
            )
            connection.execute(
                text("DELETE FROM usuarios WHERE id = :id"),
                {"id": usuario_id},
            )
        command.upgrade(config, "head")

    with pg_engine.connect() as connection:
        constraint_names = set(
            connection.execute(
                text(
                    "SELECT conname FROM pg_constraint "
                    "WHERE conrelid = 'agendamentos'::regclass"
                )
            ).scalars()
        )
    assert {
        "ck_agendamentos_hora_fim_apos_inicio",
        "ck_agendamentos_dentro_expediente",
        "ex_agendamentos_sem_sobreposicao",
    } <= constraint_names
