# Sistema de Controle do Auditório

[![CI](https://github.com/eduardonunesfvm/auditorio-sistema/actions/workflows/ci.yml/badge.svg)](https://github.com/eduardonunesfvm/auditorio-sistema/actions/workflows/ci.yml)

Aplicação full-stack para administrar a agenda de um auditório institucional, com consulta de disponibilidade, controle de acesso e proteção contra reservas simultâneas.

O projeto foi desenvolvido com foco em um problema que parece simples, mas exige consistência: impedir que duas pessoas reservem o mesmo espaço no mesmo horário, inclusive quando as solicitações chegam ao mesmo tempo. A solução combina uma interface guiada, validações na API e restrições no PostgreSQL.

![Tela principal do Sistema de Controle do Auditório](docs/interface.png)

*Capturas geradas localmente com dados fictícios de demonstração.*

## O que este projeto demonstra

- Modelagem de regras de negócio além do CRUD: expediente, intervalo de almoço, eventos adjacentes e conflitos de horário.
- Consistência sob concorrência com uma `EXCLUDE CONSTRAINT` no PostgreSQL, além da validação na camada de serviço.
- API organizada em rotas, serviços e repositórios, com autenticação JWT e autorização por perfil.
- Proteção do login com rate limiting atômico no Redis, limites por IP e por usuário e resposta `429` com `Retry-After`.
- Interface responsiva e acessível, com wizard em três etapas, navegação por teclado, tema claro/escuro e estados de erro e carregamento.
- Pipeline de CI com testes de backend, integração em PostgreSQL real, testes E2E em múltiplos navegadores e build Docker.
- Rotina automatizada de backup que valida o dump restaurando-o em um banco temporário.
- Observabilidade com OpenTelemetry, Grafana Cloud, dashboard versionado, traces e métricas técnicas e de negócio.

## Funcionalidades

- Autenticação com JWT.
- Perfis `admin`, `superintendente` e `visualizador`.
- Criação, consulta, edição e exclusão de agendamentos conforme as permissões do usuário.
- Consulta de disponibilidade antes da confirmação da reserva.
- Visualização dos horários ocupados em uma linha do tempo.
- Busca de agendamentos e destaque do próximo evento.
- Tratamento de conflitos sem descartar os dados já preenchidos pelo usuário.
- Layout adaptado para desktop, dispositivos móveis, zoom ampliado e preferência de tema do sistema.

O auditório opera no fuso `America/Campo_Grande`, das 07:00 às 11:00 e das 13:00 às 20:00. Eventos consecutivos são permitidos; sobreposições e eventos que atravessem a pausa de almoço são rejeitados.

### Reserva guiada por disponibilidade

![Wizard de agendamento com linha do tempo de disponibilidade](docs/scheduling-wizard.png)

O usuário escolhe primeiro a data; a aplicação consulta a API e apresenta, na mesma escala, períodos livres, reservas existentes e a pausa de almoço. Apenas combinações válidas de início e fim avançam para os dados do evento.

## Arquitetura

```mermaid
flowchart LR
    U[Usuário] --> N[Nginx / Frontend]
    N -->|HTTP + JWT| A[FastAPI]
    A --> S[Serviços de domínio]
    S --> P[(PostgreSQL)]
    A --> R[(Redis)]
    A -.->|OTLP/HTTP| O[Grafana Cloud]
    G[GitHub Actions] --> T[Testes e build]
    G --> B[Backup com restauração de teste]
```

O frontend usa HTML, CSS e JavaScript sem framework. O Nginx entrega os arquivos estáticos e encaminha as chamadas para a API. No backend, o FastAPI recebe a requisição, as dependências resolvem autenticação e autorização, a camada de serviço aplica as regras de negócio e os repositórios isolam o acesso ao SQLAlchemy.

As regras críticas de agendamento são verificadas novamente pelo PostgreSQL. Isso fecha a janela de corrida que existiria se a aplicação dependesse apenas de uma consulta antes da gravação.

Detalhes e decisões técnicas estão em [Arquitetura](docs/architecture.md).

## Tecnologias

| Área | Tecnologias |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy, Pydantic e Alembic |
| Dados | PostgreSQL e Redis |
| Frontend | HTML5, CSS3, JavaScript e Nginx |
| Testes | Pytest, HTTPX e Playwright |
| Infraestrutura | Docker Compose, Railway e GitHub Actions |
| Observabilidade | OpenTelemetry, Grafana Cloud, Mimir e Tempo |

## Qualidade e testes

O pipeline executa quatro etapas antes de validar uma mudança:

1. Testes da API e das regras de acesso.
2. Testes de migrations e concorrência usando PostgreSQL real.
3. Testes E2E do fluxo de agendamento no Chromium, Firefox e Edge.
4. Build da imagem Docker somente após a aprovação das etapas anteriores.

A suíte cobre, entre outros casos, sobreposições parciais e totais, duas reservas concorrentes, permissões por perfil, falha do Redis, respostas antigas de disponibilidade, navegação por teclado, responsividade e zoom de 200%.

```bash
cd projeto-auditorio
python -m pytest app/tests.py -v
```

Os testes que exercitam constraints e concorrência precisam de um PostgreSQL isolado:

```bash
cd projeto-auditorio
POSTGRES_TEST_DATABASE_URL="postgresql://usuario:senha@localhost:5432/auditorio_test" \
python -m pytest app/test_postgres_scheduling.py -v
```

```bash
cd auditorio-front
npm ci
npx playwright install chrome
npm run test:e2e
```

## Executando com Docker

Pré-requisitos:

- Docker com Docker Compose;
- uma instância PostgreSQL acessível pelos containers;
- Redis opcional em desenvolvimento e recomendado em produção.

O arquivo `.env.docker` contém o modelo mínimo. Substitua os placeholders e execute:

```bash
docker compose --env-file .env.docker up --build
```

Serviços disponíveis:

- Aplicação web: `http://localhost`
- API: `http://localhost:8000`
- Swagger UI em desenvolvimento: `http://localhost:8000/docs`
- Health check: `GET http://localhost:8000/health`

Para migrations, configuração sem Docker, backup e restauração, consulte o [guia de operação](docs/operations.md).

O fluxo `develop` → homologação e `master` → produção, incluindo isolamento de dados, portão de acesso e seed fictício, está documentado no [guia de ambientes](docs/environments.md).

## Observabilidade

Quando habilitada, a API envia métricas e traces diretamente ao Grafana Cloud por OTLP/HTTP. A integração registra latência, tráfego, erros, operações SQL e counters agregados de reservas, conflitos e proteção do login, sem enviar corpos, credenciais ou identificadores de usuários.

O dashboard pode ser importado a partir de [`docs/grafana-dashboard.json`](docs/grafana-dashboard.json). A configuração da stack, das variáveis Railway, do synthetic check e dos alertas está no [guia de observabilidade](docs/observability.md).

## API principal

| Método | Endpoint | Acesso | Responsabilidade |
|---|---|---|---|
| `POST` | `/auth/login` | Público | Autenticar usuário |
| `POST` | `/auth/cadastro` | Público | Cadastrar usuário |
| `GET` | `/agendamentos` | Autenticado | Listar agendamentos |
| `GET` | `/agendamentos/proximo` | Autenticado | Consultar o próximo evento |
| `GET` | `/agendamentos/disponibilidade` | Autenticado | Consultar jornada, bloqueios e horários ocupados |
| `POST` | `/agendamentos/criar_agendamento` | Editor | Criar agendamento |
| `PUT` | `/agendamentos/{id}` | Autor do evento | Atualizar agendamento |
| `DELETE` | `/agendamentos/{id}` | Autor do evento | Excluir agendamento |

Conflitos retornam HTTP `409` com o código `schedule_conflict`. Horários fora do expediente retornam HTTP `400` com o código `invalid_schedule_window`.

## Estrutura do repositório

```text
.
├── auditorio-front/          # Interface, Nginx e testes Playwright
├── projeto-auditorio/
│   ├── alembic/              # Migrations versionadas
│   └── app/
│       ├── routers/          # Endpoints HTTP
│       ├── repository.py     # Persistência
│       ├── service.py        # Regras de negócio
│       └── tests*.py         # Testes da API e do PostgreSQL
├── docs/                     # Arquitetura, operação e imagens
├── scripts/                  # Backup local do PostgreSQL
├── .github/workflows/        # CI e backup automatizado
└── docker-compose.yml
```

## Próximas evoluções

- Restringir o provisionamento de contas a um fluxo administrativo.
- Correlacionar os logs do Railway aos traces sem enviar informações sensíveis.
- Publicar uma demonstração com dados fictícios e credenciais temporárias.
- Expandir a trilha de auditoria das alterações em agendamentos.

## Documentação

- [Arquitetura e decisões técnicas](docs/architecture.md)
- [Execução, migrations, segurança e backup](docs/operations.md)
- [Grafana Cloud, dashboard e alertas](docs/observability.md)
- [Guia do Alembic](projeto-auditorio/ALEMBIC_GUIDE.md)

---

Projeto disponível em [github.com/eduardonunesfvm/auditorio-sistema](https://github.com/eduardonunesfvm/auditorio-sistema).
