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
            "hora_inicio": "09:00",
            "hora_fim": "11:00",
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
        assert r2.status_code == 409
        assert r2.json()["detail"] == {
            "code": "schedule_conflict",
            "message": "O horário selecionado não está mais disponível.",
        }

    def test_criar_agendamento_sem_conflito_mesmo_dia(self, client, db_session):
        _criar_usuario(db_session)
        token = _obter_token(client)

        p1 = {
            "nome_evento": "Evento A",
            "data_evento": "2026-12-15",
            "hora_inicio": "07:00",
            "hora_fim": "09:00",
        }

        p2 = {
            "nome_evento": "Evento B",
            "data_evento": "2026-12-15",
            "hora_inicio": "09:00",
            "hora_fim": "11:00",
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
        assert res.json()["detail"]["code"] == "invalid_schedule_window"

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
                "hora_inicio": "09:00",
                "hora_fim": "11:00",
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
                "hora_inicio": "09:00",
                "hora_fim": "11:00",
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
            "hora_inicio": "09:00",
            "hora_fim": "11:00",
        }
        res = client.post(
            "/agendamentos/criar_agendamento",
            json=payload,
            headers=_auth_headers(token),
        )
        assert res.status_code == 403
        assert "visualização" in res.json()["detail"].lower()

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
        assert "visualização" in res.json()["detail"].lower()

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
        assert "visualização" in res.json()["detail"].lower()

    def test_superintendente_pode_criar(self, client, db_session):
        _criar_usuario(db_session, login="sup", role=UserRole.SUPERINTENDENTE)
        token = _obter_token(client, login="sup")

        payload = {
            "nome_evento": "Evento Permitido",
            "data_evento": "2026-12-15",
            "hora_inicio": "09:00",
            "hora_fim": "11:00",
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


class TestPoliticaDeHorarios:
    @pytest.mark.parametrize(
        ("inicio", "fim"),
        [
            ("07:00", "11:00"),
            ("13:00", "20:00"),
            ("18:30", "19:30"),
            ("07:00:30", "08:00:30"),
        ],
    )
    def test_aceita_limites_e_preserva_precisao_existente(
        self,
        client,
        db_session,
        inicio,
        fim,
    ):
        _criar_usuario(db_session)
        token = _obter_token(client)

        res = client.post(
            "/agendamentos/criar_agendamento",
            json={
                "nome_evento": "Evento dentro do expediente",
                "data_evento": "2027-01-10",
                "hora_inicio": inicio,
                "hora_fim": fim,
            },
            headers=_auth_headers(token),
        )

        assert res.status_code == 201, res.text

    @pytest.mark.parametrize(
        ("inicio", "fim"),
        [
            ("06:59", "08:00"),
            ("10:00", "13:00"),
            ("11:00", "13:00"),
            ("13:00", "20:01"),
            ("14:00", "14:00"),
            ("15:00", "14:00"),
        ],
    )
    def test_rejeita_intervalos_fora_da_politica(
        self,
        client,
        db_session,
        inicio,
        fim,
    ):
        _criar_usuario(db_session)
        token = _obter_token(client)

        res = client.post(
            "/agendamentos/criar_agendamento",
            json={
                "nome_evento": "Evento inválido",
                "data_evento": "2027-01-11",
                "hora_inicio": inicio,
                "hora_fim": fim,
            },
            headers=_auth_headers(token),
        )

        assert res.status_code == 400
        assert res.json()["detail"]["code"] == "invalid_schedule_window"


class TestDisponibilidade:
    def test_retorna_contrato_minimo_e_ocupados_ordenados(self, client, db_session):
        _criar_usuario(db_session)
        token = _obter_token(client)
        headers = _auth_headers(token)

        for nome, inicio, fim in [
            ("Evento da tarde", "14:00", "15:00"),
            ("Evento da manhã", "07:00", "08:00"),
        ]:
            res = client.post(
                "/agendamentos/criar_agendamento",
                json={
                    "nome_evento": nome,
                    "data_evento": "2027-02-20",
                    "hora_inicio": inicio,
                    "hora_fim": fim,
                    "observacoes": "Não deve aparecer na disponibilidade",
                },
                headers=headers,
            )
            assert res.status_code == 201, res.text

        res = client.get(
            "/agendamentos/disponibilidade?data=2027-02-20",
            headers=headers,
        )

        assert res.status_code == 200
        assert res.json() == {
            "data": "2027-02-20",
            "timezone": "America/Campo_Grande",
            "jornada": {"inicio": "07:00", "fim": "20:00"},
            "bloqueios": [
                {"inicio": "11:00", "fim": "13:00", "tipo": "almoco"}
            ],
            "ocupados": [
                {"inicio": "07:00", "fim": "08:00"},
                {"inicio": "14:00", "fim": "15:00"},
            ],
        }

    def test_edicao_exclui_proprio_intervalo(self, client, db_session):
        usuario = _criar_usuario(db_session)
        token = _obter_token(client)
        headers = _auth_headers(token)
        criado = client.post(
            "/agendamentos/criar_agendamento",
            json={
                "nome_evento": "Evento editável",
                "data_evento": "2027-02-21",
                "hora_inicio": "09:00",
                "hora_fim": "10:00",
            },
            headers=headers,
        ).json()

        res = client.get(
            "/agendamentos/disponibilidade",
            params={"data": "2027-02-21", "agendamento_id": criado["id"]},
            headers=headers,
        )

        assert res.status_code == 200
        assert res.json()["ocupados"] == []
        assert criado["usuario_id"] == str(usuario.id)

    def test_nao_permite_excluir_agendamento_de_outro_usuario(
        self,
        client,
        db_session,
    ):
        _criar_usuario(db_session, login="dono")
        dono_token = _obter_token(client, login="dono")
        criado = client.post(
            "/agendamentos/criar_agendamento",
            json={
                "nome_evento": "Evento de outro usuário",
                "data_evento": "2027-02-22",
                "hora_inicio": "09:00",
                "hora_fim": "10:00",
            },
            headers=_auth_headers(dono_token),
        ).json()

        _criar_usuario(db_session, login="outro")
        outro_token = _obter_token(client, login="outro")
        res = client.get(
            "/agendamentos/disponibilidade",
            params={"data": "2027-02-22", "agendamento_id": criado["id"]},
            headers=_auth_headers(outro_token),
        )

        assert res.status_code == 403

    def test_visualizador_nao_pode_usar_exclusao_de_edicao(
        self,
        client,
        db_session,
    ):
        usuario = _criar_usuario(db_session)
        token = _obter_token(client)
        criado = client.post(
            "/agendamentos/criar_agendamento",
            json={
                "nome_evento": "Evento antes da troca de perfil",
                "data_evento": "2027-02-23",
                "hora_inicio": "09:00",
                "hora_fim": "10:00",
            },
            headers=_auth_headers(token),
        ).json()
        usuario.role = UserRole.VISUALIZADOR
        db_session.commit()

        res = client.get(
            "/agendamentos/disponibilidade",
            params={"data": "2027-02-23", "agendamento_id": criado["id"]},
            headers=_auth_headers(token),
        )

        assert res.status_code == 403


class TestConflitosNaAtualizacao:
    def test_rejeita_sobreposicao_e_preserva_registro_original(
        self,
        client,
        db_session,
    ):
        _criar_usuario(db_session)
        token = _obter_token(client)
        headers = _auth_headers(token)

        primeiro = client.post(
            "/agendamentos/criar_agendamento",
            json={
                "nome_evento": "Primeiro evento",
                "data_evento": "2027-03-01",
                "hora_inicio": "07:00",
                "hora_fim": "08:00",
            },
            headers=headers,
        )
        segundo = client.post(
            "/agendamentos/criar_agendamento",
            json={
                "nome_evento": "Segundo evento",
                "data_evento": "2027-03-01",
                "hora_inicio": "09:00",
                "hora_fim": "10:00",
            },
            headers=headers,
        )
        assert primeiro.status_code == segundo.status_code == 201

        res = client.put(
            f"/agendamentos/{segundo.json()['id']}",
            json={"hora_inicio": "07:30", "hora_fim": "08:30"},
            headers=headers,
        )

        assert res.status_code == 409
        assert res.json()["detail"]["code"] == "schedule_conflict"
        listagem = client.get("/agendamentos", headers=headers).json()
        persistido = next(item for item in listagem if item["id"] == segundo.json()["id"])
        assert persistido["hora_inicio"] == "09:00:00"
        assert persistido["hora_fim"] == "10:00:00"

    def test_rejeita_edicao_que_atravessa_almoco(self, client, db_session):
        _criar_usuario(db_session)
        token = _obter_token(client)
        headers = _auth_headers(token)
        criado = client.post(
            "/agendamentos/criar_agendamento",
            json={
                "nome_evento": "Evento da manhã",
                "data_evento": "2027-03-02",
                "hora_inicio": "09:00",
                "hora_fim": "10:00",
            },
            headers=headers,
        ).json()

        res = client.put(
            f"/agendamentos/{criado['id']}",
            json={"hora_fim": "13:00"},
            headers=headers,
        )

        assert res.status_code == 400
        assert res.json()["detail"]["code"] == "invalid_schedule_window"


class TestHealth:
    def test_rota_comunicacao_interna_nao_existe(self, client):
        assert "/api/v1/ci" not in client.app.openapi()["paths"]
        assert client.get("/api/v1/ci").status_code == 404

    def test_health_check(self, client):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] == "healthy"
