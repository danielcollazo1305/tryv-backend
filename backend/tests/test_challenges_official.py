"""Testes dos desafios oficiais (routers/challenges.py): listar, minhas, detalhe, entrar, sair, participantes, check-ins,
progresso e POST /challenges so para administrador; e dos desafios antigos de professor (trainer_id preenchido), que ficam
fora da listagem e nao aceitam entrada.

Rodam contra um Postgres DESCARTAVEL, nunca contra o banco do .env: exigem TRYV_TEST_DATABASE_URL apontando para
localhost e para um banco cujo nome comece com "tryv_test" (mesmo padrao de test_revenuecat_subscription.py). Nenhuma
chamada de rede.

Uso (a partir de backend/):
    set TRYV_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/tryv_test_xxx
    venv\\Scripts\\python.exe -I -m unittest discover -s tests -v
"""
import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta
from urllib.parse import urlparse

TEST_DB_URL = os.environ.get("TRYV_TEST_DATABASE_URL", "")
_parsed = urlparse(TEST_DB_URL) if TEST_DB_URL else None
if not (_parsed and _parsed.hostname in ("localhost", "127.0.0.1") and _parsed.path.lstrip("/").startswith("tryv_test")):
    raise unittest.SkipTest("defina TRYV_TEST_DATABASE_URL (localhost, banco tryv_test*) para rodar estes testes")

# ANTES de importar o app: o .env/valores padrao nunca podem apontar para outro banco.
os.environ["DATABASE_URL"] = TEST_DB_URL
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import settings  # noqa: E402

assert settings.database_url == TEST_DB_URL

_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_cfg = Config(os.path.join(_root, "alembic.ini"))
_cfg.set_main_option("script_location", os.path.join(_root, "alembic"))
command.upgrade(_cfg, "head")

# O env.py do Alembic chama fileConfig(), que DESLIGA os loggers ja criados: religa-os.
import logging  # noqa: E402

for _logger in logging.root.manager.loggerDict.values():
    if isinstance(_logger, logging.Logger):
        _logger.disabled = False

from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.main import app  # noqa: E402
from app.models.challenge import Challenge, ChallengeCheckin  # noqa: E402
from app.models.trainer import Trainer  # noqa: E402
from app.models.user import User  # noqa: E402


