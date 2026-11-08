"""Testes da assinatura Pro por compra no app: webhook do RevenueCat, /subscriptions/iap/sync e a regra de acesso Pro.

Rodam contra um Postgres DESCARTAVEL, nunca contra o banco do .env: exigem TRYV_TEST_DATABASE_URL apontando para
localhost e para um banco cujo nome comece com "tryv_test". O banco e criado do zero por `alembic upgrade head` (o que tambem
exercita a migration). Nenhuma chamada de rede: eventos simulados, sem chave do RevenueCat nem do Stripe.

Uso (a partir de backend/):
    set TRYV_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/tryv_test_xxx
    venv\\Scripts\\python.exe -I -m unittest discover -s tests -v
"""
import os
import sys
import time
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

TEST_DB_URL = os.environ.get("TRYV_TEST_DATABASE_URL", "")
_parsed = urlparse(TEST_DB_URL) if TEST_DB_URL else None
if not (_parsed and _parsed.hostname in ("localhost", "127.0.0.1") and _parsed.path.lstrip("/").startswith("tryv_test")):
    raise unittest.SkipTest("defina TRYV_TEST_DATABASE_URL (localhost, banco tryv_test*) para rodar estes testes")

# ANTES de importar o app: o .env/valores padrao nunca podem apontar para outro banco.
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["REVENUECAT_WEBHOOK_AUTH"] = "segredo-de-teste"
os.environ["REVENUECAT_PRO_ENTITLEMENT"] = "pro"
os.environ["STRIPE_SECRET_KEY"] = ""
os.environ["STRIPE_WEBHOOK_SECRET"] = ""
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import settings  # noqa: E402

assert settings.database_url == TEST_DB_URL
# Quando outro modulo de teste ja importou `settings` antes (discover), as variaveis de ambiente acima chegam tarde: fixa direto.
settings.revenuecat_webhook_auth = "segredo-de-teste"
settings.revenuecat_pro_entitlement = "pro"

_cfg = Config(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "alembic.ini"))
_cfg.set_main_option("script_location", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "alembic"))
command.upgrade(_cfg, "head")

# O env.py do Alembic chama fileConfig(), que DESLIGA os loggers ja criados (disable_existing_loggers): religa-os para os testes de log.
import logging  # noqa: E402

for _logger in logging.root.manager.loggerDict.values():
    if isinstance(_logger, logging.Logger):
        _logger.disabled = False

from app.core.database import SessionLocal  # noqa: E402
from app.core.deps import has_active_pro_subscription  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.main import app  # noqa: E402
from app.models.subscription import Subscription, SubscriptionWebhookEvent  # noqa: E402
from app.models.user import User  # noqa: E402

AUTH = {"Authorization": "segredo-de-teste"}


def ms(delta_seconds: float) -> int:
    return int((time.time() + delta_seconds) * 1000)


class RevenueCatBase(unittest.TestCase):
    client = TestClient(app)

    def setUp(self):
        self.db = SessionLocal()
        self.user = User(name="Teste", email=f"{uuid.uuid4().hex}@example.invalid", hashed_password="x")
        self.db.add(self.user)
        self.db.commit()
        self.uid = str(self.user.id)

    def tearDown(self):
        self.db.rollback()
        self.db.query(Subscription).filter(Subscription.user_id == self.user.id).delete()
        self.db.query(User).filter(User.id == self.user.id).delete()
        self.db.commit()
        self.db.close()

    def event(self, type_="INITIAL_PURCHASE", **over):
        base = {
            "id": str(uuid.uuid4()),
            "type": type_,
            "app_user_id": self.uid,
            "product_id": "tryv_pro_monthly",
            "entitlement_ids": ["pro"],
            "expiration_at_ms": ms(30 * 86400),
            "event_timestamp_ms": ms(0),
            "environment": "SANDBOX",
        }
        base.update(over)
        return base

    def post(self, event, headers=AUTH):
        return self.client.post("/webhooks/revenuecat", json={"api_version": "1.0", "event": event}, headers=headers)

    def sub(self):
        self.db.expire_all()
        return (
            self.db.query(Subscription)
            .filter(Subscription.user_id == self.user.id, Subscription.provider == "revenuecat")
            .first()
        )

    def is_pro(self):
        self.db.expire_all()
        return has_active_pro_subscription(self.db, self.user.id)

    def sync(self):
        token = create_access_token({"sub": self.uid})
        return self.client.post("/subscriptions/iap/sync", headers={"Authorization": f"Bearer {token}"})


