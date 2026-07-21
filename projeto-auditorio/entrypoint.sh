#!/bin/sh
set -e

echo "Executando migracoes..."
alembic upgrade head

PORT="${PORT:-8000}"

echo "Iniciando API na porta ${PORT}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT}"
