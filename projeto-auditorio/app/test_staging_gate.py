import importlib

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from passlib.context import CryptContext

from app.staging_gate import (
    COOKIE_MAX_AGE,
    COOKIE_NAME,
    StagingGateSettings,
    create_access_token,
    install_staging_gate,
    validate_access_token,
)


PASSWORD = "senha-ficticia-homologacao"
SIGNING_SECRET = "segredo-de-cookie-homologacao-com-mais-de-32-bytes"
PASSWORD_HASH = CryptContext(schemes=["bcrypt"]).hash(PASSWORD)


def configured_app(monkeypatch, environment="staging", enabled="true"):
    monkeypatch.setenv("ENV", environment)
    monkeypatch.setenv("STAGING_GATE_ENABLED", enabled)
    monkeypatch.setenv("STAGING_GATE_PASSWORD_HASH", PASSWORD_HASH)
    monkeypatch.setenv("STAGING_GATE_SECRET", SIGNING_SECRET)
    app = FastAPI()

    @app.get("/health")
    def health():
        return {"status": "healthy"}

    @app.get("/")
    def home():
        return {"page": "home"}

    @app.get("/agendamentos")
    def appointments():
        return []

    install_staging_gate(app)
    return app


def test_portao_desabilitado_por_padrao(monkeypatch):
    monkeypatch.delenv("STAGING_GATE_ENABLED", raising=False)
    monkeypatch.setenv("ENV", "development")
    app = FastAPI()

    @app.get("/")
    def home():
        return {"ok": True}

    settings = install_staging_gate(app)
    assert settings.enabled is False
    assert TestClient(app).get("/").status_code == 200


def test_producao_nao_ativa_portao_de_staging(monkeypatch):
    app = configured_app(monkeypatch, environment="production")
    assert TestClient(app).get("/").status_code == 200


@pytest.mark.parametrize("missing", ["STAGING_GATE_PASSWORD_HASH", "STAGING_GATE_SECRET"])
def test_configuracao_incompleta_impede_inicializacao(monkeypatch, missing):
    monkeypatch.setenv("ENV", "staging")
    monkeypatch.setenv("STAGING_GATE_ENABLED", "true")
    monkeypatch.setenv("STAGING_GATE_PASSWORD_HASH", PASSWORD_HASH)
    monkeypatch.setenv("STAGING_GATE_SECRET", SIGNING_SECRET)
    monkeypatch.delenv(missing)
    with pytest.raises(RuntimeError):
        install_staging_gate(FastAPI())


def test_health_publico_e_demais_rotas_protegidas(monkeypatch):
    client = TestClient(configured_app(monkeypatch))
    assert client.get("/health").status_code == 200
    browser = client.get("/", headers={"Accept": "text/html"}, follow_redirects=False)
    assert browser.status_code == 303
    assert browser.headers["location"].startswith("/staging-access")
    api = client.get("/agendamentos")
    assert api.status_code == 401
    assert api.json()["detail"]["code"] == "staging_access_required"


def test_senha_valida_emite_cookie_seguro_e_libera_api(monkeypatch):
    client = TestClient(configured_app(monkeypatch), base_url="https://staging.test")
    response = client.post(
        "/staging-access",
        data={"password": PASSWORD, "next": "/"},
        follow_redirects=False,
    )
    assert response.status_code == 303
    assert response.headers["location"] == "/"
    cookie = response.headers["set-cookie"]
    assert COOKIE_NAME in cookie
    assert "HttpOnly" in cookie
    assert "Secure" in cookie
    assert "SameSite=lax" in cookie
    assert client.get("/agendamentos").status_code == 200


def test_senha_invalida_nao_emite_cookie(monkeypatch):
    client = TestClient(configured_app(monkeypatch), base_url="https://staging.test")
    response = client.post("/staging-access", data={"password": "incorreta"})
    assert response.status_code == 401
    assert COOKIE_NAME not in response.headers.get("set-cookie", "")


def test_cookie_expirado_ou_adulterado_e_rejeitado():
    settings = StagingGateSettings(True, PASSWORD_HASH, SIGNING_SECRET)
    token = create_access_token(settings, now=1000)
    assert validate_access_token(token, settings, now=1000 + COOKIE_MAX_AGE - 1)
    assert not validate_access_token(token, settings, now=1000 + COOKIE_MAX_AGE)
    assert not validate_access_token(token + "x", settings, now=1001)


@pytest.mark.parametrize(
    "secret",
    ["sua-chave-secreta-super-segura-aqui", "curta"],
)
def test_staging_rejeita_chave_jwt_insegura(monkeypatch, secret):
    monkeypatch.setenv("ENV", "staging")
    monkeypatch.setenv("SECRET_KEY", secret)
    import app.security as security

    with pytest.raises(ValueError):
        importlib.reload(security)

    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("SECRET_KEY", "chave-local")
    importlib.reload(security)
