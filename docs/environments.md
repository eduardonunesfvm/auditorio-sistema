# Ambientes e promocao

## Topologia

| Ambiente | Branch | Dados | Acesso |
|---|---|---|---|
| Local | branch de trabalho | PostgreSQL/SQLite local | máquina do desenvolvedor |
| Homologação (`staging`) | `develop` | PostgreSQL e Redis exclusivos | URL Railway + portão por senha |
| Produção (`production`) | `master` | PostgreSQL e Redis exclusivos | domínio oficial |

Homologação é um ambiente persistente de baixo volume. Ela nunca reutiliza `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY` ou credenciais de produção. Ambientes temporários por pull request não fazem parte desta etapa.

## Fluxo de entrega

1. Abra um PR de `feature/**`, `fix/**` ou `hotfix/**` para `develop`.
2. O merge em `develop` só ocorre com o CI aprovado e dispara o deploy de homologação.
3. Execute o smoke test na URL de staging.
4. Promova a versão por um PR de `develop` para `master`.
5. O merge em `master` dispara produção somente após o CI aprovado.

No Railway, ambos os serviços devem usar **Wait for CI** e o health check `/health`. Uma falha de inicialização, migration ou conexão com PostgreSQL impede o deployment de ficar saudável.

## Variáveis exclusivas de homologação

```dotenv
ENV=staging
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
SECRET_KEY=<segredo aleatório selado com pelo menos 32 bytes>
STAGING_GATE_ENABLED=true
STAGING_GATE_PASSWORD_HASH=<hash bcrypt selado>
STAGING_GATE_SECRET=<segredo aleatório selado com pelo menos 32 bytes>
STAGING_SEED_ADMIN_PASSWORD=<senha fictícia selada>
STAGING_SEED_VIEWER_PASSWORD=<senha fictícia selada>
OTEL_RESOURCE_ATTRIBUTES=service.namespace=auditorio,deployment.environment.name=staging
```

Credenciais devem ser geradas fora do repositório e armazenadas como variáveis seladas. O portão de staging não deve ser habilitado em produção.

## Dados fictícios

Após o primeiro deploy e as migrations, execute no serviço da aplicação:

```bash
python scripts/seed_staging.py
```

Opcionalmente, fixe a data representativa:

```bash
python scripts/seed_staging.py --date 2027-05-10
```

O script exige `ENV=staging` e `RAILWAY_ENVIRONMENT_NAME=staging`. Ele atualiza as contas `hml_admin` e `hml_visualizador` e faz upsert de eventos prefixados com `[HML]`; não importa nem anonimiza dados reais.

## Smoke test

- `/health` responde `200` sem passar pelo portão.
- A raiz redireciona para `/staging-access` sem cookie.
- A senha adicional libera o formulário de login.
- As contas fictícias conseguem autenticar conforme seus perfis.
- Consulta, criação, edição e exclusão funcionam.
- O card de status transiciona sem reload.
- Métricas e traces aparecem com `deployment.environment.name=staging`.

## Rollback e custos

- Um deployment com falha deve ser revertido pelo histórico do serviço Railway; não promova o commit para `master`.
- Se uma migration de staging falhar, descarte/recrie apenas o PostgreSQL de staging e rode novamente migrations e seed.
- O backup agendado continua apontando somente para produção; staging é reconstruível.
- Staging mantém uma réplica mínima de aplicação, PostgreSQL e Redis. Revise mensalmente uso e custo no Railway.

## Rotação de credenciais

Antes de qualquer rotação de produção, execute o backup manual e confirme a restauração do artefato. Troque uma credencial por vez, valide `/health`, login e uma operação de leitura, e somente então revogue o valor anterior. Nunca registre valores em commits, issues, logs ou documentação.
