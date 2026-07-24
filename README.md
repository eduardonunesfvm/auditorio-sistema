# Sistema da Secretaria de Saúde

[![CI](https://github.com/eduardonunesfvm/auditorio-sistema/actions/workflows/ci.yml/badge.svg)](https://github.com/eduardonunesfvm/auditorio-sistema/actions)
![Python](https://img.shields.io/badge/python-3.11-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.139-009688)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-production-brightgreen)

**Em produção → [sistemanephs.com.br](https://sistemanephs.com.br)**

Sistema web full-stack desenvolvido para a Secretaria de Saúde — gerenciamento de reservas do auditório e emissão de Comunicações Internas (CI) com geração de PDF. Projetado, implementado e mantido por um desenvolvedor solo.

---

## Funcionalidades

### Auditório

- CRUD completo de agendamentos (nome, data, horário, participantes, observações)
- Detecção de conflitos de horário com sobreposição matemática
- Card de próximo evento com destaque visual
- Busca textual por nome ou data
- Cada usuário edita/exclui apenas seus próprios eventos

### Comunicação Interna (CI)

- Dois tipos de documento: **Comunicação Interna** e **Solicitação de Material**
- Editor WYSIWYG (Jodit) com suporte a **tabelas**, negrito, itálico e listas
- Campos **De/Para** (origem/destino) para rastreamento entre setores
- PDF gerado com **WeasyPrint + Jinja2** — layout A4 profissional com banner institucional
- Assinatura condicional: signatário livre (CI normal) ou autoridade fixa + carimbo + protocolo de recebimento (Solicitação)
- Numeração sequencial automática (1–100 cíclico)

### Autenticação e Permissões

- JWT + bcrypt com roles hierárquicas:

| Role | Auditório | CI |
|---|---|---|
| `admin` | CRUD completo | Acesso total |
| `superintendente` | CRUD próprio | Com permissão `ci` |
| `visualizador` | Somente leitura | Bloqueado |

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.11, FastAPI, Uvicorn |
| Frontend | HTML5, CSS3, JavaScript (vanilla, 950 linhas) |
| Banco | PostgreSQL (Railway, serverless) |
| ORM | SQLAlchemy 2.0 |
| Migrações | Alembic |
| Autenticação | JWT (PyJWT) + bcrypt (passlib) |
| Validação | Pydantic v2 |
| PDF | WeasyPrint + Jinja2 |
| Editor WYSIWYG | Jodit (local, sem CDN) |
| Containerização | Docker, Docker Compose |
| Proxy reverso | Nginx (cache-busting) |
| CI/CD | GitHub Actions (test + build → Railway) |
| Infraestrutura | Railway (PaaS) + Railway PostgreSQL (DBaaS) |
| Domínio | sistemanephs.com.br |

---

## Métricas

```
54 testes automatizados   14 arquivos Python    1.575 linhas Python
 3 tabelas no banco       14 endpoints REST      950 linhas JavaScript
 1 desenvolvedor          100% cobertura de CI/CD
```

---

## Arquitetura

```
┌─────────────────────────────────────────────────┐
│                    Railway                       │
│  ┌──────────────┐    ┌──────────────────────┐   │
│  │   Nginx (:80) │───→│  FastAPI (:8000)     │   │
│  │   SPA estática│    │  Repository-Service  │   │
│  └──────────────┘    └──────────┬───────────┘   │
│                                 │               │
└─────────────────────────────────┼───────────────┘
                                  │
                         ┌────────▼────────┐
                         │  Railway PostgreSQL │
                         │  (serverless)    │
                         └─────────────────┘
```

**Padrão backend:** `Router → Service → Repository → PostgreSQL`

```
main.py  →  routers/{auth, agendamentos, ci}.py
               ↓
          service.py  (regras de negócio, PDF)
               ↓
          repository.py  (SQLAlchemy queries)
               ↓
          models.py  (ORM: usuarios, agendamentos, comunicacoes_internas)
```

**Padrão frontend:** SPA vanilla com dois módulos independentes — auditório e CI — cada um com seu próprio cache de dados, formulário, tabela e busca.

---

## Estrutura do Projeto

```
.
├── .github/workflows/ci.yml     # CI: test + build
├── docker-compose.yml           # Orquestração local (dev)
├── auditorio-front/             # Frontend SPA
│   ├── Dockerfile               # Nginx + estáticos
│   ├── nginx.conf               # Reverse proxy + cache headers
│   ├── index.html               # 245 linhas
│   ├── app.js                   # 950 linhas (auditório + CI + auth)
│   ├── styles.css               # 970 linhas (responsivo)
│   ├── jodit.min.js             # Editor WYSIWYG local
│   └── favicon.png
├── projeto-auditorio/           # Backend FastAPI
│   ├── Dockerfile               # Python 3.11
│   ├── entrypoint.sh            # Migrations + uvicorn
│   ├── requirements.txt
│   ├── alembic/                 # 4 migrations versionadas
│   └── app/
│       ├── main.py              # Entry point, CORS, static serve
│       ├── database.py          # SQLAlchemy engine + session
│       ├── models.py            # Usuario, Agendamento, ComunicacaoInterna
│       ├── schemas.py           # Pydantic (create/response/update)
│       ├── repository.py        # Queries e acesso a dados
│       ├── service.py           # Regras de negócio + PDF (225 linhas)
│       ├── security.py          # JWT + bcrypt
│       ├── dependencies.py      # Injeção de dependências + RBAC
│       ├── tests.py             # 54 testes com pytest + SQLite
│       ├── templates/
│       │   └── ci_template.html # Template PDF (Jinja2 + WeasyPrint)
│       └── routers/
│           ├── auth.py          # POST /auth/login, /auth/cadastro
│           ├── agendamentos.py  # CRUD + próximo evento
│           └── ci.py            # CI CRUD + PDF download
└── docs/superpowers/            # Specs e planos de implementação
```

---

## API Endpoints

| Método | Rota | Descrição | Auth | Role |
|---|---|---|---|---|
| `POST` | `/auth/login` | Login e token JWT | Não | — |
| `POST` | `/auth/cadastro` | Cadastro de usuário | Não | — |
| `GET` | `/agendamentos` | Listar agendamentos | Sim | Todos |
| `GET` | `/agendamentos/proximo` | Próximo evento | Sim | Todos |
| `POST` | `/agendamentos/criar_agendamento` | Criar agendamento | Sim | admin, superintendente |
| `PUT` | `/agendamentos/{id}` | Editar agendamento | Sim | Criador ou admin |
| `DELETE` | `/agendamentos/{id}` | Excluir agendamento | Sim | Criador ou admin |
| `POST` | `/api/v1/ci` | Criar CI → PDF | Sim | admin, superintendente+ci |
| `GET` | `/api/v1/ci` | Listar CIs | Sim | Todos |
| `GET` | `/api/v1/ci/{id}/pdf` | Baixar PDF da CI | Sim | Todos |
| `PUT` | `/api/v1/ci/{id}` | Editar CI → PDF | Sim | admin, superintendente+ci |
| `GET` | `/health` | Health check | Não | — |
| `GET` | `/docs` | Swagger UI | Não | — |

---

## Banco de Dados

```
usuarios
├── id (UUID, PK)
├── nome (VARCHAR 100)
├── login (VARCHAR 50, UNIQUE)
├── senha_hash (VARCHAR 255)
├── role (VARCHAR 30: admin | superintendente | visualizador)
└── permissions (JSON: ["ci", ...])

agendamentos
├── id (UUID, PK)
├── nome_evento (VARCHAR 150)
├── data_evento (DATE, INDEX)
├── hora_inicio (TIME)
├── hora_fim (TIME)
├── quantidade_participantes (INTEGER, NULL)
├── observacoes (TEXT, NULL)
└── usuario_id (UUID, FK → usuarios.id)

comunicacoes_internas
├── id (UUID, PK)
├── numero_ci (INTEGER, sequencial 1–100)
├── tipo (VARCHAR 50: comunicacao_interna | solicitacao_material)
├── de (VARCHAR 255)
├── para (VARCHAR 255)
├── titulo (VARCHAR 255)
├── descricao (TEXT, HTML)
├── data (DATE)
├── nome_signatario (VARCHAR 255, NULL)
├── sobrenome_signatario (VARCHAR 255, NULL)
├── cargo_signatario (VARCHAR 255, NULL)
├── usuario_id (UUID, FK → usuarios.id)
└── created_at (DATETIME)
```

---

## Pipeline CI/CD

```
feature/*  →  PR para develop  →  GitHub Actions  →  merge develop
                                                     ↓
                                              PR develop → master
                                                     ↓
                                              GitHub Actions
                                              (test + build)
                                                     ↓
                                              merge master
                                                     ↓
                                           Railway auto-deploy
                                           (sistemanephs.com.br)
```

- **Test**: `pytest` com SQLite em memória (sem dependência de banco externo)
- **Build**: `docker build` validando a imagem sem push
- **Deploy**: Railway detecta push no `master` automaticamente

---

## Como Rodar Localmente

### Pré-requisitos

- Python 3.11+
- PostgreSQL 14+ (ou Docker)
- Railway CLI (para prod)

### Opção 1: Docker Compose

```bash
git clone https://github.com/eduardonunesfvm/auditorio-sistema.git
cd auditorio-sistema

cp projeto-auditorio/.env.example projeto-auditorio/.env
# Edite .env com DATABASE_URL e SECRET_KEY

docker compose up -d --build
# http://localhost
```

### Opção 2: Desenvolvimento

```bash
cd projeto-auditorio
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Outro terminal
cd auditorio-front
python -m http.server 5500
# http://localhost:5500
```

### Testes

```bash
cd projeto-auditorio
pytest app/tests.py -v
```

---

## Regras de Negócio

- Hora de início < hora de término
- Sem sobreposição de horários no mesmo dia
- Apenas o criador (ou admin) pode editar/excluir eventos
- CI: campos de signatário obrigatórios apenas para CI normal
- CI: numeração cíclica 1–100 compartilhada entre tipos
- Visualizador: somente leitura, sem acesso ao módulo CI

---

## Infraestrutura em Produção

| Recurso | Provedor | Plano |
|---|---|---|
| Aplicação | Railway | Hobby |
| Banco de dados | Railway PostgreSQL | Free (0.5 GB) |
| Domínio | Registro.br | sistemanephs.com.br |
| CI/CD | GitHub Actions | Free |

---

Desenvolvido por **[Eduardo Nunes](https://linkedin.com/in/eduardonunesfvm)** — estagiário e único desenvolvedor da Secretaria de Saúde, responsável por levantamento de requisitos, arquitetura, implementação, deploy e manutenção.
