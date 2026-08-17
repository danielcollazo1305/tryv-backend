"""
Seed de dados de demonstracao — cria registros REAIS via a API publica de
producao (https://tryv-backend-production.up.railway.app), usando os mesmos
endpoints que qualquer cliente real usa. Nao mexe em nenhuma logica de
tela/API, nao escreve direto no banco (sem acesso a producao disponivel
neste ambiente) — so orquestra chamadas HTTP contra endpoints ja existentes.

Idempotente na medida do possivel: contas que ja existem (register -> 400)
sao apenas logadas em vez de recriadas.

Uso:
    TEST_ACCOUNT_EMAIL=... TEST_ACCOUNT_PASSWORD=... venv/Scripts/python scripts/seed_demo_data.py

Escopo desta 2a rodada (bug de producao — schema drift na tabela trainers —
corrigido; ver relatorio da tarefa):
- Item 1: registra os 5 profissionais. cref_verified continua False (sem
  conta admin pra chamar PATCH /trainers/{id}/verify) -- eles nao aparecem
  na vitrine publica (GET /trainers/) nem em GET /trainers/{id} ate serem
  verificados manualmente. Documentado, nao e um erro deste script.
- Item 2 e Item 5: ja rodaram com sucesso na 1a execucao (confirmado via
  GET /meals/, GET /feed) -- RUN_MEALS_AND_POSTS fica False pra nao
  duplicar esses registros.
- Item 3: continua pulado a pedido do usuario.
- Item 4: cria os 2 desafios (Rafael Silva, Carlos Silva). Como nenhum dos
  dois esta cref_verified, POST /challenges deve retornar 403 -- roda mesmo
  assim pra confirmar o erro exato e documentar, sem tentar contornar a
  checagem de verificacao.
"""

import os
import sys
from datetime import datetime, timedelta, timezone

import requests

BASE_URL = "https://tryv-backend-production.up.railway.app"

DEMO_PASSWORD = "TryvDemo2026!"  # senha das contas de demonstracao (nao a da conta de teste)


