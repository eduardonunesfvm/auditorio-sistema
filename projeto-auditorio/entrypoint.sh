#!/bin/sh
set -e

echo "Executando migracoes..."
alembic upgrade head

echo "Iniciando API..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
