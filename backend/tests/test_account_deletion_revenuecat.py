"""Testes do pedido de exclusao do assinante no RevenueCat durante a exclusao de conta (services/revenuecat_api.py e
services/account_deletion.py). A chamada de rede e SEMPRE simulada (patch de `revenuecat_api._request`): nenhuma chave real, nenhuma
rede. Rodam so contra um Postgres DESCARTAVEL em localhost (TRYV_TEST_DATABASE_URL, banco tryv_test*), como
test_revenuecat_subscription.py; sem a variavel, pulam.
"""
import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta
from unittest import mock
from urllib.parse import urlparse

TEST_DB_URL = os.environ.get("TRYV_TEST_DATABASE_URL", "")
_parsed = urlparse(TEST_DB_URL) if TEST_DB_URL else None
if not (_parsed and _parsed.hostname in ("localhost", "127.0.0.1") and _parsed.path.lstrip("/").startswith("tryv_test")):
    raise unittest.SkipTest("defina TRYV_TEST_DATABASE_URL (localhost, banco tryv_test*) para rodar estes testes")

os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["REVENUECAT_API_SECRET"] = ""
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402

from app.core.config import settings  # noqa: E402

assert settings.database_url == TEST_DB_URL

_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_cfg = Config(os.path.join(_root, "alembic.ini"))
_cfg.set_main_option("script_location", os.path.join(_root, "alembic"))
command.upgrade(_cfg, "head")

# O env.py do Alembic chama fileConfig(), que DESLIGA os loggers ja criados (disable_existing_loggers): religa-os para os testes de log.
import logging  # noqa: E402

for _logger in logging.root.manager.loggerDict.values():
    if isinstance(_logger, logging.Logger):
        _logger.disabled = False

from app import models  # noqa: E402,F401
from app.core.database import SessionLocal  # noqa: E402
from app.models.subscription import Subscription  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import account_deletion, revenuecat_api  # noqa: E402
from app.services.revenuecat_api import RevenueCatDeleteError, delete_subscriber  # noqa: E402


def response(status: int) -> httpx.Response:
    return httpx.Response(status, request=httpx.Request("DELETE", "https://api.revenuecat.com/v1/subscribers/x"))


class SecretMixin:
    def setUp(self):
        self._old_secret = settings.revenuecat_api_secret
        settings.revenuecat_api_secret = "segredo-de-teste"

    def tearDown(self):
        settings.revenuecat_api_secret = self._old_secret


class DeleteSubscriberApiTests(SecretMixin, unittest.TestCase):
    def test_sem_variavel_nao_chama_a_rede(self):
        settings.revenuecat_api_secret = ""
        with mock.patch.object(revenuecat_api, "_request") as request:
            self.assertFalse(delete_subscriber(str(uuid.uuid4())))
        request.assert_not_called()

    def test_sucesso_usa_delete_na_url_e_no_cabecalho_certos(self):
        uid = str(uuid.uuid4())
        with mock.patch.object(revenuecat_api, "_request", return_value=response(200)) as request:
            self.assertTrue(delete_subscriber(uid))
        method, url, headers = request.call_args.args
        self.assertEqual(method, "DELETE")
        self.assertEqual(url, f"https://api.revenuecat.com/v1/subscribers/{uid}")
        self.assertEqual(headers, {"Authorization": "Bearer segredo-de-teste"})

    def test_id_e_escapado_na_url(self):
        with mock.patch.object(revenuecat_api, "_request", return_value=response(200)) as request:
            delete_subscriber("a/b?c")
        self.assertEqual(request.call_args.args[1], "https://api.revenuecat.com/v1/subscribers/a%2Fb%3Fc")

    def test_404_assinante_inexistente_conta_como_sucesso(self):
        with mock.patch.object(revenuecat_api, "_request", return_value=response(404)):
            self.assertTrue(delete_subscriber(str(uuid.uuid4())))

    def test_401_e_500_levantam_erro_sem_vazar_a_chave(self):
        for status in (401, 500):
            with mock.patch.object(revenuecat_api, "_request", return_value=response(status)):
                with self.assertRaises(RevenueCatDeleteError) as ctx:
                    delete_subscriber(str(uuid.uuid4()))
            self.assertNotIn("segredo-de-teste", str(ctx.exception))

    def test_erro_de_rede_levanta_erro(self):
        with mock.patch.object(revenuecat_api, "_request", side_effect=httpx.ConnectTimeout("x")):
            with self.assertRaises(RevenueCatDeleteError):
                delete_subscriber(str(uuid.uuid4()))


