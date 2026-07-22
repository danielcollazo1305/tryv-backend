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
