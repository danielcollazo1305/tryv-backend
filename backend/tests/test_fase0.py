"""Testes da fase 0 (endurecer a base): FC com lote limitado e deduplicacao, registro de uso e teto diario da IA, feature flags
(GET /features) e exclusao de conta com as tabelas novas. Nenhuma chamada de rede: o cliente da Anthropic e SEMPRE simulado.
Rodam so contra um Postgres DESCARTAVEL em localhost (TRYV_TEST_DATABASE_URL, banco tryv_test*), como os demais; sem a variavel, pulam.
"""
import json
import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest import mock
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

from app.core.config import Settings, settings  # noqa: E402

assert settings.database_url == TEST_DB_URL

_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_cfg = Config(os.path.join(_root, "alembic.ini"))
_cfg.set_main_option("script_location", os.path.join(_root, "alembic"))
command.upgrade(_cfg, "head")

# O env.py do Alembic chama fileConfig(), que DESLIGA os loggers ja criados: religa-os para os testes de log.
import logging  # noqa: E402

for _logger in logging.root.manager.loggerDict.values():
    if isinstance(_logger, logging.Logger):
        _logger.disabled = False

from app import models  # noqa: E402,F401
from app.core.database import Base, SessionLocal  # noqa: E402
from app.core.security import create_access_token, hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models.ai_usage import AiUsage  # noqa: E402
from app.models.avatar_attempt import AvatarAttempt  # noqa: E402
from app.models.daily_insight import DailyInsight  # noqa: E402
from app.models.heart_rate import HeartRateSample  # noqa: E402
from app.models.subscription import Subscription  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import account_deletion, ai_usage, revenuecat_api  # noqa: E402
from app.services.ai_client import LIGHT_MODEL  # noqa: E402

PASSWORD = "senha-de-teste-123"


class Base_(unittest.TestCase):
    """Cria um usuario descartavel (e um segundo) e limpa tudo no fim."""

    client = TestClient(app)

    def setUp(self):
        self.db = SessionLocal()
        self.user = self._make_user()
        self.other = self._make_user()
        self.uid = self.user.id
        self.other_id = self.other.id
        self.headers = self._headers(self.user)

    def tearDown(self):
        self.db.rollback()
        for uid in (self.uid, self.other_id):  # ids guardados: o objeto User pode ter sido apagado pelo proprio teste
            for model in (AiUsage, AvatarAttempt, HeartRateSample, DailyInsight, Subscription):
                self.db.query(model).filter(model.user_id == uid).delete()
            self.db.query(User).filter(User.id == uid).delete()
        self.db.commit()
        self.db.close()

    def _make_user(self) -> User:
        user = User(name="Teste", email=f"{uuid.uuid4().hex}@example.invalid", hashed_password=hash_password(PASSWORD), is_admin=False)
        self.db.add(user)
        self.db.commit()
        return user

    @staticmethod
    def _headers(user: User) -> dict:
        return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}

    def _make_pro(self, user: User | None = None) -> None:
        user = user or self.user
        self.db.add(
            Subscription(
                user_id=user.id, type="base", provider="revenuecat", status="active", expires_at=datetime.utcnow() + timedelta(days=10)
            )
        )
        self.db.commit()


# ---------------------------------------------------------------------------------------------------------------- B1: FC