class AccountDeletionRevenueCatTests(SecretMixin, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.db = SessionLocal()
        self.user = User(name="Teste", email=f"{uuid.uuid4().hex}@example.invalid", hashed_password="x", is_admin=False)
        self.db.add(self.user)
        self.db.commit()
        self.uid = self.user.id
        # S3 fora do teste: so o RevenueCat importa aqui.
        self._patches = [
            mock.patch.object(account_deletion, "delete_user_media_by_url", return_value=True),
            mock.patch.object(account_deletion, "delete_stored_key", return_value=True),
        ]
        for p in self._patches:
            p.start()

    def tearDown(self):
        for p in self._patches:
            p.stop()
        self.db.rollback()
        self.db.query(Subscription).filter(Subscription.user_id == self.uid).delete()
        self.db.query(User).filter(User.id == self.uid).delete()
        self.db.commit()
        self.db.close()
        super().tearDown()

    def user_exists(self) -> bool:
        self.db.expire_all()
        return self.db.query(User.id).filter(User.id == self.uid).first() is not None

    def delete(self):
        account_deletion.delete_user_account(self.db, self.user)

    def test_sucesso_pede_a_exclusao_do_assinante_com_o_id_do_usuario(self):
        self.db.add(Subscription(user_id=self.uid, type="base", provider="revenuecat", status="active", expires_at=datetime.utcnow() + timedelta(days=5)))
        self.db.commit()
        with mock.patch.object(revenuecat_api, "_request", return_value=response(200)) as request:
            self.delete()
        self.assertFalse(self.user_exists())
        request.assert_called_once()
        self.assertEqual(request.call_args.args[1], f"https://api.revenuecat.com/v1/subscribers/{self.uid}")

    def test_falha_do_revenuecat_nao_bloqueia_a_exclusao_e_registra_aviso(self):
        with mock.patch.object(revenuecat_api, "_request", return_value=response(500)):
            with self.assertLogs("app.services.account_deletion", level="WARNING") as logs:
                self.delete()
        self.assertFalse(self.user_exists())
        joined = "\n".join(logs.output)
        self.assertIn("account_deletion_revenuecat_failed", joined)
        self.assertIn(str(self.uid), joined)
        self.assertNotIn("segredo-de-teste", joined)

    def test_erro_de_rede_tambem_nao_bloqueia(self):
        with mock.patch.object(revenuecat_api, "_request", side_effect=httpx.ConnectError("x")):
            self.delete()
        self.assertFalse(self.user_exists())

    def test_variavel_ausente_pula_a_etapa_sem_chamar_a_rede(self):
        settings.revenuecat_api_secret = ""
        with mock.patch.object(revenuecat_api, "_request") as request:
            self.delete()
        self.assertFalse(self.user_exists())
        request.assert_not_called()

    def test_usuario_sem_assinatura_404_do_revenuecat_e_sucesso_sem_aviso(self):
        with mock.patch.object(revenuecat_api, "_request", return_value=response(404)):
            with self.assertNoLogs("app.services.account_deletion", level="WARNING"):
                self.delete()
        self.assertFalse(self.user_exists())


class AccountDeletionSemStripeTests(SecretMixin, unittest.TestCase):
    """Depois da remocao do Stripe: a exclusao nao chama (nem importa) nada do Stripe, apaga dados e avatares, e o RevenueCat
    segue como melhor esforco (ignorado se REVENUECAT_API_SECRET estiver vazio)."""

    PASSWORD = "senha-de-teste-123"

    def setUp(self):
        super().setUp()
        from fastapi.testclient import TestClient

        from app.core.security import create_access_token, hash_password
        from app.main import app

        self.app = app
        self.client = TestClient(app)
        self.db = SessionLocal()
        self.avatar_url = "https://exemplo.invalid/avatar.jpg"
        self.keys = ["private/profile/a", "private/profile/b", "avatars/c", "avatars/d"]
        self.user = User(
            name="Teste",
            email=f"{uuid.uuid4().hex}@example.invalid",
            hashed_password=hash_password(self.PASSWORD),
            is_admin=False,
            avatar_url=self.avatar_url,
            profile_photo_key=self.keys[0],
            profile_photo_thumb_key=self.keys[1],
            generated_avatar_key=self.keys[2],
            generated_avatar_thumb_key=self.keys[3],
        )
        self.db.add(self.user)
        self.db.commit()
        self.uid = self.user.id
        self.headers = {"Authorization": f"Bearer {create_access_token({'sub': str(self.uid)})}"}
        self.media = mock.patch.object(account_deletion, "delete_user_media_by_url", return_value=True)
        self.keys_mock = mock.patch.object(account_deletion, "delete_stored_key", return_value=True)
        self.media_mock = self.media.start()
        self.stored_mock = self.keys_mock.start()

    def tearDown(self):
        self.media.stop()
        self.keys_mock.stop()
        self.db.rollback()
        self.db.query(Subscription).filter(Subscription.user_id == self.uid).delete()
        self.db.query(User).filter(User.id == self.uid).delete()
        self.db.commit()
        self.db.close()
        super().tearDown()

    def user_exists(self) -> bool:
        self.db.expire_all()
        return self.db.query(User.id).filter(User.id == self.uid).first() is not None

    def subscriptions_count(self) -> int:
        self.db.expire_all()
        return self.db.query(Subscription).filter(Subscription.user_id == self.uid).count()

    def delete_via_api(self, password: str | None = None):
        return self.client.post(
            "/users/me/delete",
            json={"password": password or self.PASSWORD, "confirmation": "EXCLUIR"},
            headers=self.headers,
        )

    def test_codigo_nao_tem_mais_stripe(self):
        self.assertFalse(hasattr(account_deletion, "stripe"))
        self.assertFalse(hasattr(account_deletion, "AccountDeletionStripeError"))
        self.assertNotIn("stripe", sys.modules)
        paths = {getattr(route, "path", "") for route in self.app.routes}
        self.assertNotIn("/webhooks/stripe", paths)
        self.assertNotIn("/subscriptions/pro/checkout", paths)
        # As rotas do RevenueCat continuam registradas (o comportamento delas e coberto em test_revenuecat_subscription.py).
        self.assertIn("/webhooks/revenuecat", paths)
        self.assertIn("/subscriptions/iap/sync", paths)

    def test_usuario_sem_assinatura_apaga_dados_e_avatares_sem_rede(self):
        settings.revenuecat_api_secret = ""
        with mock.patch.object(revenuecat_api, "_request") as request:
            response_ = self.delete_via_api()
        self.assertEqual(response_.status_code, 204, response_.text)
        self.assertFalse(self.user_exists())
        request.assert_not_called()  # RevenueCat sem chave: pulado em silencio
        self.media_mock.assert_any_call(self.avatar_url)
        self.assertEqual(sorted(c.args[0] for c in self.stored_mock.call_args_list), sorted(self.keys))

    def test_usuario_com_assinatura_do_app_apaga_tudo_e_pede_exclusao_ao_revenuecat(self):
        self.db.add(
            Subscription(
                user_id=self.uid, type="base", provider="revenuecat", status="active",
                expires_at=datetime.utcnow() + timedelta(days=5),
            )
        )
        self.db.commit()
        with mock.patch.object(revenuecat_api, "_request", return_value=response(200)) as request:
            response_ = self.delete_via_api()
        self.assertEqual(response_.status_code, 204, response_.text)
        self.assertFalse(self.user_exists())
        self.assertEqual(self.subscriptions_count(), 0)
        request.assert_called_once()
        self.assertEqual(request.call_args.args[1], f"https://api.revenuecat.com/v1/subscribers/{self.uid}")
        self.assertEqual(len(self.stored_mock.call_args_list), len(self.keys))

    def test_falha_do_revenuecat_nao_vira_erro_para_o_usuario(self):
        with mock.patch.object(revenuecat_api, "_request", return_value=response(500)):
            response_ = self.delete_via_api()
        self.assertEqual(response_.status_code, 204, response_.text)
        self.assertFalse(self.user_exists())

    def test_dados_legados_do_stripe_nao_bloqueiam_nem_chamam_nada(self):
        # Linha antiga do Stripe + stripe_customer_id: a exclusao so apaga as linhas locais (nao ha mais cliente Stripe).
        self.user.stripe_customer_id = "cus_legado"
        self.db.add(Subscription(user_id=self.uid, type="base", provider="stripe", stripe_subscription_id="sub_legado", status="active"))
        self.db.commit()
        settings.revenuecat_api_secret = ""
        response_ = self.delete_via_api()
        self.assertEqual(response_.status_code, 204, response_.text)
        self.assertFalse(self.user_exists())
        self.assertEqual(self.subscriptions_count(), 0)

    def test_senha_errada_nao_apaga_nada(self):
        with mock.patch.object(revenuecat_api, "_request") as request:
            response_ = self.delete_via_api(password="senha-errada")
        self.assertEqual(response_.status_code, 401)
        self.assertTrue(self.user_exists())
        request.assert_not_called()
        self.stored_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
