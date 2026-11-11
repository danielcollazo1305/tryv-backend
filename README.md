<p align="center">
  <img src="assets/icon.png" alt="Logo do Tryv" width="140" />
</p>

# Tryv Fit

Aplicativo de fitness que reúne **treino, nutrição e saúde em um só lugar**: registra refeições por foto com IA, gera planos de treino, rastreia corridas e pedaladas por GPS e transforma a rotina em ranking, desafios e squads.

> Projeto pessoal full stack (app mobile + API + landing page), em fase de **pré-lançamento**. A seção [Status do projeto](#status-do-projeto) descreve com franqueza o que está pronto e o que não está.

---

## Funcionalidades

Tudo o que está listado existe no código. O que é restrito a assinantes está marcado com **(Pro)**.

**Conta e perfil**
- Cadastro com onboarding (objetivo, medidas, frequência de treino, meta de calorias), login com JWT e recuperação de senha por e-mail.
- Avatar estilizado gerado por IA a partir de uma foto, com limite de gerações por período.

**Nutrição**
- Registro de refeições com **análise de foto e de texto por IA (Pro)**, além do registro manual.
- Busca de alimentos na **tabela TACO** (597 alimentos) e refeições salvas.
- Metas diárias de calorias e proteína, resumo de macros, controle de água e de creatina.

**Treino e atividades**
- **Plano de treino semanal gerado por IA (Pro)**, treino livre (séries, peso e repetições) .
- **Rastreamento por GPS** de corrida, pedalada e caminhada, com mapa e parciais por km, e **recordes pessoais (Pro)**; registro manual de natação, luta (com estilo), HIIT e outras.
- Tela **Treinar** com o menu de modalidades (musculação, corrida/caminhada, luta e bike) e estatísticas por modalidade.
- Importação de treinos pelo **Health Connect (Android)**. O Apple Health (iPhone) está **em breve**.
- Live Activity no iOS para o treino livre em andamento (extensão de widget nativa).

**Painel e saúde**
- Progresso semanal e mensal, mapa de frequência de treinos, sequências, pontuação geral ("Overall") e Vitalidade (indicador de prontidão na aba Treino).
- **(Pro)**: resumo do período e comparativos (mês a mês e entre períodos) na tela inicial, card de prontidão da tela inicial, insight diário por IA, relatório de frequência cardíaca e exportação de relatório em PDF.

**Equipamentos**
- Cadastro de tênis (com busca em catálogo), bike, relógio e fita cardíaca; barra de vida útil do tênis, barra de manutenção da bike, equipamento padrão e aposentadoria de itens.

**Comunidade e gamificação**
- XP e níveis, **squads**, ranking individual e de squads, **mapa de território** por cidade e desafios oficiais do Tryv Fit (por categoria) com check-in.
- Feed social com posts, curtidas, comentários e seguidores.

**Assinatura**
- Assinatura **Tryv Pro** comprada dentro do app (Apple IAP via RevenueCat). O servidor decide o acesso Pro pelo status e pela data de expiração da assinatura, registrados pelo webhook do RevenueCat; o app nunca afirma que o usuário é Pro. *(Implementada no código, mas ainda não compilada nem testada em iPhone com um produto real da App Store.)*

**Landing page**
- Página estática com lista de espera, política de privacidade e termos de uso.

---

## Tecnologias

| Camada | Ferramenta |
|---|---|
| Mobile | React Native 0.81 + Expo SDK 54, TypeScript, Expo Router, Axios, react-native-maps, react-native-svg, Health Connect |
| Backend | Python 3.14, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, JWT (python-jose) + bcrypt |
| Banco de dados | PostgreSQL (psycopg2) |
| Armazenamento | Amazon S3 (upload de imagens, via boto3) |
| Pagamentos | Apple IAP via RevenueCat (compra no app e webhook; o servidor decide o acesso pela data de expiração) |
| IA | Anthropic Claude (análise de refeições e geração de treino) e OpenAI (insights e avatar) |
| E-mail | Resend |
| Deploy | Railway (API; migrations rodam a cada deploy), EAS Build (app) e Vercel (landing page) |

---

## Estrutura do projeto

```
tryv/
├── backend/                 API REST em FastAPI
│   ├── app/
│   │   ├── core/            configuração, banco, segurança, fuso horário, regras compartilhadas
│   │   ├── models/          tabelas (SQLAlchemy)
│   │   ├── routers/         endpoints, um arquivo por domínio
│   │   ├── schemas/         validação de entrada e saída (Pydantic)
│   │   ├── services/        regras de negócio e integrações (IA, RevenueCat, S3, e-mail, XP)
│   │   └── data/            dados estáticos (tabela TACO, coordenadas de municípios)
│   ├── alembic/             migrations do banco
│   ├── tests/               testes do backend (unittest, contra um Postgres descartável)
│   ├── scripts/             scripts de apoio (comparação de modelos de IA)
│   ├── Procfile             comandos de release e de execução no Railway
│   └── requirements.txt
├── mobile/                  app Expo / React Native
│   ├── app/                 telas e rotas (Expo Router)
│   ├── components/          componentes de interface
│   ├── services/            clientes da API e integrações de saúde
│   ├── context/             estado global (autenticação, treino em andamento)
│   ├── constants/ utils/    tema, tipografia e funções auxiliares
│   ├── plugins/             plugins de configuração do Expo
│   └── TryvFitWidgets/      extensão de widget / Live Activity do iOS (Swift)
├── landing/                 landing page estática (HTML, CSS e JS)
├── assets/                  logo do projeto
├── PRIVACY_POLICY.md        política de privacidade (rascunho)
└── TERMS_OF_USE.md          termos de uso (rascunho)
```

---

## Como rodar o backend

Requisitos: Python 3.14 (o mesmo do deploy, ver `backend/runtime.txt`) e um PostgreSQL acessível (local ou em Docker).

```bash
cd backend

# 1. ambiente virtual e dependências
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 2. variáveis de ambiente
cp .env.example .env              # Windows: copy .env.example .env
# edite o .env com os seus valores (veja a lista abaixo)

# 3. criar/atualizar o schema do banco
alembic upgrade head

# 4. subir a API
uvicorn app.main:app --reload
```

A documentação interativa (Swagger) fica em `http://localhost:8000/docs`.

**Variáveis de ambiente** (`backend/.env`; o modelo está em `backend/.env.example`; só os nomes, os valores são seus):

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | conexão com o PostgreSQL |
| `SECRET_KEY` | assinatura dos tokens JWT |
| `ANTHROPIC_API_KEY` | análise de refeições e geração de treino |
| `OPENAI_API_KEY` | insights e avatar por IA |
| `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_PRO_ENTITLEMENT`, `REVENUECAT_API_SECRET` | RevenueCat: segredo compartilhado do webhook, nome do entitlement Pro e chave secreta da API REST (usada só para pedir a exclusão do assinante ao excluir uma conta; vazia = etapa pulada) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_S3_REGION` | upload de imagens no S3 |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | e-mail de recuperação de senha |

Todas as variáveis têm valor padrão no código. Além das acima, o código lê (opcionais): `APP_NAME`, `APP_TIMEZONE`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `LOGIN_MAX_FAILED_ATTEMPTS`, `LOGIN_WINDOW_MINUTES`, `LOGIN_MAX_FAILED_ATTEMPTS_PER_IP`, `IMAGE_MODERATION_MODEL`, `IMAGE_MODERATION_SIMULATED`, `IMAGE_MODERATION_DAILY_CAP`, `IMAGE_MODERATION_ALERT_RATIO`, `POST_MEDIA_REQUIRES_APPROVAL`, `EXPLORE_FEED_ENABLED`, `AVATAR_IMAGE_MODEL`, `AVATAR_GENERATION_LIMIT`, `AVATAR_LIMIT_WINDOW_DAYS`, `AVATAR_DAILY_ATTEMPT_LIMIT`, `PRIVATE_IMAGE_URL_EXPIRES_SECONDS`, `DEFAULT_SHOE_LIFESPAN_KM` e `DEFAULT_BIKE_MAINTENANCE_KM`.

Cada integração (IA, RevenueCat, S3, e-mail) só funciona com a sua respectiva chave.

---

## Como rodar o app mobile

```bash
cd mobile
npm install

# aponte o app para a sua API (use o IP da máquina na rede Wi-Fi, não "localhost")
cp .env.example .env.local        # Windows: copy .env.example .env.local
# edite .env.local e defina EXPO_PUBLIC_API_URL e, para a assinatura, EXPO_PUBLIC_REVENUECAT_IOS_KEY (chave pública do SDK; sem ela a tela de assinatura mostra "indisponível")

npx expo start
```

Depois é só abrir pelo Expo Go (a maior parte do app roda assim) ou por um emulador. Recursos nativos, como o Health Connect, a extensão de widget do iOS e a compra no app (RevenueCat), exigem um *development build* (`eas build --profile development`), pois não funcionam no Expo Go.

---

## Capturas de tela

<!--
  Adicione aqui as capturas de tela do app. Sugestão: salvar as imagens em uma pasta
  (por exemplo, assets/screenshots/) e referenciá-las assim:

  <p align="center">
    <img src="assets/screenshots/home.png" width="240" />
    <img src="assets/screenshots/treino.png" width="240" />
    <img src="assets/screenshots/ranking.png" width="240" />
  </p>
-->

_Em breve._

---

## Status do projeto

Projeto em desenvolvimento ativo, em fase de pré-lançamento.

**Funcionando (implementado no código):**
- API com mais de 130 endpoints e 42 migrations, em produção no Railway.
- Autenticação, nutrição, treinos, atividades por GPS, painel, equipamentos, XP, squads, ranking, desafios, feed social e assinatura Pro por compra no app (Apple IAP via RevenueCat; implementada, ainda não testada em iPhone).
- Integração com IA (Claude e OpenAI) e armazenamento de imagens no S3.

**Em desenvolvimento ou com limitações:**
- **Apple Health (iPhone): em breve.** A integração foi reimplementada com `@appeeky/expo-healthkit` (versão fixa 0.4.1, Expo Modules, sem Nitro, somente leitura) e já está commitada, mas **ainda não foi compilada nem testada em iPhone**; segue como "em breve" até o primeiro build validado. O **Health Connect (Android) já está disponível**.
- **Catálogo de tênis**: a tabela e a busca existem, mas ainda sem dados carregados; por enquanto o cadastro usa o modelo digitado à mão.
- **Testes automatizados**: o backend tem 65 testes (`backend/tests`: assinatura e webhook do RevenueCat, exclusão de conta, selos e desafios oficiais), que só rodam contra um Postgres descartável em localhost (variável `TRYV_TEST_DATABASE_URL`, ver `backend/README.md`). O app mobile não tem testes (só a checagem de tipos com `tsc`) e não há integração contínua.
- **Documentos legais**: a política de privacidade e os termos de uso são rascunhos, com campos a preencher e sem revisão jurídica.

---

## Autor

**Daniel Collazo**: [github.com/danielcollazo1305](https://github.com/danielcollazo1305)
