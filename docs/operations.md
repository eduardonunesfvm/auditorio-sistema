# Guia de operação

Este guia reúne configuração local, migrations, segurança, backup e diagnóstico. Para uma visão rápida do produto, consulte o [README principal](../README.md).

## Variáveis de ambiente

| Variável | Obrigatória | Padrão | Finalidade |
|---|---:|---|---|
| `DATABASE_URL` | Sim | — | Conexão SQLAlchemy com PostgreSQL |
| `SECRET_KEY` | Sim | — | Assinatura dos tokens JWT |
| `ALGORITHM` | Não | `HS256` | Algoritmo de assinatura JWT |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Não | `30` | Validade do token |
| `ENV` | Não | `development` | Em `production`, desabilita Swagger e OpenAPI |
| `REDIS_URL` | Não | — | Habilita o rate limiting do login |
| `STAGING_GATE_ENABLED` | Não | `false` | Habilita o portão adicional somente quando `ENV=staging` |
| `STAGING_GATE_PASSWORD_HASH` | Em staging | — | Hash bcrypt da senha adicional de homologação |
| `STAGING_GATE_SECRET` | Em staging | — | Assina o cookie de acesso; mínimo de 32 bytes |
| `LOGIN_RATE_LIMIT_IP_MAX` | Não | `10` | Tentativas por IP |
| `LOGIN_RATE_LIMIT_IP_WINDOW_SECONDS` | Não | `60` | Janela do limite por IP |
| `LOGIN_RATE_LIMIT_LOGIN_MAX` | Não | `5` | Tentativas por login |
| `LOGIN_RATE_LIMIT_LOGIN_WINDOW_SECONDS` | Não | `900` | Janela do limite por login |
| `OTEL_ENABLED` | Não | `false` | Habilita exportação para o Grafana Cloud |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Com OTEL | — | Endpoint base OTLP/HTTP |
| `OTEL_EXPORTER_OTLP_HEADERS` | Com OTEL | — | Autenticação do endpoint OTLP |
| `OTEL_SERVICE_NAME` | Não | `auditorio-api` | Nome do serviço na telemetria |
| `OTEL_METRIC_EXPORT_INTERVAL` | Não | `60000` | Intervalo de métricas em milissegundos |

Nunca versione arquivos `.env` reais. Gere uma `SECRET_KEY` longa e aleatória para cada ambiente e mantenha `OTEL_EXPORTER_OTLP_HEADERS` somente no gerenciador de secrets.

Em `staging` e `production`, a aplicação rejeita `SECRET_KEY` curta ou com valor conhecido de exemplo. O procedimento de homologação, seed e promoção está no [guia de ambientes](environments.md).

## Docker Compose

O Compose inicia a API e um Nginx para o frontend. PostgreSQL e, quando usados, Redis e Grafana Cloud devem estar acessíveis pelas URLs configuradas. As variáveis de JWT, rate limiting e OpenTelemetry são encaminhadas ao container da API; a telemetria permanece desativada enquanto `OTEL_ENABLED=false`.

1. Edite `.env.docker` e substitua os placeholders.
2. Se o banco estiver instalado na máquina host, use um hostname acessível pelo container, como `host.docker.internal` no Docker Desktop.
3. Inicie os serviços:

```bash
docker compose --env-file .env.docker up --build
```

Para acompanhar os logs:

```bash
docker compose logs -f api frontend
```

Para encerrar os containers sem remover dados de serviços externos:

```bash
docker compose down
```

## Execução sem Docker

Crie um ambiente virtual, instale as dependências travadas e configure as variáveis:

```bash
cd projeto-auditorio
python -m venv .venv
python -m pip install -r requirements-lock.txt
```

Copie `.env.example` para `.env`, ajuste os valores e aplique as migrations:

```bash
alembic upgrade head
uvicorn app.main:app --reload
```

A API ficará em `http://localhost:8000`. Para servir o frontend separadamente, use um servidor HTTP local no diretório `auditorio-front`; nesse modo, a aplicação direciona a API para `http://127.0.0.1:8000` nas portas de desenvolvimento previstas no código.

## Migrations

Verifique a revisão atual e aplique todas as migrations:

