# Sistema da Secretaria de Saude

[![CI](https://github.com/eduardonunesfvm/auditorio-sistema/actions/workflows/ci.yml/badge.svg)](https://github.com/eduardonunesfvm/auditorio-sistema/actions)
![Python](https://img.shields.io/badge/python-3.11-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-0.139-009688)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-production-brightgreen)

**Em producao -> [sistemanephs.com.br](https://sistemanephs.com.br)**

Sistema web full-stack desenvolvido para a Secretaria de Saude -- gerenciamento de reservas do auditorio e emissao de Comunicacoes Internas (CI) com geracao de PDF. Projetado, implementado e mantido por um desenvolvedor solo.

---

## Funcionalidades

### Auditorio

- CRUD completo de agendamentos (nome, data, horario, participantes, observacoes)
- Deteccao de conflitos de horario com sobreposicao matematica
- Card de proximo evento com destaque visual
- Busca textual por nome ou data
- Cada usuario edita/exclui apenas seus proprios eventos

### Comunicacao Interna (CI)

- Dois tipos de documento: **Comunicacao Interna** e **Solicitacao de Material**
- Editor WYSIWYG (Jodit) com suporte a **tabelas**, negrito, italico e listas
- Campos **De/Para** (origem/destino) para rastreamento entre setores
- PDF gerado com **WeasyPrint + Jinja2** -- layout A4 profissional com banner institucional
- Assinatura condicional: signatario livre (CI normal) ou autoridade fixa + carimbo + protocolo de recebimento (Solicitacao)
- Numeracao sequencial automatica (1-100 ciclico)

### Autenticacao e Permissoes

- JWT + bcrypt com roles hierarquicas:

| Role | Auditorio | CI |
|---|---|---|
| `admin` | CRUD completo | Acesso total |
| `superintendente` | CRUD proprio | Com permissao `ci` |
| `visualizador` | Somente leitura | Bloqueado |

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.11, FastAPI, Uvicorn |
| Frontend | HTML5, CSS3, JavaScript (vanilla, 950 linhas) |
| Banco | PostgreSQL (Railway) |
| ORM | SQLAlchemy 2.0 |
| Migracoes | Alembic |
| Autenticacao | JWT (PyJWT) + bcrypt (passlib) |
| Validacao | Pydantic v2 |
| PDF | WeasyPrint + Jinja2 |
| Editor WYSIWYG | Jodit (local, sem CDN) |
| Containerizacao | Docker, Docker Compose |
| Proxy reverso | Nginx (cache-busting) |
| CI/CD | GitHub Actions (test + build -> Railway) |
| Infraestrutura | Railway (PaaS, monolito Docker) |
| Dominio | sistemanephs.com.br |

---

## Metricas

```
54 testes automatizados   14 arquivos Python    1.575 linhas Python
 3 tabelas no banco       14 endpoints REST      950 linhas JavaScript
 1 desenvolvedor          100% cobertura de CI/CD
```

---

## Arquitetura

```
+------------------------------------------------------+
|                    Railway (PaaS)                     |
|  +--------------+    +--------------+    +--------+  |
|  |   Nginx (:80) |--->| FastAPI      |--->| Postgre|  |
|  |   SPA estatica|    | (:8000)      |    | SQL    |  |
|  +--------------+    +--------------+    +--------+  |
|                                                       |
|  sistemanephs.com.br  .  $5/mes + consumo             |
+------------------------------------------------------+
```

**Padrao backend:** `Router -> Service -> Repository -> PostgreSQL`

```
main.py  ->  routers/{auth, agendamentos, ci}.py
               |
          service.py  (regras de negocio, PDF)
               |
          repository.py  (SQLAlchemy queries)
               |
          models.py  (ORM: usuarios, agendamentos, comunicacoes_internas)
```

**Padrao frontend:** SPA vanilla com dois modulos independentes -- auditorio e CI -- cada um com seu proprio cache de dados, formulario, tabela e busca.

---

## Estrutura do Projeto

```
.
+-- .github/workflows/ci.yml     # CI: test + build
+-- docker-compose.yml           # Orquestracao local (dev)
+-- auditorio-front/             # Frontend SPA
|   +-- Dockerfile               # Nginx + estaticos
|   +-- nginx.conf               # Reverse proxy + cache headers
|   +-- index.html               # 245 linhas
|   +-- app.js                   # 950 linhas (auditorio + CI + auth)
|   +-- styles.css               # 970 linhas (responsivo)
|   +-- jodit.min.js             # Editor WYSIWYG local
|   +-- favicon.png
+-- projeto-auditorio/           # Backend FastAPI
|   +-- Dockerfile               # Python 3.11
|   +-- entrypoint.sh            # Migrations + uvicorn
|   +-- requirements.txt
|   +-- alembic/                 # 4 migrations versionadas
|   +-- app/
|       +-- main.py              # Entry point, CORS, static serve
|       +-- database.py          # SQLAlchemy engine + session
|       +-- models.py            # Usuario, Agendamento, ComunicacaoInterna
|       +-- schemas.py           # Pydantic (create/response/update)
|       +-- repository.py        # Queries e acesso a dados
|       +-- service.py           # Regras de negocio + PDF (225 linhas)
|       +-- security.py          # JWT + bcrypt
|       +-- dependencies.py      # Injecao de dependencias + RBAC
|       +-- tests.py             # 54 testes com pytest + SQLite
|       +-- templates/
|       |   +-- ci_template.html # Template PDF (Jinja2 + WeasyPrint)
|       +-- routers/
|           +-- auth.py          # POST /auth/login, /auth/cadastro
|           +-- agendamentos.py  # CRUD + proximo evento
|           +-- ci.py            # CI CRUD + PDF download
+-- docs/superpowers/            # Specs e planos de implementacao
```

---

## API Endpoints

| Metodo | Rota | Descricao | Auth | Role |
|---|---|---|---|---|
| `POST` | `/auth/login` | Login e token JWT | Nao | -- |
| `POST` | `/auth/cadastro` | Cadastro de usuario | Nao | -- |
| `GET` | `/agendamentos` | Listar agendamentos | Sim | Todos |
| `GET` | `/agendamentos/proximo` | Proximo evento | Sim | Todos |
| `POST` | `/agendamentos/criar_agendamento` | Criar agendamento | Sim | admin, superintendente |
| `PUT` | `/agendamentos/{id}` | Editar agendamento | Sim | Criador ou admin |
| `DELETE` | `/agendamentos/{id}` | Excluir agendamento | Sim | Criador ou admin |
| `POST` | `/api/v1/ci` | Criar CI -> PDF | Sim | admin, superintendente+ci |
| `GET` | `/api/v1/ci` | Listar CIs | Sim | Todos |
| `GET` | `/api/v1/ci/{id}/pdf` | Baixar PDF da CI | Sim | Todos |
| `PUT` | `/api/v1/ci/{id}` | Editar CI -> PDF | Sim | admin, superintendente+ci |
| `GET` | `/health` | Health check | Nao | -- |
| `GET` | `/docs` | Swagger UI (dev apenas) | Nao | -- |

---

## Banco de Dados

```
usuarios
+-- id (UUID, PK)
+-- nome (VARCHAR 100)
+-- login (VARCHAR 50, UNIQUE)
+-- senha_hash (VARCHAR 255)
+-- role (VARCHAR 30: admin | superintendente | visualizador)
+-- permissions (JSON: ["ci", ...])

agendamentos
+-- id (UUID, PK)
+-- nome_evento (VARCHAR 150)
+-- data_evento (DATE, INDEX)
+-- hora_inicio (TIME)
+-- hora_fim (TIME)
+-- quantidade_participantes (INTEGER, NULL)
+-- observacoes (TEXT, NULL)
+-- usuario_id (UUID, FK -> usuarios.id)

comunicacoes_internas
+-- id (UUID, PK)
+-- numero_ci (INTEGER, sequencial 1-100)
+-- tipo (VARCHAR 50: comunicacao_interna | solicitacao_material)
+-- de (VARCHAR 255)
+-- para (VARCHAR 255)
+-- titulo (VARCHAR 255)
+-- descricao (TEXT, HTML)
+-- data (DATE)
+-- nome_signatario (VARCHAR 255, NULL)
+-- sobrenome_signatario (VARCHAR 255, NULL)
+-- cargo_signatario (VARCHAR 255, NULL)
+-- usuario_id (UUID, FK -> usuarios.id)
+-- created_at (DATETIME)
```

---

## Pipeline CI/CD

```
feature/*  ->  PR para develop  ->  GitHub Actions  ->  merge develop
                                                     |
                                              PR develop -> master
                                                     |
                                              GitHub Actions
                                              (test + build)
                                                     |
                                              merge master
                                                     |
                                           Railway auto-deploy
                                           (sistemanephs.com.br)
```

- **Test**: `pytest` com SQLite em memoria (sem dependencia de banco externo)
- **Build**: `docker build` validando a imagem sem push
- **Deploy**: Railway detecta push no `master` automaticamente

---

## Como Rodar Localmente

### Pre-requisitos

- Python 3.11+
- PostgreSQL 14+ (ou usar o banco Railway em dev)
- Railway CLI (para prod)

### Opcao 1: Docker Compose

```bash
git clone https://github.com/eduardonunesfvm/auditorio-sistema.git
cd auditorio-sistema

cp projeto-auditorio/.env.example projeto-auditorio/.env
# Edite .env com DATABASE_URL e SECRET_KEY

docker compose up -d --build
# http://localhost
```

### Opcao 2: Desenvolvimento

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

## Regras de Negocio

- Hora de inicio < hora de termino
- Sem sobreposicao de horarios no mesmo dia
- Apenas o criador (ou admin) pode editar/excluir eventos
- CI: campos de signatario obrigatorios apenas para CI normal
- CI: numeracao ciclica 1-100 compartilhada entre tipos
- Visualizador: somente leitura, sem acesso ao modulo CI

---

## Custos

| Recurso | Provedor | Plano | Custo/mes |
|---|---|---|---|
| Aplicacao + Banco | Railway | Hobby ($5 + consumo) | ~$6.57 |
| Dominio | Registro.br | sistemanephs.com.br | ~R$3.33 |
| CI/CD | GitHub Actions | Free | $0 |

**Custo anual estimado:** ~$79 (Railway) + R$40 (dominio) = **R$475/ano**

O sistema consome <1% de CPU e ~100 MB de RAM em operacao normal. A estimativa de consumo do Railway e de $1.57/mes alem do plano base de $5, totalizando ~$6.57/mes.

---

Desenvolvido por **[Eduardo Nunes](https://linkedin.com/in/eduardonunesfvm)** -- estagiario e unico desenvolvedor da Secretaria de Saude, responsavel por levantamento de requisitos, arquitetura, implementacao, deploy e manutencao.
