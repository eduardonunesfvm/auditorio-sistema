FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc && \
    rm -rf /var/lib/apt/lists/*

COPY projeto-auditorio/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY projeto-auditorio/ .
COPY auditorio-front/ static/

RUN chmod +x entrypoint.sh

ENV PORT=8000

EXPOSE $PORT

ENTRYPOINT ["./entrypoint.sh"]