class HeartRateSyncTests(Base_):
    def sync(self, samples, source="healthkit", headers=None):
        return self.client.post("/heart-rate/sync", json={"source": source, "samples": samples}, headers=headers or self.headers)

    def count(self, user=None) -> int:
        self.db.expire_all()
        return self.db.query(HeartRateSample).filter(HeartRateSample.user_id == (user or self.user).id).count()

    @staticmethod
    def make_samples(n: int, start: datetime = datetime(2026, 11, 1, 10, 0, 0)):
        return [{"bpm": 60 + (i % 40), "recorded_at": (start + timedelta(seconds=i)).isoformat()} for i in range(n)]

    def test_lote_no_limite_de_1000_e_aceito(self):
        r = self.sync(self.make_samples(1000))
        self.assertEqual(r.status_code, 201, r.text[:300])
        self.assertEqual(len(r.json()), 1000)
        self.assertEqual(self.count(), 1000)

    def test_lote_acima_de_1000_da_422_com_mensagem_clara_e_nao_grava_nada(self):
        r = self.sync(self.make_samples(1001))
        self.assertEqual(r.status_code, 422)
        message = json.dumps(r.json(), ensure_ascii=False)
        self.assertIn("1000", message)
        self.assertIn("lote", message.lower())
        self.assertEqual(self.count(), 0)

    def test_lote_vazio_continua_422(self):
        self.assertEqual(self.sync([]).status_code, 422)

    def test_amostra_fora_da_faixa_continua_recusando_o_lote_inteiro(self):
        r = self.sync([{"bpm": 70, "recorded_at": "2026-11-01T10:00:00"}, {"bpm": 300, "recorded_at": "2026-11-01T10:00:01"}])
        self.assertEqual(r.status_code, 422)
        self.assertEqual(self.count(), 0)

    def test_reenviar_o_mesmo_lote_nao_duplica(self):
        samples = self.make_samples(50)
        first = self.sync(samples)
        second = self.sync(samples)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(len(first.json()), 50)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(second.json(), [])  # nada novo foi criado
        self.assertEqual(self.count(), 50)

    def test_amostra_da_borda_repetida_no_lote_seguinte_nao_duplica(self):
        """O app repete a ultima amostra do lote anterior (cursor inclusivo): so a nova entra."""
        samples = self.make_samples(10)
        self.sync(samples[:5])
        r = self.sync(samples[4:])  # a de indice 4 se repete
        self.assertEqual(len(r.json()), 5)
        self.assertEqual(self.count(), 10)

    def test_duplicatas_dentro_do_mesmo_lote_viram_uma_so(self):
        r = self.sync([{"bpm": 70, "recorded_at": "2026-11-01T10:00:00"}, {"bpm": 71, "recorded_at": "2026-11-01T10:00:00"}])
        self.assertEqual(r.status_code, 201)
        self.assertEqual(len(r.json()), 1)
        self.assertEqual(self.count(), 1)

    def test_instante_com_fuso_z_do_app_tambem_deduplica(self):
        """O app envia toISOString() (termina em Z)."""
        sample = [{"bpm": 80, "recorded_at": "2026-11-01T13:00:00.000Z"}]
        self.sync(sample)
        again = self.sync(sample)
        self.assertEqual(again.json(), [])
        self.assertEqual(self.count(), 1)

    def test_mesma_hora_em_outra_fonte_ou_outro_usuario_nao_conta_como_duplicata(self):
        sample = [{"bpm": 75, "recorded_at": "2026-11-01T10:00:00"}]
        self.assertEqual(len(self.sync(sample, source="healthkit").json()), 1)
        self.assertEqual(len(self.sync(sample, source="garmin").json()), 1)
        self.assertEqual(len(self.sync(sample, source="healthkit", headers=self._headers(self.other)).json()), 1)
        self.assertEqual(self.count(), 2)
        self.assertEqual(self.count(self.other), 1)

    def test_constraint_e_indice_existem_no_banco(self):
        names = {c.name for c in HeartRateSample.__table__.constraints} | {i.name for i in HeartRateSample.__table__.indexes}
        self.assertIn("uq_heart_rate_user_source_recorded", names)
        self.assertIn("ix_heart_rate_samples_user_recorded_at", names)
        with SessionLocal() as session:
            from sqlalchemy import text

            in_db = {
                row[0]
                for row in session.execute(
                    text("SELECT indexname FROM pg_indexes WHERE tablename = 'heart_rate_samples'")
                )
            }
        self.assertIn("uq_heart_rate_user_source_recorded", in_db)
        self.assertIn("ix_heart_rate_samples_user_recorded_at", in_db)


# ---------------------------------------------------------------------------------------------------------------- B2: IA


def fake_response(stop_reason="end_turn", input_tokens=120, output_tokens=45, payload=None):
    payload = payload or {"insight_text": "Bom ritmo esta semana.", "category": "general"}
    return SimpleNamespace(
        stop_reason=stop_reason,
        usage=SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens),
        content=[SimpleNamespace(type="text", text=json.dumps(payload))],
    )


