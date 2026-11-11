# Tryv — Backend (FastAPI)

API REST do Tryv Fit (FastAPI + SQLAlchemy + Alembic + PostgreSQL). A visão geral do produto, a lista de
funcionalidades e as variáveis de ambiente estão no `README.md` da raiz; a lista completa de rotas fica no Swagger
(`/docs`).

## Rodando localmente

1. Criar ambiente virtual e instalar dependências:
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

2. Ter um PostgreSQL rodando (local ou Docker). Exemplo com Docker:
```bash
docker run --name fitness-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fitness_app -p 5432:5432 -d postgres:16
```

3. Copiar `.env.example` para `.env` e preencher os valores (pelo menos `DATABASE_URL` e `SECRET_KEY`; todas as variáveis têm valor padrão no código, mas cada integração só funciona com a sua chave).

4. Rodar a API:
```bash
uvicorn app.main:app --reload
```

5. Acessar a documentação automática (Swagger) em: `http://localhost:8000/docs`

## Migrations (Alembic)

O schema do banco é versionado via [Alembic](https://alembic.sqlalchemy.org/). A partir de agora, **toda mudança de schema (nova tabela, nova coluna, alteração de tipo, etc.) deve passar por uma migration — nunca mais por `ALTER TABLE`/`CREATE TABLE` manual direto no banco.** `Base.metadata.create_all()` (em `app/main.py`) continua rodando no startup só por conveniência em ambiente local novo, mas o controle de verdade do schema é o Alembic.

Comandos do dia a dia (sempre rodando dentro de `backend/`, com o venv ativado):

```bash
# 1. Depois de mudar um model em app/models/*.py, gerar a migration:
alembic revision --autogenerate -m "descricao curta da mudanca"

# 2. SEMPRE revisar o arquivo gerado em alembic/versions/ antes de aplicar —
#    autogenerate erra silenciosamente em alguns casos (ex: renomear coluna
#    vira "drop + add", alteracoes de enum/check constraint nem sempre sao
#    detectadas corretamente).

# 3. Aplicar a migration (local e em qualquer outro ambiente):
alembic upgrade head

# Desfazer a ultima migration aplicada, se precisar:
alembic downgrade -1

# Ver a revisao atual do banco conectado:
alembic current
```

`alembic/env.py` já esta configurado pra puxar a `DATABASE_URL` de `app/core/config.py` (mesma configuração usada pelo resto do app, lida do `.env`) e o `target_metadata` de `app.models` (todos os models já importados ali) — não precisa editar `alembic.ini` nem `env.py` para rodar os comandos acima em outro ambiente, só apontar o `.env` daquele ambiente pro banco certo.

## Testes

Os testes ficam em `tests/` (`unittest`) e rodam **só** contra um PostgreSQL descartável: exigem a variável `TRYV_TEST_DATABASE_URL` apontando para `localhost` e para um banco cujo nome comece com `tryv_test` (sem ela, os testes são pulados; nunca usam o banco do `.env`). O banco é criado do zero por `alembic upgrade head`. Nenhuma chamada de rede: o RevenueCat e o S3 são simulados.

```bash
# a partir de backend/, com um Postgres descartável rodando (ex.: Docker, porta 5433)
TRYV_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/tryv_test_xxx python -I -m unittest discover -s tests
```

## Assinatura Tryv Pro

A assinatura é comprada **dentro do app** (Apple IAP via RevenueCat). O backend nunca recebe recibo nem "sou Pro" do app:

- `POST /webhooks/revenuecat` recebe os eventos do RevenueCat e grava a assinatura. Autenticado pelo segredo `REVENUECAT_WEBHOOK_AUTH`, aceito no cabeçalho `Authorization` como o valor puro ou como `Bearer <valor>`; sem a variável, responde 503. `REVENUECAT_PRO_ENTITLEMENT` é o nome do entitlement que vale como Pro.
- `POST /subscriptions/iap/sync` só lê o que o webhook já gravou (o app chama depois de uma compra ou de "Restaurar compras").
- O acesso Pro é decidido pelo servidor, em `app/core/deps.py` (`has_active_pro_subscription`), pelo status da assinatura e pela data de expiração (`expires_at`); uma assinatura em cobrança atrasada (`past_due`) só conta dentro da carência com `expires_at` no futuro. Linhas antigas com `provider='stripe'` e `expires_at` nulo continuam valendo pelo status.
- Ao excluir uma conta, o backend pede ao RevenueCat a exclusão do assinante, em melhor esforço, só se `REVENUECAT_API_SECRET` estiver preenchida; uma falha nunca impede a exclusão.

## Estrutura do projeto
```
app/
  core/       → configuração, conexão com banco, segurança (hash de senha, JWT), regras compartilhadas
  models/     → tabelas do banco (SQLAlchemy)
  routers/    → rotas da API (endpoints), um arquivo por domínio
  schemas/    → validação de entrada/saída (Pydantic)
  services/   → regras de negócio e integrações (IA, RevenueCat, S3, e-mail, XP)
alembic/      → migrations
tests/        → testes (unittest, contra um Postgres descartável)
scripts/      → scripts de apoio (comparação de modelos de IA)
```

Nota técnica: algumas tabelas e colunas de um modo de profissionais que saiu do produto (por exemplo `trainers`, `diet_plans`, `live_activities`, `subscriptions.trainer_id` e as colunas `stripe_*`) continuam nos modelos e nas migrations apenas pelo histórico do banco; não há rotas para elas. Só uma migration própria pode removê-las.
