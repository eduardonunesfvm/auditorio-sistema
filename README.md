# Sistema de Controle do Auditório

[![CI](https://github.com/eduardonunesfvm/auditorio-sistema/actions/workflows/ci.yml/badge.svg)](https://github.com/eduardonunesfvm/auditorio-sistema/actions)

Sistema interno para autenticação de usuários e gerenciamento dos agendamentos do auditório.

## Funcionalidades

- Cadastro e autenticação com JWT.
- Perfis `admin`, `superintendente` e `visualizador`.
- Criação, consulta, edição e exclusão de agendamentos.
- Detecção de conflito entre horários.
- Destaque do próximo evento e busca de agendamentos.
- Interface responsiva servida por Nginx.

## Tecnologias

- Backend: FastAPI, SQLAlchemy, Alembic e PostgreSQL.
- Frontend: HTML, CSS e JavaScript sem framework.
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
| `GET` | `/api/v1/agendamentos` | Listar agendamentos |
| `GET` | `/api/v1/agendamentos/proximo` | Consultar próximo evento |
| `POST` | `/api/v1/agendamentos` | Criar agendamento |
| `PUT` | `/api/v1/agendamentos/{id}` | Atualizar agendamento |
| `DELETE` | `/api/v1/agendamentos/{id}` | Excluir agendamento |

## Testes e migrations

```bash
cd projeto-auditorio
pytest app/tests.py -v
alembic upgrade head
```

Antes de aplicar migrations destrutivas em produção, faça o backup operacional do banco.