class AiUsageRecordTests(Base_):
    def rows(self, feature=None):
        self.db.expire_all()
        query = self.db.query(AiUsage).filter(AiUsage.user_id == self.uid)
        if feature:
            query = query.filter(AiUsage.feature == feature)
        return query.all()

    def test_grava_so_numeros(self):
        ai_usage.record_ai_usage(self.uid, "meal_text", "modelo-x", fake_response(input_tokens=321, output_tokens=54))
        (row,) = self.rows()
        self.assertEqual((row.feature, row.model, row.input_tokens, row.output_tokens), ("meal_text", "modelo-x", 321, 54))
        self.assertIsNotNone(row.created_at)

    def test_a_tabela_nao_tem_coluna_de_conteudo(self):
        self.assertEqual(
            set(AiUsage.__table__.columns.keys()),
            {"id", "user_id", "feature", "model", "input_tokens", "output_tokens", "created_at"},
        )

    def test_sem_usuario_nao_grava(self):
        ai_usage.record_ai_usage(None, "meal_text", "modelo-x", fake_response())
        self.assertEqual(self.rows(), [])

    def test_usage_ausente_ou_invalido_grava_zero(self):
        ai_usage.record_ai_usage(self.uid, "meal_text", "m", SimpleNamespace())
        ai_usage.record_ai_usage(self.uid, "meal_text", "m", SimpleNamespace(usage=SimpleNamespace(input_tokens="x", output_tokens=None)))
        self.assertEqual([(r.input_tokens, r.output_tokens) for r in self.rows()], [(0, 0), (0, 0)])

    def test_falha_ao_gravar_nunca_lanca_so_avisa_no_log(self):
        with mock.patch.object(ai_usage, "SessionLocal", side_effect=RuntimeError("banco fora")):
            with self.assertLogs("app.services.ai_usage", level="WARNING") as logs:
                ai_usage.record_ai_usage(self.uid, "meal_text", "m", fake_response())  # nao pode lancar
        self.assertIn("ai_usage_record_failed", logs.output[0])
        self.assertNotIn("banco fora", logs.output[0])  # nem a mensagem do erro vai para o log, so o tipo
        self.assertEqual(self.rows(), [])

    def test_servico_de_insight_registra_o_uso_com_o_modelo_leve(self):
        from app.services import daily_insight

        client = mock.Mock()
        client.messages.create.return_value = fake_response(input_tokens=700, output_tokens=30)
        with mock.patch.object(daily_insight, "get_client", return_value=client):
            result = daily_insight.generate_daily_insight({"activities": []}, [], user_id=self.uid)
        self.assertEqual(result["category"], "general")
        (row,) = self.rows("daily_insight")
        self.assertEqual((row.model, row.input_tokens, row.output_tokens), (LIGHT_MODEL, 700, 30))

    def test_resposta_recusada_ou_truncada_tambem_conta_tokens(self):
        from app.services import daily_insight

        for stop in ("refusal", "max_tokens"):
            client = mock.Mock()
            client.messages.create.return_value = fake_response(stop_reason=stop, input_tokens=10, output_tokens=2)
            with mock.patch.object(daily_insight, "get_client", return_value=client):
                with self.assertRaises(ValueError):
                    daily_insight.generate_daily_insight({"activities": []}, [], user_id=self.uid)
        self.assertEqual(len(self.rows("daily_insight")), 2)

    def test_servicos_sem_usuario_continuam_funcionando_sem_gravar(self):
        from app.services import daily_insight

        client = mock.Mock()
        client.messages.create.return_value = fake_response()
        with mock.patch.object(daily_insight, "get_client", return_value=client):
            daily_insight.generate_daily_insight({"activities": []}, [])
        self.assertEqual(self.rows(), [])


