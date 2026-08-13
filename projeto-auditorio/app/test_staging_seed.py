from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Agendamento, Base, Usuario
from scripts import seed_staging


@pytest.fixture
def seed_database(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    monkeypatch.setattr(seed_staging, "SessionLocal", session_factory)
    monkeypatch.setenv("ENV", "staging")
    monkeypatch.setenv("RAILWAY_ENVIRONMENT_NAME", "staging")
    monkeypatch.setenv("STAGING_SEED_ADMIN_PASSWORD", "senha-admin-ficticia")
    monkeypatch.setenv("STAGING_SEED_VIEWER_PASSWORD", "senha-viewer-ficticia")
    return session_factory


def test_seed_e_idempotente_e_usa_apenas_dados_ficticios(seed_database):
    selected_date = date(2027, 5, 10)
    seed_staging.seed(selected_date)
    seed_staging.seed(selected_date)

    with seed_database() as db:
        users = db.query(Usuario).order_by(Usuario.login).all()
        appointments = db.query(Agendamento).order_by(Agendamento.hora_inicio).all()
        assert [user.login for user in users] == ["hml_admin", "hml_visualizador"]
        assert len(appointments) == 12
        assert all(item.nome_evento.startswith("[HML]") for item in appointments)
        assert min(item.data_evento for item in appointments) == selected_date
        assert max(item.data_evento for item in appointments) == date(2027, 5, 16)


def test_seed_e_bloqueado_fora_de_staging(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    with pytest.raises(RuntimeError, match="ENV=staging"):
        seed_staging.seed(date(2027, 5, 10))