class WebhookAuthTests(RevenueCatBase):
    def test_segredo_invalido_401_e_nada_gravado(self):
        r = self.post(self.event(), headers={"Authorization": "errado"})
        self.assertEqual(r.status_code, 401)
        self.assertIsNone(self.sub())

    def test_sem_header_401(self):
        self.assertEqual(self.post(self.event(), headers={}).status_code, 401)

    def test_aceita_bearer(self):
        r = self.post(self.event(), headers={"Authorization": "Bearer segredo-de-teste"})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(self.is_pro())

    def test_segredo_nao_configurado_503(self):
        original = settings.revenuecat_webhook_auth
        settings.revenuecat_webhook_auth = ""
        try:
            self.assertEqual(self.post(self.event()).status_code, 503)
        finally:
            settings.revenuecat_webhook_auth = original

    def test_payload_invalido_400(self):
        r = self.client.post("/webhooks/revenuecat", content=b"nao e json", headers=AUTH)
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/webhooks/revenuecat", json={"sem": "event"}, headers=AUTH)
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/webhooks/revenuecat", json={"event": {"type": "RENEWAL"}}, headers=AUTH)
        self.assertEqual(r.status_code, 400)


class WebhookEventTests(RevenueCatBase):
    def test_compra_inicial_ativa_o_pro(self):
        self.assertFalse(self.is_pro())
        self.assertEqual(self.post(self.event()).status_code, 200)
        s = self.sub()
        self.assertEqual((s.status, s.type, s.provider, s.product_id, s.environment), ("active", "base", "revenuecat", "tryv_pro_monthly", "sandbox"))
        self.assertEqual(s.provider_customer_id, self.uid)
        self.assertIsNotNone(s.expires_at)
        self.assertTrue(self.is_pro())

    def test_renovacao_estende_expires_at_na_mesma_linha(self):
        self.post(self.event())
        first = self.sub().expires_at
        self.post(self.event("RENEWAL", expiration_at_ms=ms(60 * 86400), event_timestamp_ms=ms(1)))
        self.db.expire_all()
        rows = self.db.query(Subscription).filter(Subscription.user_id == self.user.id).all()
        self.assertEqual(len(rows), 1)
        self.assertGreater(rows[0].expires_at, first)
        self.assertTrue(self.is_pro())

    def test_cancelamento_por_desligar_renovacao_mantem_acesso_ate_expirar(self):
        self.post(self.event())
        self.post(self.event("CANCELLATION", cancel_reason="UNSUBSCRIBE", event_timestamp_ms=ms(1)))
        self.assertEqual(self.sub().status, "active")
        self.assertTrue(self.is_pro())

    def test_expiracao_tira_o_pro(self):
        self.post(self.event())
        self.post(self.event("EXPIRATION", expiration_at_ms=ms(-60), event_timestamp_ms=ms(1)))
        self.assertEqual(self.sub().status, "canceled")
        self.assertFalse(self.is_pro())

    def test_estorno_tira_o_pro_na_hora_mesmo_com_periodo_futuro(self):
        self.post(self.event())
        self.post(self.event("CANCELLATION", cancel_reason="CUSTOMER_SUPPORT", event_timestamp_ms=ms(1)))
        self.assertEqual(self.sub().status, "canceled")
        self.assertFalse(self.is_pro())

    def test_troca_de_produto_atualiza_o_produto(self):
        self.post(self.event())
        self.post(self.event("PRODUCT_CHANGE", new_product_id="tryv_pro_yearly", event_timestamp_ms=ms(1)))
        self.assertEqual(self.sub().product_id, "tryv_pro_yearly")
        self.assertTrue(self.is_pro())

    def test_problema_de_cobranca_com_carencia_mantem_acesso_ate_o_fim_da_carencia(self):
        self.post(self.event())
        self.post(self.event("BILLING_ISSUE", expiration_at_ms=ms(-3600), grace_period_expiration_at_ms=ms(86400), event_timestamp_ms=ms(1)))
        self.assertEqual(self.sub().status, "past_due")
        self.assertTrue(self.is_pro())

    def test_problema_de_cobranca_sem_carencia_nao_da_acesso(self):
        self.post(self.event())
        self.post(self.event("BILLING_ISSUE", expiration_at_ms=ms(-3600), event_timestamp_ms=ms(1)))
        self.assertFalse(self.is_pro())

    def test_evento_repetido_e_idempotente(self):
        ev = self.event()
        self.assertEqual(self.post(ev).status_code, 200)
        first_last_event = self.sub().last_event_at
        self.assertEqual(self.post(ev).status_code, 200)
        self.assertEqual(self.db.query(SubscriptionWebhookEvent).filter_by(event_id=ev["id"]).count(), 1)
        self.assertEqual(self.sub().last_event_at, first_last_event)
        self.assertEqual(self.db.query(Subscription).filter(Subscription.user_id == self.user.id).count(), 1)

    def test_evento_repetido_nao_desfaz_estado_mais_novo(self):
        ev = self.event()
        self.post(ev)
        self.post(self.event("EXPIRATION", expiration_at_ms=ms(-60), event_timestamp_ms=ms(5)))
        self.post(ev)  # reentrega do evento antigo (mesmo id)
        self.assertFalse(self.is_pro())

    def test_evento_fora_de_ordem_e_ignorado(self):
        self.post(self.event("EXPIRATION", expiration_at_ms=ms(-60), event_timestamp_ms=ms(10)))
        self.post(self.event("INITIAL_PURCHASE", event_timestamp_ms=ms(1)))  # mais antigo, chegou depois
        self.assertEqual(self.sub().status, "canceled")
        self.assertFalse(self.is_pro())

    def test_usuario_inexistente_responde_200_e_nao_grava(self):
        r = self.post(self.event(app_user_id=str(uuid.uuid4())))
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(self.sub())

    def test_id_anonimo_do_revenuecat_e_ignorado(self):
        r = self.post(self.event(app_user_id="$RCAnonymousID:abc123"))
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(self.sub())

    def test_alias_com_id_do_usuario_e_resolvido(self):
        r = self.post(self.event(app_user_id="$RCAnonymousID:abc123", aliases=["$RCAnonymousID:abc123", self.uid]))
        self.assertEqual(r.status_code, 200)
        self.assertTrue(self.is_pro())

    def test_entitlement_diferente_e_ignorado(self):
        self.post(self.event(entitlement_ids=["outro"]))
        self.assertIsNone(self.sub())

    def test_tipo_ignorado_responde_200(self):
        self.assertEqual(self.post(self.event("TEST")).status_code, 200)
        self.assertIsNone(self.sub())

    def test_compra_sem_data_de_expiracao_nao_concede_acesso(self):
        self.post(self.event(expiration_at_ms=None))
        self.assertIsNone(self.sub())
        self.assertFalse(self.is_pro())

    def test_producao_e_sandbox_ficam_registrados(self):
        self.post(self.event(environment="PRODUCTION"))
        self.assertEqual(self.sub().environment, "production")