class InsightDailyCapTests(Base_):
    def setUp(self):
        super().setUp()
        self._old_limit = settings.ai_insight_daily_limit
        self._make_pro()

    def tearDown(self):
        settings.ai_insight_daily_limit = self._old_limit
        super().tearDown()

    def add_usage(self, n=1, feature="daily_insight", when=None, user=None):
        for _ in range(n):
            self.db.add(
                AiUsage(user_id=(user or self.user).id, feature=feature, model="m", input_tokens=1, output_tokens=1,
                        created_at=when or datetime.utcnow())
            )
        self.db.commit()

    def generate(self, headers=None):
        return self.client.post("/insights/generate", headers=headers or self.headers)

    def test_abaixo_do_teto_gera(self):
        settings.ai_insight_daily_limit = "3"
        self.add_usage(2)
        r = self.generate()
        self.assertEqual(r.status_code, 201, r.text)  # sem dados de atividade o texto padrao sai sem chamar a IA

    def test_no_teto_responde_429_em_portugues_com_retry_after(self):
        settings.ai_insight_daily_limit = "2"
        self.add_usage(2)
        r = self.generate()
        self.assertEqual(r.status_code, 429)
        self.assertIn("limite diário", r.json()["detail"])
        self.assertGreater(int(r.headers["Retry-After"]), 0)
        self.assertLessEqual(int(r.headers["Retry-After"]), 86400 + 3600)

    def test_429_nao_chama_a_ia_nem_grava_insight(self):
        settings.ai_insight_daily_limit = "1"
        self.add_usage(1)
        with mock.patch("app.routers.insights.generate_daily_insight") as gen:
            r = self.generate()
        self.assertEqual(r.status_code, 429)
        gen.assert_not_called()
        self.db.expire_all()
        self.assertEqual(self.db.query(DailyInsight).filter(DailyInsight.user_id == self.uid).count(), 0)

    def test_uso_de_ontem_e_de_outras_funcionalidades_ou_usuarios_nao_conta(self):
        settings.ai_insight_daily_limit = "1"
        self.add_usage(5, when=datetime.utcnow() - timedelta(days=2))
        self.add_usage(5, feature="meal_photo")
        self.add_usage(5, user=self.other)
        self.assertEqual(self.generate().status_code, 201)

    def test_teto_e_por_usuario(self):
        settings.ai_insight_daily_limit = "1"
        self._make_pro(self.other)
        self.add_usage(1)
        self.assertEqual(self.generate().status_code, 429)
        self.assertEqual(self.generate(headers=self._headers(self.other)).status_code, 201)

    def test_teto_zero_desliga_a_geracao(self):
        settings.ai_insight_daily_limit = "0"
        self.assertEqual(self.generate().status_code, 429)

    def test_valor_invalido_ou_vazio_ou_negativo_usa_o_padrao(self):
        for raw in ("", "abc", "-3", "  ", "1.5"):
            settings.ai_insight_daily_limit = raw
            self.assertEqual(ai_usage.insight_daily_limit(), ai_usage.AI_INSIGHT_DAILY_LIMIT_DEFAULT, repr(raw))
        settings.ai_insight_daily_limit = "7"
        self.assertEqual(ai_usage.insight_daily_limit(), 7)

    def test_sem_assinatura_pro_continua_402_antes_do_teto(self):
        settings.ai_insight_daily_limit = "0"
        r = self.generate(headers=self._headers(self.other))  # self.other nao e Pro
        self.assertEqual(r.status_code, 402)

    def test_outras_rotas_nao_tem_o_teto(self):
        """O teto vale so para POST /insights/generate por enquanto (GET /insights/daily nao o aplica)."""
        settings.ai_insight_daily_limit = "0"
        self.assertEqual(self.client.get("/insights/daily", headers=self.headers).status_code, 200)


class AiClientLimitsTests(unittest.TestCase):
    def test_cliente_tem_timeout_e_retry_explicitos(self):
        from app.services import ai_client

        client = ai_client.get_client()
        self.assertEqual(client.max_retries, ai_client.MAX_RETRIES)
        self.assertEqual(client.max_retries, 1)
        self.assertEqual(client.timeout.read, 60.0)
        self.assertEqual(client.timeout.connect, 10.0)

    def test_ids_de_modelo_nao_mudaram(self):
        from app.services import ai_client

        self.assertEqual(ai_client.MODEL, "claude-opus-4-8")
        self.assertEqual(ai_client.LIGHT_MODEL, "claude-sonnet-5")


# ---------------------------------------------------------------------------------------------------------------- B3: flags


class FeaturesTests(Base_):
    def test_exige_login(self):
        self.assertEqual(self.client.get("/features").status_code, 401)

    def test_padrao_e_tudo_desligado(self):
        self.assertIs(Settings.model_fields["sleep_api_enabled"].default, False)
        self.assertIs(Settings.model_fields["agent_enabled"].default, False)
        with mock.patch.object(settings, "sleep_api_enabled", False), mock.patch.object(settings, "agent_enabled", False):
            r = self.client.get("/features", headers=self.headers)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"sleep_api_enabled": False, "agent_enabled": False})

    def test_reflete_as_chaves_ligadas(self):
        with mock.patch.object(settings, "sleep_api_enabled", True), mock.patch.object(settings, "agent_enabled", False):
            self.assertEqual(self.client.get("/features", headers=self.headers).json(), {"sleep_api_enabled": True, "agent_enabled": False})
        with mock.patch.object(settings, "sleep_api_enabled", False), mock.patch.object(settings, "agent_enabled", True):
            self.assertEqual(self.client.get("/features", headers=self.headers).json(), {"sleep_api_enabled": False, "agent_enabled": True})

    def test_nao_exige_pro(self):
        r = self.client.get("/features", headers=self.headers)  # self.user nao e Pro
        self.assertEqual(r.status_code, 200)

    def test_rotas_de_sono_e_do_agente_nao_existem_ainda(self):
        paths = {getattr(route, "path", "") for route in app.routes}
        self.assertFalse([p for p in paths if p.startswith("/sleep") or p.startswith("/agent")])