```bash
cd projeto-auditorio
alembic current
alembic upgrade head
```

A migration de regras de horário exige PostgreSQL. Antes de instalar as constraints, ela bloqueia a tabela e verifica:

- eventos com fim anterior ou igual ao início;
- eventos fora dos dois turnos permitidos;
- eventos sobrepostos na mesma data.

Ao encontrar inconsistências, o upgrade é interrompido e os identificadores são apresentados. Faça um backup, corrija os registros informados e execute novamente. A migration não altera esses dados automaticamente.

Mais comandos estão no [guia do Alembic](../projeto-auditorio/ALEMBIC_GUIDE.md).

## Testes

### API

```bash
cd projeto-auditorio
python -m pytest app/tests.py -v
```

### PostgreSQL e concorrência

Use exclusivamente um banco descartável:

```bash
cd projeto-auditorio
POSTGRES_TEST_DATABASE_URL="postgresql://usuario:senha@localhost:5432/auditorio_test" \
python -m pytest app/test_postgres_scheduling.py -v
```

### Frontend

```bash
cd auditorio-front
npm ci
npx playwright install
npm run test:e2e
```

## Rate limiting do login

Com `REDIS_URL` configurada, `POST /auth/login` verifica de forma atômica os limites por IP e por login. Ao exceder qualquer limite, a API responde HTTP `429` e inclui `Retry-After`.

O endereço encaminhado por `X-Forwarded-For` só é aceito quando a conexão direta vem de um proxy em rede privada. Isso evita confiar indiscriminadamente em um cabeçalho fornecido pelo cliente.

Se o Redis não estiver configurado, a proteção fica desabilitada. Se estiver configurado e falhar durante uma requisição, a API registra o erro e permite a tentativa de login.

## Health check

```http
GET /health
```

Uma resposta `200` confirma que a aplicação conseguiu executar `SELECT 1` no banco. Uma falha de conexão retorna `500`.

## Grafana Cloud

Métricas e traces podem ser enviados diretamente por OTLP/HTTP, sem executar Prometheus, Loki ou Grafana no Railway. O procedimento completo, o dashboard importável e as consultas dos alertas estão no [guia de observabilidade](observability.md).

## Backup local

O script usa `pg_dump` no formato custom, grava o arquivo em `backups/` e calcula o SHA-256, exibido ao final da execução:

```powershell
$env:DATABASE_PUBLIC_URL = "postgresql://usuario:senha@host:porta/banco"
.\scripts\backup-postgres.ps1
```

Os dumps são ignorados pelo Git. Transfira-os para armazenamento externo criptografado e teste a restauração periodicamente em um banco temporário:

```powershell
pg_restore --clean --if-exists --no-owner --no-acl `
  --dbname="postgresql://usuario:senha@host:porta/banco_temporario" `
  ".\backups\auditorio-AAAA-MM-DD_HHMMSS.dump"
```

Nunca teste uma restauração diretamente no banco de produção.

## Backup automatizado

O workflow `.github/workflows/database-backup.yml`:

1. executa diariamente às 06:00 UTC ou sob acionamento manual;
2. cria um dump a partir do secret `RAILWAY_DATABASE_PUBLIC_URL`;
3. gera e verifica o SHA-256;
4. restaura o dump em um PostgreSQL temporário;
5. executa consultas básicas de integridade;
6. publica o dump como artefato por 30 dias;
7. cria ou atualiza uma issue se o processo falhar.

Para retenção superior a 30 dias, copie o dump e o hash para um armazenamento externo antes da expiração do artefato.

## Checklist de produção

- Definir `ENV=production` para ocultar Swagger e OpenAPI.
- Usar uma `SECRET_KEY` exclusiva e armazenada como secret.
- Configurar PostgreSQL com conexão criptografada quando oferecida pelo provedor.
- Configurar `REDIS_URL` e monitorar falhas do rate limiter.
- Aplicar migrations antes de liberar a nova versão.
- Verificar `GET /health` após o deploy.
- Confirmar a execução e a restauração do backup mais recente.
- Confirmar ingestão de métricas e traces e testar o contact point do Grafana.
- Verificar o synthetic check público de `/health`.
- Restringir o endpoint de cadastro antes de expor o sistema publicamente.
