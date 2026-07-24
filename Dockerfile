FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    libpango-1.0-0 libgdk-pixbuf2.0-0 libffi-dev shared-mime-info && \
    rm -rf /var/lib/apt/lists/*

COPY projeto-auditorio/requirements-lock.txt .
RUN pip install --no-cache-dir -r requirements-lock.txt

COPY projeto-auditorio/ .
COPY auditorio-front/ static/

RUN chmod +x entrypoint.sh

ENV PORT=8000
ENV STATIC_DIR=/app/static

EXPOSE $PORT

ENTRYPOINT ["./entrypoint.sh"]