def _auth(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


class OfficialChallengesTest(unittest.TestCase):
    client = TestClient(app)

    def setUp(self):
        self.db = SessionLocal()
        self.tag = uuid.uuid4().hex[:8]
        self.admin = self._user("Admin", is_admin=True)
        self.user = self._user("Usuario")
        self.other = self._user("Outro")
        self.users = [self.admin, self.user, self.other]
        self.trainers = []

    def tearDown(self):
        self.db.rollback()
        self.db.query(ChallengeCheckin).filter(ChallengeCheckin.user_id.in_([u.id for u in self.users])).delete(
            synchronize_session=False
        )
        self.db.query(Challenge).filter(Challenge.title.like(f"%{self.tag}%")).delete(synchronize_session=False)
        for trainer in self.trainers:
            self.db.query(Trainer).filter(Trainer.id == trainer.id).delete(synchronize_session=False)
        self.db.query(User).filter(User.id.in_([u.id for u in self.users])).delete(synchronize_session=False)
        self.db.commit()
        self.db.close()

    def _user(self, name: str, is_admin: bool = False) -> User:
        user = User(
            name=name, email=f"{uuid.uuid4().hex}@example.invalid", hashed_password="x", is_admin=is_admin
        )
        self.db.add(user)
        self.db.commit()
        return user

    def _payload(self, title: str = "Oficial", **over) -> dict:
        now = datetime.utcnow()
        body = {
            "title": f"{title} {self.tag}",
            "description": "desc",
            "start_date": (now - timedelta(days=1)).isoformat(),
            "end_date": (now + timedelta(days=20)).isoformat(),
            "is_official": True,
            "category": "musculacao_corrida",
        }
        body.update(over)
        return body

    def _create_official(self, **over) -> str:
        r = self.client.post("/challenges", json=self._payload(**over), headers=_auth(self.admin))
        self.assertEqual(r.status_code, 201, r.text)
        return r.json()["id"]

    def _legacy_trainer_challenge(self) -> Challenge:
        """Desafio antigo de professor: trainer_id preenchido (precisa de um Trainer por causa da FK)."""
        owner = self._user("Professor")
        self.users.append(owner)
        trainer = Trainer(user_id=owner.id, license_number="000000-G/XX", price=10.0)
        self.db.add(trainer)
        self.db.commit()
        self.trainers.append(trainer)
        now = datetime.utcnow()
        challenge = Challenge(
            trainer_id=trainer.id,
            title=f"Antigo {self.tag}",
            start_date=now - timedelta(days=1),
            end_date=now + timedelta(days=20),
            participant_ids=[self.user.id],
            is_official=False,
        )
        self.db.add(challenge)
        self.db.commit()
        return challenge

    # --- criar: so administrador, so desafio oficial ---

    def test_post_challenges_so_para_admin(self):
        r = self.client.post("/challenges", json=self._payload(), headers=_auth(self.user))
        self.assertEqual(r.status_code, 403)
        r = self.client.post("/challenges", json=self._payload(is_official=False), headers=_auth(self.user))
        self.assertEqual(r.status_code, 403)
        r = self.client.post("/challenges", json=self._payload())
        self.assertIn(r.status_code, (401, 403))

    def test_admin_cria_oficial_e_valida_campos(self):
        r = self.client.post("/challenges", json=self._payload(is_official=False), headers=_auth(self.admin))
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/challenges", json=self._payload(category=None), headers=_auth(self.admin))
        self.assertEqual(r.status_code, 400)
        r = self.client.post(
            "/challenges",
            json=self._payload(end_date=(datetime.utcnow() - timedelta(days=5)).isoformat()),
            headers=_auth(self.admin),
        )
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/challenges", json=self._payload(), headers=_auth(self.admin))
        self.assertEqual(r.status_code, 201, r.text)
        body = r.json()
        self.assertTrue(body["is_official"])
        self.assertIsNone(body["trainer_id"])
        self.assertEqual(body["participants_count"], 0)

    # --- listar, detalhe, minhas ---

    def test_listar_e_detalhe(self):
        cid = self._create_official()
        r = self.client.get("/challenges?is_official=true", headers=_auth(self.user))
        self.assertEqual(r.status_code, 200)
        self.assertIn(cid, [c["id"] for c in r.json()])
        r = self.client.get("/challenges?is_official=true&category=alimentacao", headers=_auth(self.user))
        self.assertNotIn(cid, [c["id"] for c in r.json()])
        r = self.client.get(f"/challenges/{cid}", headers=_auth(self.user))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["id"], cid)
        self.assertEqual(self.client.get(f"/challenges/{uuid.uuid4()}", headers=_auth(self.user)).status_code, 404)
        self.assertEqual(self.client.get("/challenges/nao-e-uuid", headers=_auth(self.user)).status_code, 404)

    def test_entrar_sair_e_minhas(self):
        cid = self._create_official()
        r = self.client.get("/challenges/mine?is_official=true", headers=_auth(self.user))
        self.assertNotIn(cid, [c["id"] for c in r.json()])

        r = self.client.post(f"/challenges/{cid}/join", headers=_auth(self.user))
        self.assertEqual(r.status_code, 201, r.text)
        self.assertEqual(r.json()["participants_count"], 1)
        # entrar de novo: 400
        self.assertEqual(self.client.post(f"/challenges/{cid}/join", headers=_auth(self.user)).status_code, 400)

        r = self.client.get("/challenges/mine?is_official=true", headers=_auth(self.user))
        self.assertIn(cid, [c["id"] for c in r.json()])
        # outro usuario nao ve nas suas
        r = self.client.get("/challenges/mine", headers=_auth(self.other))
        self.assertNotIn(cid, [c["id"] for c in r.json()])

        self.assertEqual(self.client.delete(f"/challenges/{cid}/join", headers=_auth(self.user)).status_code, 204)
        # sair de novo: 404
        self.assertEqual(self.client.delete(f"/challenges/{cid}/join", headers=_auth(self.user)).status_code, 404)
        r = self.client.get("/challenges/mine", headers=_auth(self.user))
        self.assertNotIn(cid, [c["id"] for c in r.json()])

    def test_participantes_so_para_quem_participa(self):
        cid = self._create_official()
        self.assertEqual(self.client.get(f"/challenges/{cid}/participants", headers=_auth(self.user)).status_code, 403)
        self.client.post(f"/challenges/{cid}/join", headers=_auth(self.user))
        r = self.client.get(f"/challenges/{cid}/participants", headers=_auth(self.user))
        self.assertEqual(r.status_code, 200)
        self.assertEqual([p["id"] for p in r.json()], [str(self.user.id)])
        # quem nao participa continua sem acesso
        self.assertEqual(self.client.get(f"/challenges/{cid}/participants", headers=_auth(self.other)).status_code, 403)

    # --- check-ins e progresso ---

    def test_checkins_manual(self):
        cid = self._create_official()
        # sem entrar, nao faz check-in
        r = self.client.post(f"/challenges/{cid}/checkins", json={}, headers=_auth(self.user))
        self.assertIn(r.status_code, (400, 403))
        self.client.post(f"/challenges/{cid}/join", headers=_auth(self.user))
        r = self.client.post(f"/challenges/{cid}/checkins", json={}, headers=_auth(self.user))
        self.assertEqual(r.status_code, 201, r.text)
        r = self.client.get(f"/challenges/{cid}/checkins/me", headers=_auth(self.user))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()), 1)
        # check-in de hoje ja existe: nao duplica
        r = self.client.post(f"/challenges/{cid}/checkins", json={}, headers=_auth(self.user))
        self.assertEqual(r.status_code, 400)

    def test_progresso_automatico_e_manual(self):
        manual = self._create_official()
        self.client.post(f"/challenges/{manual}/join", headers=_auth(self.user))
        # desafio de check-in manual nao usa /progress/me
        r = self.client.get(f"/challenges/{manual}/progress/me", headers=_auth(self.user))
        self.assertEqual(r.status_code, 400)

        auto = self._create_official(title="Auto", goal_type="training_frequency", target_frequency_per_week=3)
        self.client.post(f"/challenges/{auto}/join", headers=_auth(self.user))
        r = self.client.get(f"/challenges/{auto}/progress/me", headers=_auth(self.user))
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(len(r.json()) >= 1)
        self.assertTrue(all(set(day) == {"date", "achieved"} for day in r.json()))

    # --- desafios antigos de professor (trainer_id preenchido) ---

    def test_desafio_de_professor_fica_fora_da_lista_e_nao_aceita_entrada(self):
        legacy = self._legacy_trainer_challenge()
        official = self._create_official()

        r = self.client.get("/challenges", headers=_auth(self.user))
        ids = [c["id"] for c in r.json()]
        self.assertNotIn(str(legacy.id), ids)
        self.assertIn(official, ids)
        r = self.client.get("/challenges?is_official=false", headers=_auth(self.user))
        self.assertNotIn(str(legacy.id), [c["id"] for c in r.json()])

        # o usuario consta como participante do antigo, mas ele nao aparece em "minhas"
        r = self.client.get("/challenges/mine", headers=_auth(self.user))
        self.assertNotIn(str(legacy.id), [c["id"] for c in r.json()])

        # entrar: 404 (e a lista de participantes nao muda)
        r = self.client.post(f"/challenges/{legacy.id}/join", headers=_auth(self.other))
        self.assertEqual(r.status_code, 404)
        self.db.refresh(legacy)
        self.assertEqual(list(legacy.participant_ids), [self.user.id])


if __name__ == "__main__":
    unittest.main()
