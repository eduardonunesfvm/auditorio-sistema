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
