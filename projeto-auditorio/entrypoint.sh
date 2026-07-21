#!/bin/sh
set -e

echo "Aguardando banco de dados..."
until pg_isready -h db -p 5432 -U postgres; do
  sleep 2
done

echo "Executando migracoes..."
alembic upgrade head

echo "Iniciando API..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
