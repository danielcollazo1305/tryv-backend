"""
Verifica os 5 profissionais criados por seed_demo_data.py (PATCH
/trainers/{id}/verify, agora possivel porque a conta de teste recebeu
is_admin=true direto no Data tab do Railway) e retoma o item 4 (criacao dos
2 desafios, que antes falhava com 403 por falta de verificacao).

Nao reimplementa nenhuma logica de API -- so chama os endpoints reais ja
existentes, na mesma API de producao usada por seed_demo_data.py.

Uso:
    TEST_ACCOUNT_EMAIL=... TEST_ACCOUNT_PASSWORD=... venv/Scripts/python scripts/verify_trainers_and_challenges.py
"""

import os
import sys
from datetime import datetime, timedelta, timezone

import requests

BASE_URL = "https://tryv-backend-production.up.railway.app"
DEMO_PASSWORD = "TryvDemo2026!"

# trainer_id's confirmados na ultima rodada de seed_demo_data.py
TRAINERS = [
    {"key": "rafael", "name": "Rafael Silva", "email": "mizaninvestapp+rafaelsilva@gmail.com", "trainer_id": "c190d6bf-7347-461b-beee-b1c3b9b307e0"},
    {"key": "carlos", "name": "Carlos Silva", "email": "mizaninvestapp+carlossilva@gmail.com", "trainer_id": "a4bea81d-31cb-47c8-8730-17649876c815"},
    {"key": "marina", "name": "Marina Costa", "email": "mizaninvestapp+marinacosta@gmail.com", "trainer_id": "80f04249-205c-4883-9541-b358a4d44d0a"},
    {"key": "roberto", "name": "Roberto Alves", "email": "mizaninvestapp+robertoalves@gmail.com", "trainer_id": "422fa5f3-7631-4243-94be-1004a17e111c"},
    {"key": "ricardo", "name": "Ricardo Fernandes", "email": "mizaninvestapp+ricardofernandes@gmail.com", "trainer_id": "8092a594-39a7-447b-a0cb-62d4b490e6a9"},
]


def login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def main():
    admin_email = os.environ.get("TEST_ACCOUNT_EMAIL")
    admin_password = os.environ.get("TEST_ACCOUNT_PASSWORD")
    if not admin_email or not admin_password:
        print("Defina TEST_ACCOUNT_EMAIL e TEST_ACCOUNT_PASSWORD no ambiente antes de rodar.")
        sys.exit(1)

    print("== Verificando os 5 profissionais (PATCH /trainers/{id}/verify) ==")
    admin_token = login(admin_email, admin_password)
    for t in TRAINERS:
        r = requests.patch(f"{BASE_URL}/trainers/{t['trainer_id']}/verify", headers=auth(admin_token))
        if r.status_code == 200:
            data = r.json()
            print(f"  [ok] {t['name']}: cref_verified={data['cref_verified']}")
        else:
            print(f"  [FALHOU {r.status_code}] {t['name']}: {r.text[:300]}")

    print("\n== Item 4: retomando criacao dos 2 desafios ==")
    now = datetime.now(timezone.utc)
    challenges_spec = [
        {
            "creator_email": "mizaninvestapp+rafaelsilva@gmail.com",
            "title": "Maratona de 30 dias",
            "description": "Desafio de resistencia: 30 dias de consistencia, um passo de cada vez.",
            "start_date": now - timedelta(days=15),
            "end_date": now + timedelta(days=15),
        },
        {
            "creator_email": "mizaninvestapp+carlossilva@gmail.com",
            "title": "Seca Verao",
            "description": "Desafio de hipertrofia: foco em ganho de massa e definicao.",
            "start_date": now - timedelta(days=2),
            "end_date": now + timedelta(days=5),
        },
    ]
    for spec in challenges_spec:
        creator_token = login(spec["creator_email"], DEMO_PASSWORD)
        r = requests.post(
            f"{BASE_URL}/challenges",
            headers=auth(creator_token),
            json={
                "title": spec["title"],
                "description": spec["description"],
                "start_date": spec["start_date"].isoformat(),
                "end_date": spec["end_date"].isoformat(),
            },
        )
        if r.status_code == 201:
            challenge = r.json()
            print(f"  criado: {spec['title']} (challenge_id={challenge['id']})")
        else:
            print(f"  [FALHOU {r.status_code}] {spec['title']}: {r.text[:300]}")

    print("\nConcluido.")


if __name__ == "__main__":
    main()
