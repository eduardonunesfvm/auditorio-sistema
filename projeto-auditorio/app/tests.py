import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import get_db
from app.models import Base, Usuario, UserRole
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


def _criar_usuario(db, nome="Admin", login="admin", senha="123456", role=UserRole.SUPERINTENDENTE):
    usuario = Usuario(
        nome=nome,
        login=login,
        senha_hash=gerar_senha_hash(senha),
        role=role,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario


def _criar_usuario_com_permissions(db, nome="Admin", login="admin", senha="123456", role=UserRole.SUPERINTENDENTE, permissions=None):
    if permissions is None:
        permissions = []
    usuario = Usuario(
        nome=nome,
        login=login,
        senha_hash=gerar_senha_hash(senha),
        role=role,
        permissions=permissions,
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


class TestRoleBasedAccess:
    def test_login_retorna_role(self, client, db_session):
        _criar_usuario(db_session, role=UserRole.ADMIN)
        res = client.post("/auth/login", json={"login": "admin", "senha": "123456"})
        assert res.status_code == 200
        data = res.json()
        assert data["role"] == "admin"

    def test_login_retorna_role_visualizador(self, client, db_session):
        _criar_usuario(db_session, login="visitante", role=UserRole.VISUALIZADOR)
        res = client.post("/auth/login", json={"login": "visitante", "senha": "123456"})
        assert res.status_code == 200
        data = res.json()
        assert data["role"] == "visualizador"

    def test_visualizador_pode_listar(self, client, db_session):
        _criar_usuario(db_session, login="visitante", role=UserRole.VISUALIZADOR)
        token = _obter_token(client, login="visitante")

        res = client.get("/agendamentos", headers=_auth_headers(token))
        assert res.status_code == 200

    def test_visualizador_pode_ver_proximo(self, client, db_session):
        _criar_usuario(db_session, login="visitante", role=UserRole.VISUALIZADOR)
        token = _obter_token(client, login="visitante")

        res = client.get("/agendamentos/proximo", headers=_auth_headers(token))
        assert res.status_code == 200

    def test_visualizador_nao_pode_criar(self, client, db_session):
        _criar_usuario(db_session, login="visitante", role=UserRole.VISUALIZADOR)
        token = _obter_token(client, login="visitante")

        payload = {
            "nome_evento": "Evento Bloqueado",
            "data_evento": "2026-12-15",
            "hora_inicio": "10:00",
            "hora_fim": "12:00",
        }
        res = client.post(
            "/agendamentos/criar_agendamento",
            json=payload,
            headers=_auth_headers(token),
        )
        assert res.status_code == 403
        assert "visualizacao" in res.json()["detail"].lower()

    def test_visualizador_nao_pode_atualizar(self, client, db_session):
        _criar_usuario(db_session, login="admin", role=UserRole.SUPERINTENDENTE)
        admin_token = _obter_token(client, login="admin")

        create_res = client.post(
            "/agendamentos/criar_agendamento",
            json={
                "nome_evento": "Evento Original",
                "data_evento": "2026-12-15",
                "hora_inicio": "14:00",
                "hora_fim": "16:00",
            },
            headers=_auth_headers(admin_token),
        )
        agendamento_id = create_res.json()["id"]

        _criar_usuario(db_session, login="visitante", role=UserRole.VISUALIZADOR)
        visitante_token = _obter_token(client, login="visitante")

        res = client.put(
            f"/agendamentos/{agendamento_id}",
            json={"nome_evento": "Tentativa de Edicao"},
            headers=_auth_headers(visitante_token),
        )
        assert res.status_code == 403
        assert "visualizacao" in res.json()["detail"].lower()

    def test_visualizador_nao_pode_deletar(self, client, db_session):
        _criar_usuario(db_session, login="admin", role=UserRole.SUPERINTENDENTE)
        admin_token = _obter_token(client, login="admin")

        create_res = client.post(
            "/agendamentos/criar_agendamento",
            json={
                "nome_evento": "Evento para deletar",
                "data_evento": "2026-12-15",
                "hora_inicio": "08:00",
                "hora_fim": "10:00",
            },
            headers=_auth_headers(admin_token),
        )
        agendamento_id = create_res.json()["id"]

        _criar_usuario(db_session, login="visitante", role=UserRole.VISUALIZADOR)
        visitante_token = _obter_token(client, login="visitante")

        res = client.delete(
            f"/agendamentos/{agendamento_id}",
            headers=_auth_headers(visitante_token),
        )
        assert res.status_code == 403
        assert "visualizacao" in res.json()["detail"].lower()

    def test_superintendente_pode_criar(self, client, db_session):
        _criar_usuario(db_session, login="sup", role=UserRole.SUPERINTENDENTE)
        token = _obter_token(client, login="sup")

        payload = {
            "nome_evento": "Evento Permitido",
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

    def test_admin_pode_criar(self, client, db_session):
        _criar_usuario(db_session, login="adm", role=UserRole.ADMIN)
        token = _obter_token(client, login="adm")

        payload = {
            "nome_evento": "Evento Admin",
            "data_evento": "2026-12-15",
            "hora_inicio": "08:00",
            "hora_fim": "10:00",
        }
        res = client.post(
            "/agendamentos/criar_agendamento",
            json=payload,
            headers=_auth_headers(token),
        )
        assert res.status_code == 201

    def test_cadastro_com_role(self, client, db_session):
        res = client.post("/auth/cadastro", json={
            "nome": "Visitante Novo",
            "login": "visitante_novo",
            "senha": "123456",
            "role": "visualizador",
        })
        assert res.status_code == 201
        data = res.json()
        assert data["role"] == "visualizador"

    def test_cadastro_sem_role_usa_default(self, client, db_session):
        res = client.post("/auth/cadastro", json={
            "nome": "Usuario Default",
            "login": "default_user",
            "senha": "123456",
        })
        assert res.status_code == 201
        data = res.json()
        assert data["role"] == "superintendente"


class TestComunicacaoInterna:

    # ── POST /api/v1/ci ──────────────────────────────────────────

    def test_criar_ci_admin_sucesso(self, client, db_session):
        _criar_usuario(db_session, role=UserRole.ADMIN)
        token = _obter_token(client)

        res = client.post(
            "/api/v1/ci",
            json={"titulo": "CI Teste", "data": "2026-12-15", "descricao": "Descricao de teste"},
            headers=_auth_headers(token),
        )

        assert res.status_code == 200
        assert res.headers["content-type"] == "application/pdf"

    def test_criar_ci_superintendente_com_permissao(self, client, db_session):
        _criar_usuario_com_permissions(db_session, login="sup_ci", permissions=["ci"])
        token = _obter_token(client, login="sup_ci")

        res = client.post(
            "/api/v1/ci",
            json={"titulo": "CI Teste", "data": "2026-12-15", "descricao": "Descricao de teste"},
            headers=_auth_headers(token),
        )

        assert res.status_code == 200
        assert res.headers["content-type"] == "application/pdf"

    def test_criar_ci_superintendente_sem_permissao(self, client, db_session):
        _criar_usuario(db_session, login="sup_sem")
        token = _obter_token(client, login="sup_sem")

        res = client.post(
            "/api/v1/ci",
            json={"titulo": "CI Teste", "data": "2026-12-15", "descricao": "Descricao de teste"},
            headers=_auth_headers(token),
        )

        assert res.status_code == 403

    def test_criar_ci_visualizador_mesmo_com_permissao(self, client, db_session):
        _criar_usuario_com_permissions(db_session, login="vis_ci", role=UserRole.VISUALIZADOR, permissions=["ci"])
        token = _obter_token(client, login="vis_ci")

        res = client.post(
            "/api/v1/ci",
            json={"titulo": "CI Teste", "data": "2026-12-15", "descricao": "Descricao de teste"},
            headers=_auth_headers(token),
        )

        assert res.status_code == 403

    def test_criar_ci_sem_token(self, client, db_session):
        _criar_usuario(db_session)

        res = client.post(
            "/api/v1/ci",
            json={"titulo": "CI Teste", "data": "2026-12-15", "descricao": "Descricao de teste"},
        )

        assert res.status_code == 401

    def test_criar_ci_campos_faltando(self, client, db_session):
        _criar_usuario(db_session, role=UserRole.ADMIN)
        token = _obter_token(client)

        res = client.post(
            "/api/v1/ci",
            json={"titulo": "Sem data nem descricao"},
            headers=_auth_headers(token),
        )

        assert res.status_code == 422

    def test_criar_ci_numero_sequencial(self, client, db_session):
        _criar_usuario(db_session, role=UserRole.ADMIN)
        token = _obter_token(client)

        r1 = client.post(
            "/api/v1/ci",
            json={"titulo": "CI 1", "data": "2026-12-15", "descricao": "Primeira CI"},
            headers=_auth_headers(token),
        )
        assert r1.status_code == 200

        list_res = client.get("/api/v1/ci", headers=_auth_headers(token))
        cis = list_res.json()
        numeros = sorted([ci["numero_ci"] for ci in cis])
        assert numeros[0] == 1

        r2 = client.post(
            "/api/v1/ci",
            json={"titulo": "CI 2", "data": "2026-12-16", "descricao": "Segunda CI"},
            headers=_auth_headers(token),
        )
        assert r2.status_code == 200

        list_res2 = client.get("/api/v1/ci", headers=_auth_headers(token))
        cis2 = list_res2.json()
        numeros2 = sorted([ci["numero_ci"] for ci in cis2])
        assert numeros2 == [1, 2]

    # ── GET /api/v1/ci ───────────────────────────────────────────

    def test_listar_vazio(self, client, db_session):
        _criar_usuario(db_session, role=UserRole.ADMIN)
        token = _obter_token(client)

        res = client.get("/api/v1/ci", headers=_auth_headers(token))

        assert res.status_code == 200
        assert res.json() == []

    def test_listar_com_cis(self, client, db_session):
        _criar_usuario(db_session, role=UserRole.ADMIN)
        token = _obter_token(client)

        client.post(
            "/api/v1/ci",
            json={"titulo": "CI Lista", "data": "2026-12-15", "descricao": "Descricao da CI"},
            headers=_auth_headers(token),
        )

        res = client.get("/api/v1/ci", headers=_auth_headers(token))

        assert res.status_code == 200
        data = res.json()
        assert len(data) == 1
        assert data[0]["titulo"] == "CI Lista"
        assert "criador_nome" in data[0]
        assert data[0]["criador_nome"] != ""

    def test_listar_admin_ve_todas(self, client, db_session):
        _criar_usuario_com_permissions(db_session, login="user_a", permissions=["ci"])
        token_a = _obter_token(client, login="user_a")
        client.post(
            "/api/v1/ci",
            json={"titulo": "CI do User A", "data": "2026-12-15", "descricao": "Desc A"},
            headers=_auth_headers(token_a),
        )

        _criar_usuario(db_session, login="admin_user", role=UserRole.ADMIN)
        token_admin = _obter_token(client, login="admin_user")

        res = client.get("/api/v1/ci", headers=_auth_headers(token_admin))

        assert res.status_code == 200
        data = res.json()
        assert len(data) == 1

    def test_listar_superintendente_ve_apenas_proprias(self, client, db_session):
        _criar_usuario_com_permissions(db_session, login="user_a", permissions=["ci"])
        token_a = _obter_token(client, login="user_a")
        client.post(
            "/api/v1/ci",
            json={"titulo": "CI do User A", "data": "2026-12-15", "descricao": "Desc A"},
            headers=_auth_headers(token_a),
        )

        _criar_usuario_com_permissions(db_session, login="user_b", nome="User B", permissions=["ci"])
        token_b = _obter_token(client, login="user_b")

        res = client.get("/api/v1/ci", headers=_auth_headers(token_b))

        assert res.status_code == 200
        data = res.json()
        assert len(data) == 0

    def test_visualizador_pode_listar(self, client, db_session):
        _criar_usuario_com_permissions(db_session, login="user_a", permissions=["ci"])
        token_a = _obter_token(client, login="user_a")
        client.post(
            "/api/v1/ci",
            json={"titulo": "CI 1", "data": "2026-12-15", "descricao": "Desc 1"},
            headers=_auth_headers(token_a),
        )

        _criar_usuario(db_session, login="vis", role=UserRole.VISUALIZADOR)
        token_vis = _obter_token(client, login="vis")

        res = client.get("/api/v1/ci", headers=_auth_headers(token_vis))

        assert res.status_code == 200

    def test_listar_sem_token(self, client, db_session):
        _criar_usuario(db_session)

        res = client.get("/api/v1/ci")

        assert res.status_code == 401

    # ── GET /api/v1/ci/{id}/pdf ───────────────────────────────────

    def test_baixar_pdf_sucesso(self, client, db_session):
        _criar_usuario(db_session, role=UserRole.ADMIN)
        token = _obter_token(client)

        client.post(
            "/api/v1/ci",
            json={"titulo": "CI PDF", "data": "2026-12-15", "descricao": "Descricao do PDF"},
            headers=_auth_headers(token),
        )

        list_res = client.get("/api/v1/ci", headers=_auth_headers(token))
        ci_id = list_res.json()[0]["id"]

        res = client.get(f"/api/v1/ci/{ci_id}/pdf", headers=_auth_headers(token))

        assert res.status_code == 200
        assert res.headers["content-type"] == "application/pdf"

    def test_baixar_pdf_inexistente(self, client, db_session):
        _criar_usuario(db_session, role=UserRole.ADMIN)
        token = _obter_token(client)

        res = client.get(
            "/api/v1/ci/00000000-0000-0000-0000-000000000000/pdf",
            headers=_auth_headers(token),
        )

        assert res.status_code == 404

    def test_baixar_pdf_sem_token(self, client, db_session):
        _criar_usuario(db_session, role=UserRole.ADMIN)
        token = _obter_token(client)

        client.post(
            "/api/v1/ci",
            json={"titulo": "CI PDF", "data": "2026-12-15", "descricao": "Descricao do PDF"},
            headers=_auth_headers(token),
        )

        list_res = client.get("/api/v1/ci", headers=_auth_headers(token))
        ci_id = list_res.json()[0]["id"]

        res = client.get(f"/api/v1/ci/{ci_id}/pdf")

        assert res.status_code == 401


class TestHealth:
    def test_health_check(self, client):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] == "healthy"