def register_and_login(name: str, email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/auth/register", json={"name": name, "email": email, "password": password})
    if r.status_code == 201:
        print(f"  [criada] {email}")
    elif r.status_code == 400:
        print(f"  [ja existia] {email}")
    else:
        r.raise_for_status()

    r2 = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    r2.raise_for_status()
    return r2.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def register_trainer(token: str, professional_type: str, license_number: str, bio: str, price: float) -> dict:
    r = requests.post(
        f"{BASE_URL}/trainers/register",
        headers=auth(token),
        json={
            "professional_type": professional_type,
            "license_number": license_number,
            "bio": bio,
            "price": price,
        },
    )
    if r.status_code == 400:
        print(f"  [ja cadastrado como profissional] buscando perfil existente via /trainers/me")
        r_me = requests.get(f"{BASE_URL}/trainers/me", headers=auth(token))
        r_me.raise_for_status()
        return r_me.json()
    r.raise_for_status()
    return r.json()


def create_meal(token: str, description: str, calories: float, protein: float, carbs: float, fat: float) -> dict:
    r = requests.post(
        f"{BASE_URL}/meals/",
        headers=auth(token),
        json={
            "description": description,
            "calories": calories,
            "protein": protein,
            "carbs": carbs,
            "fat": fat,
        },
    )
    r.raise_for_status()
    return r.json()


def create_post(token: str, caption: str, media_url: str) -> dict:
    r = requests.post(
        f"{BASE_URL}/posts",
        headers=auth(token),
        json={"type": "photo", "caption": caption, "media_url": media_url, "visibility": "public"},
    )
    r.raise_for_status()
    return r.json()


def create_challenge(token: str, title: str, description: str, start_date: datetime, end_date: datetime):
    r = requests.post(
        f"{BASE_URL}/challenges",
        headers=auth(token),
        json={
            "title": title,
            "description": description,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
        },
    )
    return r  # sem raise_for_status aqui -- item 4 espera 403 se o trainer nao estiver verificado


def main():
    test_email = os.environ.get("TEST_ACCOUNT_EMAIL")
    test_password = os.environ.get("TEST_ACCOUNT_PASSWORD")
    if not test_email or not test_password:
        print("Defina TEST_ACCOUNT_EMAIL e TEST_ACCOUNT_PASSWORD no ambiente antes de rodar.")
        sys.exit(1)

    results = {}

    # ---------- Item 1: 5 profissionais ----------
    # Bug de producao (schema drift) corrigido -- migration do rename
    # cref_number->license_number e criacao de diet_plans ja aplicadas.
    SKIP_TRAINERS = False
    print("\n== Item 1: profissionais ==")
    trainers_spec = [] if SKIP_TRAINERS else [
        {
            "key": "rafael",
            "name": "Rafael Silva",
            "email": "mizaninvestapp+rafaelsilva@gmail.com",
            "professional_type": "personal_trainer",
            "license_number": "012345-G/SP",
            "price": 149.90,
            "bio": (
                "Especialista em hipertrofia e condicionamento fisico de alta intensidade. "
                "Com mais de 8 anos de experiencia ajudando atletas e iniciantes a alcancarem seus limites. "
                "Meu metodo e focado em resultados reais, progressao continua e tecnica impecavel. "
                "Vamos juntos transformar sua performance."
            ),
        },
        {
            "key": "carlos",
            "name": "Carlos Silva",
            "email": "mizaninvestapp+carlossilva@gmail.com",
            "professional_type": "personal_trainer",
            "license_number": "123456-G/SP",
            "price": 250.00,
            # Texto completo ja confirmado em marketplace-listagem.html (nao extrapolado).
            "bio": "Especialista em hipertrofia e emagrecimento avancado. Acompanhamento diario e planilhas adaptativas para alta performance.",
        },
        {
            "key": "marina",
            "name": "Marina Costa",
            "email": "mizaninvestapp+marinacosta@gmail.com",
            "professional_type": "personal_trainer",
            "license_number": "654321-G/RJ",
            "price": 180.50,
            # Texto completo ja confirmado em marketplace-listagem.html (nao extrapolado).
            "bio": "Treino funcional e mobilidade para atletas de elite. Recupere-se mais rapido e treine com mais inteligencia e seguranca.",
        },
        {
            "key": "roberto",
            "name": "Roberto Alves",
            "email": "mizaninvestapp+robertoalves@gmail.com",
            "professional_type": "personal_trainer",
            # CREF do mockup marketplace-listagem.html e 987123-G/MG (o prompt
            # pedia 987654-G/MG) -- usando o valor do mockup, ja verificado
            # nesta sessao. Documentado no relatorio final pra confirmacao.
            "license_number": "987123-G/MG",
            "price": 300.00,
            "bio": "Foco total em powerlifting e forca bruta. Preparacao para competicoes com periodizacao milimetrica baseada em dados.",
        },
        {
            "key": "ricardo",
            "name": "Ricardo Fernandes",
            "email": "mizaninvestapp+ricardofernandes@gmail.com",
            "professional_type": "nutritionist",
            "license_number": "012345-G/SP",
            "price": 129.90,
            "bio": "Nutricionista esportivo com foco em performance e recomposicao corporal. Planos alimentares individualizados para atletas e praticantes de atividade fisica.",
        },
    ]

    for spec in trainers_spec:
        print(f"- {spec['name']} ({spec['professional_type']})")
        token = register_and_login(spec["name"], spec["email"], DEMO_PASSWORD)
        trainer = register_trainer(
            token, spec["professional_type"], spec["license_number"], spec["bio"], spec["price"]
        )
        results[spec["key"]] = {"token": token, "trainer": trainer}
        print(f"  trainer_id={trainer['id']} cref_verified={trainer['cref_verified']}")

    # ---------- Item 2 e Item 5: ja confirmados na 1a execucao (GET /meals/, GET /feed) ----------
    RUN_MEALS_AND_POSTS = False
    if RUN_MEALS_AND_POSTS:
        print("\n== Item 2: meta calorica + refeicoes (conta de teste) ==")
        test_token = register_and_login("Conta de Teste", test_email, test_password)

        r = requests.patch(f"{BASE_URL}/users/me", headers=auth(test_token), json={"daily_calorie_goal": 1850})
        r.raise_for_status()
        print(f"  daily_calorie_goal setado para 1850")

        meals_spec = [
            {"description": "Cafe da Manha", "calories": 450, "protein": 28, "carbs": 52, "fat": 14},
            {"description": "Almoco", "calories": 500, "protein": 45, "carbs": 48, "fat": 16},
            {"description": "Lanche", "calories": 220, "protein": 15, "carbs": 25, "fat": 6},
        ]
        for m in meals_spec:
            meal = create_meal(test_token, m["description"], m["calories"], m["protein"], m["carbs"], m["fat"])
            print(f"  refeicao criada: {m['description']} ({m['calories']} kcal) logged_at={meal['logged_at']}")

        print("\n== Item 5: posts de exemplo ==")
        posters_spec = [
            {
                "name": "Lucas S.",
                "email": "mizaninvestapp+lucass@gmail.com",
                "caption": "Treino de perna pago!",
                "media_url": "https://picsum.photos/seed/tryv-lucas-treino/800/800",
            },
            {
                "name": "Mariana R.",
                "email": "mizaninvestapp+marianar@gmail.com",
                "caption": "Almoco focado na meta de hoje",
                "media_url": "https://picsum.photos/seed/tryv-mariana-almoco/800/800",
            },
        ]
        for spec in posters_spec:
            token = register_and_login(spec["name"], spec["email"], DEMO_PASSWORD)
            post = create_post(token, spec["caption"], spec["media_url"])
            print(f"  post criado por {spec['name']}: post_id={post['id']}")

    # ---------- Item 4: 2 desafios ----------
    print("\n== Item 4: desafios ==")
    if SKIP_TRAINERS:
        print("  pulado -- profissionais nao foram (re)carregados nesta execucao")
    else:
        now = datetime.now(timezone.utc)
        challenges_spec = [
            {
                "creator_key": "rafael",
                "title": "Maratona de 30 dias",
                # Sem campo de categoria/tag no schema (ChallengeCreate so tem
                # title/description/start_date/end_date) -- usando o campo
                # description real pra registrar o foco, em vez de inventar
                # um campo de categoria que nao existe.
                "description": "Desafio de resistencia: 30 dias de consistencia, um passo de cada vez.",
                # "15 dias restantes" a partir de hoje, dentro de um ciclo de 30 dias
                # (comecou ha 15 dias) -- refletido em start/end_date.
                "start_date": now - timedelta(days=15),
                "end_date": now + timedelta(days=15),
            },
            {
                "creator_key": "carlos",
                "title": "Seca Verao",
                "description": "Desafio de hipertrofia: foco em ganho de massa e definicao.",
                # Sem duracao total especificada na fonte original -- so "5 dias
                # restantes" -- start_date e um placeholder razoavel (comecou
                # ha poucos dias), documentado aqui em vez de inventar um total.
                "start_date": now - timedelta(days=2),
                "end_date": now + timedelta(days=5),
            },
        ]
        for spec in challenges_spec:
            creator = results.get(spec["creator_key"])
            if not creator:
                print(f"  [pulado] {spec['title']}: profissional '{spec['creator_key']}' nao foi registrado")
                continue
            r = create_challenge(
                creator["token"], spec["title"], spec["description"], spec["start_date"], spec["end_date"]
            )
            if r.status_code == 201:
                challenge = r.json()
                print(f"  criado: {spec['title']} (challenge_id={challenge['id']})")
            else:
                print(f"  [FALHOU {r.status_code}] {spec['title']}: {r.text[:300]}")

    print("\nConcluido.")


if __name__ == "__main__":
    main()
