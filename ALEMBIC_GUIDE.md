# 🚀 Guia de Uso do Alembic

Este projeto usa **Alembic** para versionamento e gerenciamento de migrações do banco de dados.

## 📋 Pré-requisitos

1. **PostgreSQL rodando** na sua máquina
   - Host: `localhost`
   - Porta: `5432`
   - Usuário: `postgres`
   - Senha: `2212`

2. **Banco de dados criado** no PostgreSQL
   ```sql
   CREATE DATABASE auditorio_db;
   ```

3. **Dependências instaladas**
   ```bash
   pip install -r requirements.txt
   ```

## 🔧 Configuração

- **Arquivo de configuração**: `alembic.ini`
- **Diretório de migrações**: `alembic/versions/`
- **Arquivo de ambiente**: `alembic/env.py`
- **Primeira migração**: `alembic/versions/2760e435dafc_initial_migration_create_usuarios_and_.py`

A URL do banco está configurada em `alembic.ini`:
```
sqlalchemy.url = postgresql://postgres:2212@localhost:5432/auditorio_db
```

## 📝 Comandos Principais

### Aplicar migrações (criar tabelas)
```bash
alembic upgrade head
```
Isso executa todas as migrações não aplicadas ainda.

### Reverter uma migração
```bash
alembic downgrade -1
```
Desfaz a última migração aplicada.

### Ver histórico de migrações
```bash
alembic current
alembic history
```

### Criar uma nova migração (automática)
```bash
alembic revision --autogenerate -m "Descrição da alteração"
```

### Criar uma migração vazia (manual)
```bash
alembic revision -m "Descrição da alteração"
```

## 🎯 Próximos Passos

1. **Crie o banco de dados** no PostgreSQL:
   ```sql
   CREATE DATABASE auditorio_db;
   ```

2. **Aplique a primeira migração**:
   ```bash
   alembic upgrade head
   ```

3. **Verifique se as tabelas foram criadas**:
   ```sql
   \dt  -- no psql
   ```

## 📚 Estrutura de um arquivo de migração

```python
def upgrade() -> None:
    """Alterações a serem aplicadas."""
    op.create_table(...)  # ou outras operações DDL

def downgrade() -> None:
    """Revert das alterações."""
    op.drop_table(...)  # reverter o que foi feito em upgrade()
```

## ⚠️ Boas Práticas

- ✅ Sempre crie uma migração quando alterar os modelos
- ✅ Use nomes descritivos para as migrações
- ✅ Teste as migrações em desenvolvimento antes de usar em produção
- ✅ Commit do `alembic/versions/` no git juntamente com o código

## 🐛 Troubleshooting

**Erro: "database auditorio_db does not exist"**
- Crie o banco de dados no PostgreSQL: `CREATE DATABASE auditorio_db;`

**Erro de conexão com PostgreSQL**
- Verifique se o PostgreSQL está rodando
- Valide usuário, senha e porta em `alembic.ini`

**Erro: "ModuleNotFoundError: No module named 'app'"**
- Execute o alembic do diretório raiz do projeto
- Ou adicione o diretório ao PYTHONPATH: `export PYTHONPATH=.`
