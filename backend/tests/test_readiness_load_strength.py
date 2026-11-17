"""Pilar de CARGA da prontidao com MUSCULACAO (WorkoutSession) alem de corrida e atividade manual: conversao de series em minutos equivalentes
(services/training_load.py) e janela de 7 dias. Rodam so contra um Postgres DESCARTAVEL em localhost (TRYV_TEST_DATABASE_URL, banco tryv_test*);
sem a variavel, pulam. As funcoes puras de conversao tambem sao testadas, mas o modulo inteiro pula junto sem a variavel (compartilham o arquivo).
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
from app.core.timezone import local_today  # noqa: E402
from app.main import app  # noqa: E402
from app.models.manual_activity import ManualActivity  # noqa: E402
from app.models.readiness_score import ReadinessScore  # noqa: E402
from app.models.run import Run  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.workout import WorkoutSession  # noqa: E402
from app.routers import readiness  # noqa: E402
from app.services import training_load  # noqa: E402
from app.services.training_load import (  # noqa: E402
    STRENGTH_MINUTES_PER_SET,
    STRENGTH_SESSION_MAX_MINUTES,
    completed_sets_count,
    strength_session_minutes,
)


def exercises_json(*sets_per_exercise: tuple[int, int]) -> dict:
    """Cada tupla = (series concluidas, series NAO concluidas) de um exercicio."""
    exercises = []
    for index, (done, pending) in enumerate(sets_per_exercise):
        sets = [{"weight_kg": 50.0, "reps": 10, "completed": True} for _ in range(done)]
        sets += [{"weight_kg": 50.0, "reps": 10, "completed": False} for _ in range(pending)]
        exercises.append({"name": f"exercicio {index}", "planned_sets": done + pending, "planned_reps": "10", "sets": sets})
    return {"day": None, "focus": None, "exercises": exercises}


class StrengthConversionUnitTests(unittest.TestCase):
    def test_constantes_documentadas(self):
        self.assertEqual(STRENGTH_MINUTES_PER_SET, 2.5)
        self.assertEqual(STRENGTH_SESSION_MAX_MINUTES, 120.0)

    def test_exemplos_do_documento(self):
        self.assertEqual(strength_session_minutes(exercises_json((12, 0))), 30.0)
        self.assertEqual(strength_session_minutes(exercises_json((20, 0))), 50.0)
        self.assertEqual(strength_session_minutes(exercises_json((48, 0))), 120.0)

    def test_so_conta_serie_concluida(self):
        self.assertEqual(completed_sets_count(exercises_json((3, 5), (2, 4))), 5)
        self.assertEqual(strength_session_minutes(exercises_json((4, 6))), 10.0)

    def test_soma_varios_exercicios(self):
        self.assertEqual(strength_session_minutes(exercises_json((4, 0), (4, 0), (4, 0))), 30.0)

    def test_teto_por_sessao(self):
        self.assertEqual(strength_session_minutes(exercises_json((500, 0))), 120.0)

    def test_duracao_real_tem_prioridade_e_tambem_tem_teto(self):
        self.assertEqual(strength_session_minutes(exercises_json((20, 0)), duration_minutes=45), 45.0)
        self.assertEqual(strength_session_minutes(exercises_json((20, 0)), duration_minutes=400), 120.0)
        self.assertEqual(strength_session_minutes(None, duration_minutes=30), 30.0)

    def test_duracao_zero_negativa_ou_invalida_cai_para_as_series(self):
        for duration in (0, -5, None, True, "45"):
            self.assertEqual(strength_session_minutes(exercises_json((10, 0)), duration_minutes=duration), 25.0, repr(duration))

    def test_json_fora_do_formato_vale_zero_e_nao_levanta(self):
        for bad in (None, [], "texto", 5, {}, {"exercises": None}, {"exercises": "x"}, {"exercises": [None, 3, "a"]},
                    {"exercises": [{"sets": None}]}, {"exercises": [{"sets": "x"}]}, {"exercises": [{"sets": [None, 1, "a"]}]},
                    {"exercises": [{"sets": [{"completed": "true"}, {"completed": 1}, {}]}]}):
            self.assertEqual(completed_sets_count(bad), 0, repr(bad))
            self.assertEqual(strength_session_minutes(bad), 0.0, repr(bad))

    def test_modulo_nao_importa_banco(self):
        self.assertFalse(hasattr(training_load, "SessionLocal"))


class LoadWithStrengthTests(unittest.TestCase):
    client = TestClient(app)

    def setUp(self):
        self.db = SessionLocal()
        self.user = self._user()
        self.other = self._user()
        self.uid, self.other_id = self.user.id, self.other.id
        self.headers = {"Authorization": f"Bearer {create_access_token({'sub': str(self.uid)})}"}
        self.now = datetime.utcnow()

    def tearDown(self):
        self.db.rollback()
        for uid in (self.uid, self.other_id):
            for model in (WorkoutSession, Run, ManualActivity, ReadinessScore):
                self.db.query(model).filter(model.user_id == uid).delete()
            self.db.query(User).filter(User.id == uid).delete()
        self.db.commit()
        self.db.close()

    def _user(self) -> User:
        user = User(name="Teste", email=f"{uuid.uuid4().hex}@example.invalid", hashed_password="x", is_admin=False)
        self.db.add(user)
        self.db.commit()
        return user

    def add_session(self, sets=(20, 0), when=None, user_id=None, duration=None, raw=None):
        self.db.add(
            WorkoutSession(
                user_id=user_id or self.uid,
                exercises=raw if raw is not None else exercises_json(*([sets] if isinstance(sets, tuple) else sets)),
                duration_minutes=duration,
                completed_at=when or self.now,
            )
        )
        self.db.commit()

    def load(self, user_id=None) -> float:
        self.db.expire_all()
        return readiness._load_score(self.db, user_id or self.uid, local_today())

    def test_sem_nada_a_carga_e_maxima(self):
        self.assertEqual(self.load(), 100.0)

    def test_musculacao_reduz_a_carga(self):
        self.add_session(sets=(20, 0))  # 50 min equivalentes
        self.assertEqual(self.load(), round(100 - 50 / 600 * 80, 1))  # 93.3

    def test_so_series_concluidas_contam(self):
        self.add_session(sets=(12, 8))  # 30 min
        self.assertEqual(self.load(), 96.0)

    def test_soma_com_corrida_e_atividade_manual(self):
        self.db.add(
            Run(user_id=self.uid, route_points=[], distance_meters=5000.0, duration_seconds=1800,
                started_at=self.now - timedelta(hours=3), finished_at=self.now - timedelta(hours=2, minutes=30))
        )
        self.db.add(ManualActivity(user_id=self.uid, activity_type="swim", duration_minutes=20, performed_at=self.now - timedelta(hours=5)))
        self.db.commit()
        self.assertEqual(self.load(), round(100 - 50 / 600 * 80, 1))  # 30 + 20 min, sem musculacao
        self.add_session(sets=(20, 0))  # + 50 min
        self.assertEqual(self.load(), round(100 - 100 / 600 * 80, 1))  # 86.7

    def test_varias_sessoes_somam(self):
        self.add_session(sets=(12, 0), when=self.now - timedelta(days=1))
        self.add_session(sets=(12, 0), when=self.now - timedelta(days=3))
        self.assertEqual(self.load(), round(100 - 60 / 600 * 80, 1))  # 92.0

    def test_sessao_fora_da_janela_de_7_dias_nao_conta(self):
        self.add_session(sets=(40, 0), when=self.now - timedelta(days=9))
        self.assertEqual(self.load(), 100.0)

    def test_sessao_de_outra_pessoa_nao_conta(self):
        self.add_session(sets=(40, 0), user_id=self.other_id)
        self.assertEqual(self.load(), 100.0)
        self.assertEqual(self.load(self.other_id), round(100 - 100 / 600 * 80, 1))

    def test_duracao_real_da_sessao_tem_prioridade(self):
        self.add_session(sets=(20, 0), duration=30)  # valeria 50 pelas series
        self.assertEqual(self.load(), round(100 - 30 / 600 * 80, 1))

    def test_teto_por_sessao_e_piso_do_pilar(self):
        self.add_session(sets=(300, 0))
        self.assertEqual(self.load(), round(100 - 120 / 600 * 80, 1))  # 84.0 (teto de 120 min)
        for _ in range(8):
            self.add_session(sets=(300, 0))
        self.assertEqual(self.load(), 20.0)  # o piso de sempre do pilar

    def test_sessao_com_json_estranho_nao_derruba_a_prontidao(self):
        self.add_session(raw={"exercises": "lixo"})
        self.add_session(raw={})
        self.assertEqual(self.load(), 100.0)

    def test_endpoint_devolve_a_carga_com_musculacao_e_o_score_final(self):
        self.add_session(sets=(20, 0))
        r = self.client.get("/readiness/today", params={"sleep_quality": 80}, headers=self.headers)
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        self.assertEqual(body["load_score"], 93.3)
        self.assertEqual(body["sleep_score"], 80.0)
        self.assertEqual(body["final_score"], round((80 * 0.4 + 93.3 * 0.4) / 0.8, 1))  # 86.7 (sem FC suficiente)


    # ------------------------------------------------------------------------------------------------ load_score_prior (7 dias ANTERIORES a hoje)
    def prior(self, user_id=None) -> float:
        self.db.expire_all()
        return readiness._load_score(self.db, user_id or self.uid, local_today(), include_today=False)

    def test_prior_sem_nada_e_maximo(self):
        self.assertEqual(self.prior(), 100.0)

    def test_treino_de_hoje_entra_na_carga_mas_nao_no_prior(self):
        self.add_session(sets=(20, 0), when=self.now)
        self.assertEqual(self.load(), 93.3)
        self.assertEqual(self.prior(), 100.0)

    def test_treino_de_ontem_entra_nos_dois(self):
        self.add_session(sets=(20, 0), when=self.now - timedelta(days=1))
        self.assertEqual(self.load(), 93.3)
        self.assertEqual(self.prior(), 93.3)

    def test_janela_do_prior_vai_de_hoje_menos_7_ate_ontem(self):
        self.add_session(sets=(12, 0), when=self.now - timedelta(days=7))  # 30 min, 7 dias atras: so no prior
        self.assertEqual(self.load(), 100.0)
        self.assertEqual(self.prior(), 96.0)
        self.add_session(sets=(12, 0), when=self.now - timedelta(days=8))  # 8 dias atras: em nenhuma
        self.assertEqual(self.prior(), 96.0)
        self.assertEqual(self.load(), 100.0)

    def test_prior_soma_corrida_manual_e_musculacao_de_dias_anteriores(self):
        self.db.add(
            Run(user_id=self.uid, route_points=[], distance_meters=5000.0, duration_seconds=1800,
                started_at=self.now - timedelta(days=2), finished_at=self.now - timedelta(days=2, minutes=-30))
        )
        self.db.add(ManualActivity(user_id=self.uid, activity_type="swim", duration_minutes=20, performed_at=self.now - timedelta(days=3)))
        self.db.commit()
        self.add_session(sets=(20, 0), when=self.now - timedelta(days=1))
        self.assertEqual(self.prior(), round(100 - 100 / 600 * 80, 1))  # 30 + 20 + 50 min

    def test_prior_de_outra_pessoa_nao_conta(self):
        self.add_session(sets=(40, 0), when=self.now - timedelta(days=1), user_id=self.other_id)
        self.assertEqual(self.prior(), 100.0)
        self.assertEqual(self.prior(self.other_id), round(100 - 100 / 600 * 80, 1))

    def test_endpoint_devolve_load_score_prior_e_mantem_todos_os_campos_atuais(self):
        self.add_session(sets=(20, 0), when=self.now)  # hoje
        self.add_session(sets=(12, 0), when=self.now - timedelta(days=2))  # anteontem
        r = self.client.get("/readiness/today", params={"sleep_quality": 80}, headers=self.headers)
        self.assertEqual(r.status_code, 200, r.text)
        body = r.json()
        for key in ("date", "sleep_score", "load_score", "hr_score", "final_score", "recommendation_text"):  # compatibilidade com o app antigo
            self.assertIn(key, body)
        self.assertEqual(body["load_score_prior"], 96.0)  # so os 30 min de anteontem
        self.assertEqual(body["load_score"], round(100 - 80 / 600 * 80, 1))  # 30 + 50 min = 89.3
        self.assertEqual(body["final_score"], round((80 * 0.4 + body["load_score"] * 0.4) / 0.8, 1))  # o final continua usando a carga COM hoje

    def test_o_valor_gravado_continua_sendo_a_carga_com_hoje(self):
        from app.models.readiness_score import ReadinessScore as RS

        self.add_session(sets=(20, 0), when=self.now)
        self.client.get("/readiness/today", headers=self.headers)
        self.db.expire_all()
        row = self.db.query(RS).filter(RS.user_id == self.uid).one()
        self.assertEqual(row.load_score, 93.3)  # prior nao e coluna: nada novo no banco



if __name__ == "__main__":
    unittest.main()
