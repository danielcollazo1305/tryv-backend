"""Testes dos selos do usuario: `teams` sempre vazio (selo Team removido com o modo professor, campo mantido para o app
antigo) e selo Pro calculado como sempre, em GET /users/{id}/badges e no perfil publico GET /users/{id}/profile.

Rodam contra um Postgres DESCARTAVEL, nunca contra o banco do .env: exigem TRYV_TEST_DATABASE_URL apontando para
localhost e para um banco cujo nome comece com "tryv_test" (mesmo padrao dos outros testes). Nenhuma chamada de rede.

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
from app.models.subscription import Subscription  # noqa: E402
from app.models.trainer import Trainer  # noqa: E402
from app.models.user import User  # noqa: E402


class UserBadgesTest(unittest.TestCase):
    client = TestClient(app)

    def setUp(self):
        self.db = SessionLocal()
        self.users = []
        self.trainers = []
        self.viewer = self._user("Quem ve")
        self.target = self._user("Alvo")

    def tearDown(self):
        self.db.rollback()
        ids = [u.id for u in self.users]
        self.db.query(Subscription).filter(Subscription.user_id.in_(ids)).delete(synchronize_session=False)
        for trainer in self.trainers:
            self.db.query(Trainer).filter(Trainer.id == trainer.id).delete(synchronize_session=False)
        self.db.query(User).filter(User.id.in_(ids)).delete(synchronize_session=False)
        self.db.commit()
        self.db.close()

    def _user(self, name: str) -> User:
        user = User(name=name, email=f"{uuid.uuid4().hex}@example.invalid", hashed_password="x")
        self.db.add(user)
        self.db.commit()
        self.users.append(user)
        return user

    def _add_sub(self, **kw) -> Subscription:
        row = Subscription(user_id=self.target.id, **kw)
        self.db.add(row)
        self.db.commit()
        return row

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {create_access_token({'sub': str(self.viewer.id)})}"}

    def _badges(self) -> dict:
        r = self.client.get(f"/users/{self.target.id}/badges", headers=self._headers())
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def _profile(self) -> dict:
        r = self.client.get(f"/users/{self.target.id}/profile", headers=self._headers())
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def _pro_sub(self, **over):
        values = dict(
            type="base", provider="revenuecat", status="active", expires_at=datetime.utcnow() + timedelta(days=10)
        )
        values.update(over)
        return self._add_sub(**values)

    # --- teams: sempre [], mesmo para quem antes teria o selo Team ---

    def test_teams_vazio_mesmo_com_assinatura_de_professor_ativa(self):
        owner = self._user("Professor")
        trainer = Trainer(user_id=owner.id, license_number="000000-G/XX", price=10.0)
        self.db.add(trainer)
        self.db.commit()
        self.trainers.append(trainer)
        # Exatamente o que gerava o selo Team antes: trainer_addon ativa ligada a um professor.
        self._add_sub(type="trainer_addon", trainer_id=trainer.id, status="active")

        badges = self._badges()
        self.assertIn("teams", badges)
        self.assertEqual(badges["teams"], [])
        profile = self._profile()
        self.assertIn("teams", profile)
        self.assertEqual(profile["teams"], [])
        # Assinatura de professor nunca e Pro.
        self.assertFalse(badges["is_pro"])
        self.assertFalse(profile["is_pro"])

    def test_teams_vazio_sem_nenhuma_assinatura(self):
        self.assertEqual(self._badges(), {"is_pro": False, "teams": []})
        profile = self._profile()
        self.assertEqual(profile["teams"], [])
        self.assertFalse(profile["is_pro"])

    # --- is_pro: calculado como antes, nas duas rotas ---

    def test_is_pro_com_assinatura_do_app_ativa(self):
        self._pro_sub()
        self.assertTrue(self._badges()["is_pro"])
        self.assertTrue(self._profile()["is_pro"])

    def test_is_pro_stripe_legado_com_expires_at_nulo(self):
        self._pro_sub(provider="stripe", stripe_subscription_id="sub_x", expires_at=None)
        self.assertTrue(self._badges()["is_pro"])
        self.assertTrue(self._profile()["is_pro"])

    def test_is_pro_past_due_so_com_carencia_no_futuro(self):
        sub = self._pro_sub(status="past_due")
        self.assertTrue(self._badges()["is_pro"])
        sub.expires_at = datetime.utcnow() - timedelta(days=1)
        self.db.commit()
        self.assertFalse(self._badges()["is_pro"])
        self.assertFalse(self._profile()["is_pro"])

    def test_nao_e_pro_expirada_ou_cancelada(self):
        sub = self._pro_sub(expires_at=datetime.utcnow() - timedelta(days=1))
        self.assertFalse(self._badges()["is_pro"])
        sub.expires_at = datetime.utcnow() + timedelta(days=10)
        sub.status = "canceled"
        self.db.commit()
        self.assertFalse(self._badges()["is_pro"])
        self.assertFalse(self._profile()["is_pro"])

    def test_usuario_inexistente_continua_dando_404(self):
        # Comportamento fora do selo, mas na mesma rota.
        r = self.client.get(f"/users/{uuid.uuid4()}/badges", headers=self._headers())
        self.assertEqual(r.status_code, 404)


if __name__ == "__main__":
    unittest.main()
