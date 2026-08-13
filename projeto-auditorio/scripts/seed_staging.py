"""Cria dados ficticios idempotentes exclusivamente no ambiente de homologacao."""

import argparse
import os
import sys
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

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
                "dias_apos_data_base": 0,
                "hora_inicio": time(9, 0),
                "hora_fim": time(10, 0),
                "quantidade_participantes": 12,
            },
            {
                "nome_evento": "[HML] Treinamento institucional",
                "dias_apos_data_base": 0,
                "hora_inicio": time(14, 0),
                "hora_fim": time(16, 0),
                "quantidade_participantes": 35,
            },
            {
                "nome_evento": "[HML] Cafe com as equipes",
                "dias_apos_data_base": 0,
                "hora_inicio": time(7, 0),
                "hora_fim": time(8, 0),
                "quantidade_participantes": 18,
            },
            {
                "nome_evento": "[HML] Alinhamento de projetos",
                "dias_apos_data_base": 0,
                "hora_inicio": time(10, 0),
                "hora_fim": time(11, 0),
                "quantidade_participantes": 14,
            },
            {
                "nome_evento": "[HML] Integracao de novos servidores",
                "dias_apos_data_base": 0,
                "hora_inicio": time(13, 0),
                "hora_fim": time(14, 0),
                "quantidade_participantes": 30,
            },
            {
                "nome_evento": "[HML] Encerramento semanal",
                "dias_apos_data_base": 0,
                "hora_inicio": time(16, 0),
                "hora_fim": time(17, 0),
                "quantidade_participantes": 42,
            },
            {
                "nome_evento": "[HML] Capacitacao de seguranca",
                "dias_apos_data_base": 3,
                "hora_inicio": time(8, 0),
                "hora_fim": time(10, 0),
                "quantidade_participantes": 55,
            },
            {
                "nome_evento": "[HML] Planejamento estrategico",
                "dias_apos_data_base": 3,
                "hora_inicio": time(13, 0),
                "hora_fim": time(14, 30),
                "quantidade_participantes": 16,
            },
            {
                "nome_evento": "[HML] Apresentacao de resultados",
                "dias_apos_data_base": 4,
                "hora_inicio": time(9, 0),
                "hora_fim": time(10, 30),
                "quantidade_participantes": 70,
            },
            {
                "nome_evento": "[HML] Forum de inovacao",
                "dias_apos_data_base": 4,
                "hora_inicio": time(15, 0),
                "hora_fim": time(17, 0),
                "quantidade_participantes": 38,
            },
            {
                "nome_evento": "[HML] Integracao entre setores",
                "dias_apos_data_base": 5,
                "hora_inicio": time(7, 30),
                "hora_fim": time(9, 0),
                "quantidade_participantes": 27,
            },
            {
                "nome_evento": "[HML] Assembleia institucional",
                "dias_apos_data_base": 6,
                "hora_inicio": time(18, 0),
                "hora_fim": time(20, 0),
                "quantidade_participantes": 90,
            },
        ]:
            appointment_date = event_date + timedelta(days=spec["dias_apos_data_base"])
            _upsert_appointment(db, admin, appointment_date, spec)
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
