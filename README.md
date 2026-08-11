# Sistema de Controle do Auditório

[![CI](https://github.com/eduardonunesfvm/auditorio-sistema/actions/workflows/ci.yml/badge.svg)](https://github.com/eduardonunesfvm/auditorio-sistema/actions)

Sistema interno para autenticação de usuários e gerenciamento dos agendamentos do auditório.

## Funcionalidades

- Cadastro e autenticação com JWT.
- Perfis `admin`, `superintendente` e `visualizador`.
- Criação, consulta, edição e exclusão de agendamentos.
- Consulta visual da disponibilidade antes da confirmação.
- Proteção contra reservas concorrentes e sobreposição de horários.
- Destaque do próximo evento e busca de agendamentos.
- Interface responsiva servida por Nginx.

O auditório funciona no horário de Campo Grande (`America/Campo_Grande`), das 07:00 às 11:00 e das 13:00 às 20:00. Eventos adjacentes são permitidos, mas um evento não pode atravessar a pausa para almoço.

## Tecnologias

- Backend: FastAPI, SQLAlchemy, Alembic e PostgreSQL.
- Frontend: HTML, CSS e JavaScript sem framework.
- Testes: Pytest, PostgreSQL real e Playwright.
- Infraestrutura: Docker Compose e GitHub Actions.

## Execução com Docker

Configure `DATABASE_URL`, `SECRET_KEY` e as demais variáveis do `.env.docker`, depois execute:

```bash
docker compose up --build
```

- Frontend: `http://localhost`
- API: `http://localhost:8000`
- Documentação em desenvolvimento: `http://localhost:8000/docs`
- Health check: `GET /health`

## API principal

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/auth/login` | Autenticar usuário |
| `POST` | `/auth/cadastro` | Cadastrar usuário |
| `GET` | `/agendamentos` | Listar agendamentos |
| `GET` | `/agendamentos/proximo` | Consultar próximo evento |
| `GET` | `/agendamentos/disponibilidade?data=YYYY-MM-DD` | Consultar intervalos ocupados |
| `POST` | `/agendamentos/criar_agendamento` | Criar agendamento |
| `PUT` | `/agendamentos/{id}` | Atualizar agendamento |
| `DELETE` | `/agendamentos/{id}` | Excluir agendamento |

Conflitos de horário retornam HTTP `409` com o código `schedule_conflict`. Violações do expediente retornam HTTP `400` com o código `invalid_schedule_window`.

## Proteção do login

O endpoint `POST /auth/login` usa Redis para aplicar, de forma atômica, os limites
padrão de 10 tentativas por IP a cada minuto e 5 tentativas por login a cada 15
minutos. O login normalizado é armazenado apenas como hash SHA-256. Ao atingir um
limite, a API responde com HTTP `429` e o cabeçalho `Retry-After`.

No Railway, adicione um serviço Redis ao projeto e configure `REDIS_URL` no
serviço da aplicação como referência à variável `REDIS_URL` desse Redis. Os
limites podem ser alterados por estas variáveis:

| Variável | Padrão |
|---|---:|
| `LOGIN_RATE_LIMIT_IP_MAX` | `10` |
| `LOGIN_RATE_LIMIT_IP_WINDOW_SECONDS` | `60` |
| `LOGIN_RATE_LIMIT_LOGIN_MAX` | `5` |
| `LOGIN_RATE_LIMIT_LOGIN_WINDOW_SECONDS` | `900` |

Se o Redis estiver indisponível, a API permite o login e registra um erro. Isso
evita indisponibilidade total, mas o alerta deve ser monitorado nos logs.

## Backup e restauração do PostgreSQL

O plano Hobby não inclui os backups nativos de volume do Railway. Por isso, o
projeto usa dumps portáteis fora da plataforma e não depende de snapshots ou
PITR do Railway.

Para manter uma cópia portátil fora do Railway, instale o cliente PostgreSQL,
defina `DATABASE_PUBLIC_URL` somente no ambiente local e execute:

```powershell
.\scripts\backup-postgres.ps1
```

Os arquivos são gravados em `backups/`, ignorados pelo Git, e recebem um hash
SHA-256. Transfira cada dump para armazenamento externo criptografado. Teste a
restauração periodicamente em um banco temporário, nunca diretamente em produção:

```powershell
pg_restore --clean --if-exists --no-owner --no-acl `
  --dbname="<BANCO_TEMPORARIO>" ".\backups\auditorio-AAAA-MM-DD_HHMMSS.dump"
```

Consulte também a documentação oficial do
[PostgreSQL no Railway](https://docs.railway.com/databases/postgresql).

O workflow `database-backup.yml` executa diariamente às 06:00 UTC, restaura cada
dump em um PostgreSQL temporário e mantém o artefato no GitHub por 30 dias. Ele
depende do secret `RAILWAY_DATABASE_PUBLIC_URL` no repositório. Em caso de falha,
o workflow cria ou atualiza uma issue de alerta. Para retenção superior a 30
dias, baixe o dump e o arquivo `.sha256` antes de o artefato expirar.

## Testes e migrations

```bash
cd projeto-auditorio
pytest app/tests.py -v
alembic upgrade head
```

Os testes PostgreSQL exigem `POSTGRES_TEST_DATABASE_URL` apontando para um banco isolado:

```bash
pytest app/test_postgres_scheduling.py -v
```

Os testes do frontend são executados separadamente:

```bash
cd auditorio-front
npm ci
npx playwright install chromium
npm run test:e2e
```

A migration de regras de horário interrompe o upgrade se encontrar sobreposições ou registros fora do expediente. Ela não altera dados automaticamente. Faça o backup operacional do banco e corrija os identificadores informados antes de tentar novamente.
