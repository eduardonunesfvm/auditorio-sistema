"""Cria dados ficticios idempotentes exclusivamente no ambiente de homologacao."""

import argparse
import os
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.database import SessionLocal
from app.models import Agendamento, Usuario, UserRole
from app.security import gerar_senha_hash


TIME_ZONE = ZoneInfo("America/Campo_Grande")


def _seed_date(value: str | None) -> date:
    if value:
        return date.fromisoformat(value)
    candidate = datetime.now(TIME_ZONE).date() + timedelta(days=1)
    while candidate.weekday() >= 5:
        candidate += timedelta(days=1)
    return candidate


def _upsert_user(db, login: str, name: str, password: str, role: UserRole) -> Usuario:
    user = db.query(Usuario).filter(Usuario.login == login).first()
    if user is None:
        user = Usuario(login=login, nome=name, role=role, senha_hash="")
        db.add(user)
    user.nome = name
    user.role = role
    user.senha_hash = gerar_senha_hash(password)
    db.flush()
    return user


def _upsert_appointment(db, owner: Usuario, event_date: date, spec: dict) -> None:
    appointment = db.query(Agendamento).filter(
        Agendamento.nome_evento == spec["nome_evento"],
        Agendamento.data_evento == event_date,
    ).first()
    if appointment is None:
        appointment = Agendamento(nome_evento=spec["nome_evento"], data_evento=event_date)
        db.add(appointment)
    appointment.hora_inicio = spec["hora_inicio"]
    appointment.hora_fim = spec["hora_fim"]
    appointment.quantidade_participantes = spec["quantidade_participantes"]
    appointment.observacoes = "Dado ficticio criado pelo seed de homologacao."
    appointment.usuario_id = owner.id


def seed(event_date: date) -> None:
    if os.getenv("ENV", "").strip().lower() != "staging":
        raise RuntimeError("O seed so pode ser executado com ENV=staging.")
    if os.getenv("RAILWAY_ENVIRONMENT_NAME", "staging").strip().lower() != "staging":
        raise RuntimeError("O seed foi bloqueado fora do ambiente Railway staging.")

    admin_password = os.getenv("STAGING_SEED_ADMIN_PASSWORD", "")
    viewer_password = os.getenv("STAGING_SEED_VIEWER_PASSWORD", "")
    if not admin_password or not viewer_password:
        raise RuntimeError("Defina STAGING_SEED_ADMIN_PASSWORD e STAGING_SEED_VIEWER_PASSWORD.")

    with SessionLocal() as db:
        admin = _upsert_user(db, "hml_admin", "Administrador Homologacao", admin_password, UserRole.ADMIN)
        _upsert_user(db, "hml_visualizador", "Visualizador Homologacao", viewer_password, UserRole.VISUALIZADOR)
        for spec in [
            {
                "nome_evento": "[HML] Reuniao de planejamento",
                "hora_inicio": time(9, 0),
                "hora_fim": time(10, 0),
                "quantidade_participantes": 12,
            },
            {
                "nome_evento": "[HML] Treinamento institucional",
                "hora_inicio": time(14, 0),
                "hora_fim": time(16, 0),
                "quantidade_participantes": 35,
            },
        ]:
            _upsert_appointment(db, admin, event_date, spec)
        db.commit()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="Data YYYY-MM-DD; por padrao usa o proximo dia util.")
    args = parser.parse_args()
    selected_date = _seed_date(args.date)
    seed(selected_date)
    print(f"Seed ficticio de homologacao confirmado para {selected_date.isoformat()}.")


if __name__ == "__main__":
    main()
