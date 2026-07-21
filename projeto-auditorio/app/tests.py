import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import get_db
from app.models import Base
from app.models import Usuario
from app.security import gerar_senha_hash

SQLITE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLITE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def _criar_usuario(db, nome="Admin", login="admin", senha="123456"):
    usuario = Usuario(
        nome=nome,
        login=login,
        senha_hash=gerar_senha_hash(senha),
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


def _obter_token(client, login="admin", senha="123456"):
    res = client.post("/auth/login", json={"login": login, "senha": senha})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


class TestAuth:
    def test_login_sucesso(self, client, db_session):
        _criar_usuario(db_session)

        res = client.post("/auth/login", json={"login": "admin", "senha": "123456"})

        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_senha_errada(self, client, db_session):
        _criar_usuario(db_session)

        res = client.post("/auth/login", json={"login": "admin", "senha": "senha-errada"})

        assert res.status_code == 401
        assert "incorretos" in res.json()["detail"].lower()

    def test_login_usuario_inexistente(self, client, db_session):
        res = client.post("/auth/login", json={"login": "fantasma", "senha": "123456"})

        assert res.status_code == 401

    def test_login_campos_vazios(self, client):
        res = client.post("/auth/login", json={"login": "", "senha": ""})

        assert res.status_code == 401


class TestAgendamentosCriar:
    def test_criar_agendamento_sucesso(self, client, db_session):
        _criar_usuario(db_session)
        token = _obter_token(client)

        payload = {
            "nome_evento": "Reunião de Diretoria",
            "data_evento": "2026-12-15",
            "hora_inicio": "14:00",
            "hora_fim": "16:00",
            "quantidade_participantes": 20,
            "observacoes": "Sala preparada com projetor.",
        }

        res = client.post(
            "/agendamentos/criar_agendamento",
            json=payload,
            headers=_auth_headers(token),
        )

        assert res.status_code == 201
        data = res.json()
        assert data["nome_evento"] == payload["nome_evento"]
        assert data["data_evento"] == payload["data_evento"]
        assert "id" in data

    def test_criar_agendamento_sem_observacoes(self, client, db_session):
        _criar_usuario(db_session)
        token = _obter_token(client)

        payload = {
            "nome_evento": "Workshop",
            "data_evento": "2026-12-15",
            "hora_inicio": "10:00",
            "hora_fim": "12:00",
        }

        res = client.post(
            "/agendamentos/criar_agendamento",
            json=payload,
            headers=_auth_headers(token),
        )

        assert res.status_code == 201
        data = res.json()
        assert data["observacoes"] is None
        assert data["quantidade_participantes"] is None

    def test_criar_agendamento_conflito_horario(self, client, db_session):
        _criar_usuario(db_session)
        token = _obter_token(client)

        p1 = {
            "nome_evento": "Evento A",
            "data_evento": "2026-12-15",
            "hora_inicio": "14:00",
            "hora_fim": "16:00",
        }

        p2 = {
            "nome_evento": "Evento B",
            "data_evento": "2026-12-15",
            "hora_inicio": "15:00",
            "hora_fim": "17:00",
        }

        r1 = client.post("/agendamentos/criar_agendamento", json=p1, headers=_auth_headers(token))
        assert r1.status_code == 201

        r2 = client.post("/agendamentos/criar_agendamento", json=p2, headers=_auth_headers(token))
        assert r2.status_code == 400
        assert "conflito" in r2.json()["detail"].lower()

    def test_criar_agendamento_sem_conflito_mesmo_dia(self, client, db_session):
        _criar_usuario(db_session)
        token = _obter_token(client)

        p1 = {
            "nome_evento": "Evento A",
            "data_evento": "2026-12-15",
            "hora_inicio": "08:00",
            "hora_fim": "10:00",
        }

        p2 = {
            "nome_evento": "Evento B",
            "data_evento": "2026-12-15",
            "hora_inicio": "10:00",
            "hora_fim": "12:00",
        }

        r1 = client.post("/agendamentos/criar_agendamento", json=p1, headers=_auth_headers(token))
        assert r1.status_code == 201

        r2 = client.post("/agendamentos/criar_agendamento", json=p2, headers=_auth_headers(token))
        assert r2.status_code == 201

    def test_criar_agendamento_hora_inicio_maior_que_fim(self, client, db_session):
        _criar_usuario(db_session)
        token = _obter_token(client)

        payload = {
            "nome_evento": "Evento Invalido",
            "data_evento": "2026-12-15",
            "hora_inicio": "18:00",
            "hora_fim": "14:00",
        }

        res = client.post(
            "/agendamentos/criar_agendamento",
            json=payload,
            headers=_auth_headers(token),
        )

        assert res.status_code == 400
        assert "hora" in res.json()["detail"].lower()

    def test_criar_agendamento_sem_token(self, client):
        payload = {
            "nome_evento": "Evento sem token",
            "data_evento": "2026-12-15",
            "hora_inicio": "10:00",
            "hora_fim": "12:00",
        }

        res = client.post("/agendamentos/criar_agendamento", json=payload)

        assert res.status_code == 401

    def test_criar_agendamento_nome_curto(self, client, db_session):
        _criar_usuario(db_session)
        token = _obter_token(client)

        payload = {
            "nome_evento": "AB",
            "data_evento": "2026-12-15",
            "hora_inicio": "10:00",
            "hora_fim": "12:00",
        }

        res = client.post(
            "/agendamentos/criar_agendamento",
            json=payload,
            headers=_auth_headers(token),
        )

        assert res.status_code == 422

    def test_criar_agendamento_campos_obrigatorios_faltando(self, client, db_session):
        _criar_usuario(db_session)
        token = _obter_token(client)

        res = client.post(
            "/agendamentos/criar_agendamento",
            json={},
            headers=_auth_headers(token),
        )

        assert res.status_code == 422


class TestAgendamentosListar:
    def test_listar_vazio(self, client, db_session):
        _criar_usuario(db_session)
        token = _obter_token(client)

        res = client.get("/agendamentos", headers=_auth_headers(token))

        assert res.status_code == 200
        assert res.json() == []

    def test_listar_com_agendamentos(self, client, db_session):
        _criar_usuario(db_session)
        token = _obter_token(client)

        p1 = {
            "nome_evento": "Evento X",
            "data_evento": "2026-12-10",
            "hora_inicio": "08:00",
            "hora_fim": "10:00",
        }
        p2 = {
            "nome_evento": "Evento Y",
            "data_evento": "2026-12-11",
            "hora_inicio": "14:00",
            "hora_fim": "16:00",
        }

        client.post("/agendamentos/criar_agendamento", json=p1, headers=_auth_headers(token))
        client.post("/agendamentos/criar_agendamento", json=p2, headers=_auth_headers(token))

        res = client.get("/agendamentos", headers=_auth_headers(token))

        assert res.status_code == 200
        data = res.json()
        assert len(data) == 2
        assert data[0]["nome_evento"] == "Evento X"
        assert data[1]["nome_evento"] == "Evento Y"

    def test_listar_sem_token(self, client):
        res = client.get("/agendamentos")

        assert res.status_code == 401


class TestAgendamentosProximo:
    def test_proximo_sem_eventos(self, client, db_session):
        _criar_usuario(db_session)
        token = _obter_token(client)

        res = client.get("/agendamentos/proximo", headers=_auth_headers(token))

        assert res.status_code == 200
        assert res.json() is None

    def test_proximo_com_evento_futuro(self, client, db_session):
        _criar_usuario(db_session)
        token = _obter_token(client)

        client.post(
            "/agendamentos/criar_agendamento",
            json={
                "nome_evento": "Evento Futuro",
                "data_evento": "2099-01-01",
                "hora_inicio": "09:00",
                "hora_fim": "11:00",
            },
            headers=_auth_headers(token),
        )

        res = client.get("/agendamentos/proximo", headers=_auth_headers(token))

        assert res.status_code == 200
        data = res.json()
        assert data is not None
        assert data["nome_evento"] == "Evento Futuro"


class TestAgendamentosAtualizar:
    def test_atualizar_sucesso(self, client, db_session):
        _criar_usuario(db_session)
        token = _obter_token(client)

        create_res = client.post(
            "/agendamentos/criar_agendamento",
            json={
                "nome_evento": "Evento Original",
                "data_evento": "2026-12-15",
                "hora_inicio": "14:00",
                "hora_fim": "16:00",
            },
            headers=_auth_headers(token),
        )
        agendamento_id = create_res.json()["id"]

        update_res = client.put(
            f"/agendamentos/{agendamento_id}",
            json={"nome_evento": "Evento Atualizado"},
            headers=_auth_headers(token),
        )

        assert update_res.status_code == 200
        assert update_res.json()["nome_evento"] == "Evento Atualizado"

    def test_atualizar_inexistente(self, client, db_session):
        _criar_usuario(db_session)
        token = _obter_token(client)

        res = client.put(
            "/agendamentos/00000000-0000-0000-0000-000000000000",
            json={"nome_evento": "Nao existe"},
            headers=_auth_headers(token),
        )

        assert res.status_code == 404

    def test_atualizar_sem_token(self, client, db_session):
        _criar_usuario(db_session)
        token = _obter_token(client)

        create_res = client.post(
            "/agendamentos/criar_agendamento",
            json={
                "nome_evento": "Evento para teste",
                "data_evento": "2026-12-15",
                "hora_inicio": "10:00",
                "hora_fim": "12:00",
            },
            headers=_auth_headers(token),
        )
        agendamento_id = create_res.json()["id"]

        res = client.put(
            f"/agendamentos/{agendamento_id}",
            json={"nome_evento": "Sem token"},
        )

        assert res.status_code == 401


class TestAgendamentosDeletar:
    def test_deletar_sucesso(self, client, db_session):
        _criar_usuario(db_session)
        token = _obter_token(client)

        create_res = client.post(
            "/agendamentos/criar_agendamento",
            json={
                "nome_evento": "Evento a ser removido",
                "data_evento": "2026-12-15",
                "hora_inicio": "08:00",
                "hora_fim": "10:00",
            },
            headers=_auth_headers(token),
        )
        agendamento_id = create_res.json()["id"]

        delete_res = client.delete(
            f"/agendamentos/{agendamento_id}",
            headers=_auth_headers(token),
        )

        assert delete_res.status_code == 204

        list_res = client.get("/agendamentos", headers=_auth_headers(token))
        assert list_res.json() == []

    def test_deletar_inexistente(self, client, db_session):
        _criar_usuario(db_session)
        token = _obter_token(client)

        res = client.delete(
            "/agendamentos/00000000-0000-0000-0000-000000000000",
            headers=_auth_headers(token),
        )

        assert res.status_code == 404

    def test_deletar_sem_token(self, client, db_session):
        _criar_usuario(db_session)
        token = _obter_token(client)

        create_res = client.post(
            "/agendamentos/criar_agendamento",
            json={
                "nome_evento": "Evento para deletar",
                "data_evento": "2026-12-15",
                "hora_inicio": "10:00",
                "hora_fim": "12:00",
            },
            headers=_auth_headers(token),
        )
        agendamento_id = create_res.json()["id"]

        res = client.delete(f"/agendamentos/{agendamento_id}")

        assert res.status_code == 401


class TestHealth:
    def test_health_check(self, client):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] == "healthy"
