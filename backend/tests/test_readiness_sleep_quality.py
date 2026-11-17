"""GET /readiness/today com sleep_quality (0-100, calculada no aparelho): prioridade sobre as horas, compatibilidade com o app antigo (so sleep_hours
ou nada), validacao da faixa e efeito no score final. Rodam so contra um Postgres DESCARTAVEL em localhost (TRYV_TEST_DATABASE_URL, banco tryv_test*);
sem a variavel, pulam.
"""
import os
import sys
import unittest
import uuid
from urllib.parse import urlparse

TEST_DB_URL = os.environ.get("TRYV_TEST_DATABASE_URL", "")
_parsed = urlparse(TEST_DB_URL) if TEST_DB_URL else None
if not (_parsed and _parsed.hostname in ("localhost", "127.0.0.1") and _parsed.path.lstrip("/").startswith("tryv_test")):
    raise unittest.SkipTest("defina TRYV_TEST_DATABASE_URL (localhost, banco tryv_test*) para rodar estes testes")

os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["REVENUECAT_API_SECRET"] = ""
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_cfg = Config(os.path.join(_root, "alembic.ini"))
_cfg.set_main_option("script_location", os.path.join(_root, "alembic"))
command.upgrade(_cfg, "head")

import logging  # noqa: E402

for _logger in logging.root.manager.loggerDict.values():
    if isinstance(_logger, logging.Logger):
        _logger.disabled = False

from app import models  # noqa: E402,F401
from app.core.database import SessionLocal  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.main import app  # noqa: E402
from app.models.readiness_score import ReadinessScore  # noqa: E402
from app.models.user import User  # noqa: E402
from app.routers import readiness  # noqa: E402


class ReadinessBase(unittest.TestCase):
    client = TestClient(app)

    def setUp(self):
        self.db = SessionLocal()
        self.user = User(name="Teste", email=f"{uuid.uuid4().hex}@example.invalid", hashed_password="x", is_admin=False)
        self.db.add(self.user)
        self.db.commit()
        self.uid = self.user.id
        self.headers = {"Authorization": f"Bearer {create_access_token({'sub': str(self.uid)})}"}

    def tearDown(self):
        self.db.rollback()
        self.db.query(ReadinessScore).filter(ReadinessScore.user_id == self.uid).delete()
        self.db.query(User).filter(User.id == self.uid).delete()
        self.db.commit()
        self.db.close()

    def today(self, **params):
        return self.client.get("/readiness/today", params=params, headers=self.headers)


class SleepQualityParamTests(ReadinessBase):
    def test_sem_parametros_o_pilar_de_sono_fica_de_fora(self):
        r = self.today()
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertIsNone(body["sleep_score"])
        self.assertEqual(body["load_score"], 100.0)  # sem treino = sem fadiga acumulada
        self.assertEqual(body["final_score"], 100.0)  # so a carga: peso redistribuido

    def test_app_antigo_so_com_horas_continua_igual(self):
        r = self.today(sleep_hours=6)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["sleep_score"], readiness._sleep_score(6))  # 62.5
        self.assertEqual(r.json()["sleep_score"], 62.5)

    def test_com_sleep_quality_ela_vira_o_pilar_de_sono(self):
        r = self.today(sleep_quality=73.4)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["sleep_score"], 73.4)

    def test_sleep_quality_tem_prioridade_sobre_as_horas(self):
        r = self.today(sleep_hours=8, sleep_quality=55)  # 8 h daria 100
        self.assertEqual(r.json()["sleep_score"], 55.0)

    def test_horas_viram_fallback_quando_nao_ha_qualidade(self):
        r = self.today(sleep_hours=4)  # 4 h = 32
        self.assertEqual(r.json()["sleep_score"], 32.0)

    def test_limites_da_faixa_sao_aceitos(self):
        self.assertEqual(self.today(sleep_quality=0).json()["sleep_score"], 0.0)
        self.assertEqual(self.today(sleep_quality=100).json()["sleep_score"], 100.0)

    def test_qualidade_zero_nao_e_tratada_como_ausente(self):
        """0 e um valor valido (noite pessima), diferente de nao enviar."""
        body = self.today(sleep_quality=0).json()
        self.assertEqual(body["sleep_score"], 0.0)
        self.assertEqual(body["final_score"], 50.0)  # (0*0,4 + 100*0,4) / 0,8

    def test_valores_invalidos_dao_422_e_nao_gravam_nada(self):
        for bad in ("-1", "-0.01", "100.01", "101", "abc", "nan", "inf", "-inf", ""):
            r = self.client.get("/readiness/today", params={"sleep_quality": bad}, headers=self.headers)
            self.assertEqual(r.status_code, 422, f"sleep_quality={bad!r} -> {r.status_code}")
        self.db.expire_all()
        self.assertEqual(self.db.query(ReadinessScore).filter(ReadinessScore.user_id == self.uid).count(), 0)

    def test_sleep_hours_invalido_continua_422(self):
        self.assertEqual(self.today(sleep_hours=25).status_code, 422)
        self.assertEqual(self.today(sleep_hours=-1).status_code, 422)

    def test_efeito_no_score_final(self):
        """Sem FC suficiente, final = (sono x 0,4 + carga x 0,4) / 0,8, com a carga em 100 (sem treino)."""
        self.assertEqual(self.today(sleep_quality=60).json()["final_score"], 80.0)
        self.assertEqual(self.today(sleep_quality=90).json()["final_score"], 95.0)

    def test_arredonda_para_uma_casa(self):
        self.assertEqual(self.today(sleep_quality=71.26).json()["sleep_score"], 71.3)

    def test_continua_um_registro_por_dia_e_sobrescreve(self):
        self.today(sleep_quality=40)
        self.today(sleep_quality=80)
        self.db.expire_all()
        rows = self.db.query(ReadinessScore).filter(ReadinessScore.user_id == self.uid).all()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].sleep_score, 80.0)

    def test_exige_login(self):
        self.assertEqual(self.client.get("/readiness/today", params={"sleep_quality": 50}).status_code, 401)

    def test_resolvedor_puro(self):
        r = readiness._resolve_sleep_score
        self.assertIsNone(r(None, None))
        self.assertEqual(r(8, None), 100.0)
        self.assertEqual(r(None, 42.04), 42.0)
        self.assertEqual(r(8, 42.0), 42.0)
        self.assertEqual(r(None, 0), 0.0)


if __name__ == "__main__":
    unittest.main()
