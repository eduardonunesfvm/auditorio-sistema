import base64
import hashlib
import hmac
import html
import json
import os
import time
from dataclasses import dataclass
from urllib.parse import parse_qs, quote

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from passlib.context import CryptContext
from starlette.middleware.base import BaseHTTPMiddleware


COOKIE_NAME = "auditorio_staging_access"
COOKIE_MAX_AGE = 8 * 60 * 60
_password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _enabled(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class StagingGateSettings:
    enabled: bool
    password_hash: str = ""
    signing_secret: str = ""

    @classmethod
    def from_environment(cls) -> "StagingGateSettings":
        environment = os.getenv("ENV", "development").strip().lower()
        requested = _enabled(os.getenv("STAGING_GATE_ENABLED"))
        enabled = requested and environment == "staging"
        if not enabled:
            return cls(enabled=False)

        password_hash = os.getenv("STAGING_GATE_PASSWORD_HASH", "").strip()
        signing_secret = os.getenv("STAGING_GATE_SECRET", "")
        if not password_hash:
            raise RuntimeError("STAGING_GATE_PASSWORD_HASH e obrigatoria quando o portao esta ativo.")
        if len(signing_secret.encode("utf-8")) < 32:
            raise RuntimeError("STAGING_GATE_SECRET deve possuir pelo menos 32 bytes.")
        return cls(True, password_hash, signing_secret)


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_access_token(settings: StagingGateSettings, now: int | None = None) -> str:
    issued_at = int(time.time() if now is None else now)
    payload = _encode(json.dumps({"exp": issued_at + COOKIE_MAX_AGE}, separators=(",", ":")).encode())
    signature = hmac.new(settings.signing_secret.encode(), payload.encode(), hashlib.sha256).digest()
    return payload + "." + _encode(signature)


def validate_access_token(
    token: str | None,
    settings: StagingGateSettings,
    now: int | None = None,
) -> bool:
    try:
        payload, provided_signature = str(token or "").split(".", 1)
        expected_signature = hmac.new(
            settings.signing_secret.encode(), payload.encode(), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(_decode(provided_signature), expected_signature):
            return False
        data = json.loads(_decode(payload))
        current_time = int(time.time() if now is None else now)
        return int(data["exp"]) > current_time
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        return False


def _safe_next(value: str | None) -> str:
    candidate = str(value or "/")
    return candidate if candidate.startswith("/") and not candidate.startswith("//") else "/"


def _gate_page(next_path: str, invalid: bool = False) -> str:
    message = '<p class="error" role="alert">Senha incorreta.</p>' if invalid else ""
    return f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Acesso a homologacao</title><style>
*{{box-sizing:border-box}}body{{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f4f7fb;color:#172033;font-family:Inter,Segoe UI,sans-serif}}
main{{width:min(100%,420px);padding:32px;border:1px solid #d4dae4;border-radius:18px;background:white;box-shadow:0 18px 45px #1c304e1f}}
p{{color:#667085}}label{{display:block;margin:24px 0 8px;font-weight:700}}input{{width:100%;min-height:46px;padding:10px 12px;border:1px solid #aeb6c4;border-radius:8px;font:inherit}}
button{{width:100%;min-height:46px;margin-top:16px;border:0;border-radius:8px;color:white;background:#1f62b3;font:inherit;font-weight:700;cursor:pointer}}
.error{{padding:10px;border-radius:8px;color:#b42318;background:#fff1f0}}
</style></head><body><main><h1>Ambiente de homologacao</h1><p>Informe a senha adicional para acessar este ambiente de testes.</p>{message}
<form method="post" action="/staging-access"><input type="hidden" name="next" value="{html.escape(_safe_next(next_path), quote=True)}">
<label for="password">Senha de acesso</label><input id="password" name="password" type="password" required autofocus autocomplete="current-password">
<button type="submit">Entrar na homologacao</button></form></main></body></html>"""


class StagingGateMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, settings: StagingGateSettings):
        super().__init__(app)
        self.settings = settings

    async def dispatch(self, request: Request, call_next):
        if request.url.path in {"/health", "/staging-access"}:
            return await call_next(request)
        if validate_access_token(request.cookies.get(COOKIE_NAME), self.settings):
            return await call_next(request)

        accepts_html = "text/html" in request.headers.get("accept", "")
        if request.method == "GET" and accepts_html:
            destination = request.url.path
            if request.url.query:
                destination += "?" + request.url.query
            return RedirectResponse("/staging-access?next=" + quote(destination, safe=""), status_code=303)
        return JSONResponse(
            {"detail": {"code": "staging_access_required", "message": "Acesso a homologacao necessario."}},
            status_code=401,
        )


def install_staging_gate(app: FastAPI) -> StagingGateSettings:
    settings = StagingGateSettings.from_environment()
    if not settings.enabled:
        return settings

    app.add_middleware(StagingGateMiddleware, settings=settings)

    @app.get("/staging-access", include_in_schema=False)
    async def staging_access_form(next: str = "/"):
        return HTMLResponse(_gate_page(_safe_next(next)))

    @app.post("/staging-access", include_in_schema=False)
    async def staging_access_submit(request: Request):
        body = (await request.body()).decode("utf-8", errors="replace")
        form = parse_qs(body, keep_blank_values=True)
        password = form.get("password", [""])[0]
        next_path = _safe_next(form.get("next", ["/"])[0])
        try:
            valid = _password_context.verify(password, settings.password_hash)
        except (ValueError, TypeError):
            valid = False
        if not valid:
            return HTMLResponse(_gate_page(next_path, invalid=True), status_code=401)

        response = RedirectResponse(next_path, status_code=303)
        response.set_cookie(
            COOKIE_NAME,
            create_access_token(settings),
            max_age=COOKIE_MAX_AGE,
            httponly=True,
            secure=True,
            samesite="lax",
            path="/",
        )
        return response

    return settings
