# Tryv — Backend (FastAPI)

Primeira etapa do projeto: autenticação de usuários (registro, login, perfil protegido por JWT).
Modelos de dados já criados para todo o escopo (nutrição, treino, professores, desafios, assinaturas),
mas ainda sem rotas — isso vem nos próximos passos.

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

3. Copiar `.env.example` para `.env` e preencher os valores (pelo menos `DATABASE_URL` e `SECRET_KEY`).

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

## O que já funciona
- `POST /auth/register` — criar conta
- `POST /auth/login` — login, retorna JWT
- `GET /users/me` — perfil do usuário logado (rota protegida)

Todos os endpoints acima já foram testados de ponta a ponta.

## Estrutura do projeto
```
app/
  core/       → configuração, conexão com banco, segurança (hash de senha, JWT)
  models/     → tabelas do banco (SQLAlchemy) — users, trainers, workout_plans,
                workout_sessions, meals, challenges, subscriptions
  routers/    → rotas da API (endpoints)
  schemas/    → validação de entrada/saída (Pydantic)
```

## Próximos passos (nessa ordem sugerida)
1. Rotas de refeições (`/meals`) + integração com Claude API para análise de foto
2. Rotas de treino (`/workout-plans`) + geração de plano via Claude API
3. Integração com smartwatch (webhooks/sync de HealthKit, Google Fit, Fitbit, Garmin)
4. Rotas de GPS/corrida
5. Cadastro de professores + verificação de CREF
6. Stripe (assinatura base) e Stripe Connect (marketplace de professores)
7. Desafios