class AccessRuleTests(RevenueCatBase):
    def add(self, **kw):
        row = Subscription(user_id=self.user.id, type="base", **kw)
        self.db.add(row)
        self.db.commit()
        return row

    def test_stripe_com_expires_at_nulo_continua_valendo_pelo_status(self):
        self.add(provider="stripe", stripe_subscription_id="sub_x", status="active", expires_at=None)
        self.assertTrue(self.is_pro())

    def test_linha_antiga_sem_provider_continua_valendo(self):
        self.add(status="active")
        self.assertTrue(self.is_pro())

    def test_stripe_past_due_nao_da_acesso(self):
        self.add(provider="stripe", stripe_subscription_id="sub_y", status="past_due")
        self.assertFalse(self.is_pro())

    def test_ativa_mas_expirada_nao_da_acesso(self):
        self.add(provider="revenuecat", status="active", expires_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=1))
        self.assertFalse(self.is_pro())

    def test_trainer_addon_nao_e_pro(self):
        row = Subscription(user_id=self.user.id, type="trainer_addon", status="active")
        self.db.add(row)
        self.db.commit()
        self.assertFalse(self.is_pro())


class SyncEndpointTests(RevenueCatBase):
    def test_sem_token_401(self):
        self.assertEqual(self.client.post("/subscriptions/iap/sync").status_code, 401)

    def test_sem_registro_devolve_pending(self):
        body = self.sync().json()
        self.assertEqual((body["is_pro"], body["pending"], body["status"]), (False, True, None))

    def test_depois_do_webhook_devolve_pro(self):
        self.post(self.event())
        body = self.sync().json()
        self.assertEqual((body["is_pro"], body["pending"], body["status"], body["environment"]), (True, False, "active", "sandbox"))

    def test_expirada_devolve_nao_pro_e_nao_pending(self):
        self.post(self.event())
        self.post(self.event("EXPIRATION", expiration_at_ms=ms(-60), event_timestamp_ms=ms(1)))
        body = self.sync().json()
        self.assertEqual((body["is_pro"], body["pending"], body["status"]), (False, False, "canceled"))

    def test_corpo_do_cliente_e_ignorado(self):
        token = create_access_token({"sub": self.uid})
        r = self.client.post("/subscriptions/iap/sync", json={"is_pro": True, "expires_at": "2099-01-01T00:00:00"}, headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()["is_pro"])
        self.assertFalse(self.is_pro())


if __name__ == "__main__":
    unittest.main()