# ---------------------------------------------------------------------------------------------------------------- B4: exclusao


class DeletionBase(Base_):
    """Base da exclusao de conta: sem rede (midia e RevenueCat simulados)."""

    def setUp(self):
        super().setUp()
        self.patches = [
            mock.patch.object(account_deletion, "delete_user_media_by_url", return_value=True),
            mock.patch.object(account_deletion, "delete_stored_key", return_value=True),
            mock.patch.object(revenuecat_api, "_request"),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        super().tearDown()


class AccountDeletionNewTablesTests(DeletionBase):
    def test_toda_tabela_com_fk_para_users_esta_coberta(self):
        """Rede de seguranca por introspeccao: tabela nova que aponte para users precisa entrar na exclusao de conta."""
        missing = []
        for table in Base.metadata.tables.values():
            if any(fk.column.table.name == "users" for fk in table.foreign_keys):
                if table.name not in account_deletion.USER_OWNED_TABLES and table.name not in account_deletion.FK_ACTION_TABLES:
                    missing.append(table.name)
        self.assertEqual(missing, [])
        self.assertIn("ai_usage", account_deletion.USER_OWNED_TABLES)

    def test_tabelas_declaradas_existem_no_metadata(self):
        declared = set(account_deletion.USER_OWNED_TABLES) | set(account_deletion.FK_ACTION_TABLES)
        self.assertEqual(declared - set(Base.metadata.tables), set())

    def test_excluir_conta_apaga_uso_da_ia_e_fc_da_pessoa_e_so_dela(self):
        self.db.add_all(
            [
                AiUsage(user_id=self.uid, feature="daily_insight", model="m", input_tokens=5, output_tokens=6),
                AiUsage(user_id=self.uid, feature="meal_text", model="m", input_tokens=7, output_tokens=8),
                AiUsage(user_id=self.other.id, feature="daily_insight", model="m", input_tokens=1, output_tokens=1),
                HeartRateSample(user_id=self.uid, source="healthkit", bpm=70, recorded_at=datetime(2026, 11, 1, 10, 0, 0)),
                HeartRateSample(user_id=self.other.id, source="healthkit", bpm=70, recorded_at=datetime(2026, 11, 1, 10, 0, 0)),
            ]
        )
        self.db.commit()
        r = self.client.post("/users/me/delete", json={"password": PASSWORD, "confirmation": "EXCLUIR"}, headers=self.headers)
        self.assertEqual(r.status_code, 204, r.text)
        self.db.expire_all()
        self.assertIsNone(self.db.query(User.id).filter(User.id == self.uid).first())
        self.assertEqual(self.db.query(AiUsage).filter(AiUsage.user_id == self.uid).count(), 0)
        self.assertEqual(self.db.query(HeartRateSample).filter(HeartRateSample.user_id == self.uid).count(), 0)
        # os dados da outra pessoa ficam intactos
        self.assertEqual(self.db.query(AiUsage).filter(AiUsage.user_id == self.other.id).count(), 1)
        self.assertEqual(self.db.query(HeartRateSample).filter(HeartRateSample.user_id == self.other.id).count(), 1)



class AccountDeletionAvatarAttemptsTests(DeletionBase):
    """Regressao: avatar_attempts tem FK para users sem ON DELETE, entao a exclusao precisa apaga-la explicitamente (antes dava 500)."""

    def test_excluir_conta_de_quem_ja_tentou_gerar_avatar_apaga_as_tentativas(self):
        self.db.add_all([AvatarAttempt(user_id=self.uid), AvatarAttempt(user_id=self.uid), AvatarAttempt(user_id=self.other_id)])
        self.db.commit()
        r = self.client.post("/users/me/delete", json={"password": PASSWORD, "confirmation": "EXCLUIR"}, headers=self.headers)
        self.assertEqual(r.status_code, 204, r.text)
        self.db.expire_all()
        self.assertIsNone(self.db.query(User.id).filter(User.id == self.uid).first())
        self.assertEqual(self.db.query(AvatarAttempt).filter(AvatarAttempt.user_id == self.uid).count(), 0)
        self.assertEqual(self.db.query(AvatarAttempt).filter(AvatarAttempt.user_id == self.other_id).count(), 1)  # a de outra pessoa fica

    def test_avatar_attempts_esta_na_lista_de_exclusoes_simples(self):
        self.assertIn(AvatarAttempt, [model for model, _ in account_deletion._SIMPLE_DELETIONS])


if __name__ == "__main__":
    unittest.main()
