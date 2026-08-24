import json
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace

from mt5_bridge.config import Settings
from mt5_bridge.errors import BridgeError
from mt5_bridge.guarded_gateway import GuardedMt5Gateway
from mt5_bridge.ledger import IdempotencyLedger
from mt5_bridge.live_arm import evaluate_live_arm, profile_fingerprint


class RealFakeMt5:
    ACCOUNT_TRADE_MODE_DEMO = 0
    ACCOUNT_TRADE_MODE_CONTEST = 1

    def initialize(self, **_):
        return True

    def shutdown(self):
        return None

    def last_error(self):
        return (0, "ok")

    def version(self):
        return (500, 5735, "test")

    def terminal_info(self):
        return SimpleNamespace(trade_allowed=True)

    def account_info(self):
        return SimpleNamespace(
            login=900001,
            trade_mode=2,
            trade_allowed=True,
            trade_expert=True,
            server="Broker-Live",
        )


def make_settings(ledger_path: Path, arm_path: Path, compatibility: bool = True) -> Settings:
    return Settings(
        host="127.0.0.1",
        port=8765,
        api_key="0123456789abcdef",
        trading_enabled=True,
        allow_real_account=True,
        allowed_logins=frozenset({900001}),
        terminal_path=r"C:\MT5-LIVE\terminal64.exe",
        login=900001,
        password=None,
        server="Broker-Live",
        portable=False,
        initialize_timeout_ms=60000,
        fail_startup_if_disconnected=True,
        symbol_map={"XAUUSD": "XAUUSD.G"},
        max_spread_points={"XAUUSD": 65},
        magic_number=270715,
        deviation_points=50,
        ledger_path=ledger_path,
        log_level="INFO",
        account_mode="LIVE",
        live_arm_state_path=arm_path,
        live_compatibility_enabled=compatibility,
    )


def write_valid_arm(path: Path, session_id: str, *, expires_delta_ms: int = 120000) -> None:
    now = int(time.time() * 1000)
    path.write_text(
        json.dumps(
            {
                "version": 1,
                "armed": True,
                "accountMode": "LIVE",
                "bridgeSessionId": session_id,
                "accountLogin": 900001,
                "server": "Broker-Live",
                "profileFingerprint": profile_fingerprint(
                    "LIVE", 900001, "Broker-Live", r"C:\MT5-LIVE\terminal64.exe"
                ),
                "armedAt": now,
                "expiresAt": now + expires_delta_ms,
            }
        ),
        encoding="utf-8",
    )


class LiveArmTests(unittest.TestCase):
    def test_compatibility_flag_alone_is_not_an_arm(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            arm = root / "live-arm.json"
            decision = evaluate_live_arm(
                path=arm,
                bridge_session_id="session-a",
                configured_account_mode="LIVE",
                account_login=900001,
                account_server="Broker-Live",
                terminal_path=r"C:\MT5-LIVE\terminal64.exe",
                compatibility_enabled=True,
            )
            self.assertFalse(decision.armed)
            self.assertEqual(decision.reason, "ARM_FILE_MISSING")

    def test_missing_corrupt_expired_and_mismatched_arm_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            arm = root / "live-arm.json"
            common = dict(
                path=arm,
                bridge_session_id="session-a",
                configured_account_mode="LIVE",
                account_login=900001,
                account_server="Broker-Live",
                terminal_path=r"C:\MT5-LIVE\terminal64.exe",
                compatibility_enabled=True,
            )

            arm.write_text("{broken", encoding="utf-8")
            self.assertEqual(evaluate_live_arm(**common).reason, "ARM_FILE_INVALID_JSON")

            write_valid_arm(arm, "wrong-session")
            self.assertEqual(evaluate_live_arm(**common).reason, "ARM_BRIDGE_SESSION_MISMATCH")

            write_valid_arm(arm, "session-a", expires_delta_ms=-1)
            self.assertEqual(evaluate_live_arm(**common).reason, "ARM_EXPIRED")

            write_valid_arm(arm, "session-a")
            wrong_login = {**common, "account_login": 900002}
            self.assertEqual(evaluate_live_arm(**wrong_login).reason, "ARM_LOGIN_MISMATCH")

    def test_exact_current_arm_passes_and_bridge_restart_invalidates_it(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            arm = root / "live-arm.json"
            ledger_path = root / "ledger.sqlite3"

            first_ledger = IdempotencyLedger(ledger_path)
            first = GuardedMt5Gateway(
                make_settings(ledger_path, arm), first_ledger, RealFakeMt5()
            )
            self.assertTrue(first.start())

            with self.assertRaises(BridgeError) as blocked:
                first._require_trading()
            self.assertEqual(blocked.exception.code, "LIVE_EXECUTION_DISARMED")

            write_valid_arm(arm, first.bridge_session_id)
            first._require_trading()
            health = first.health()
            self.assertTrue(health["liveExecutionArmed"])
            self.assertEqual(health["liveArmStatus"], "ARMED")
            first.stop()

            second_ledger = IdempotencyLedger(root / "ledger-2.sqlite3")
            second = GuardedMt5Gateway(
                make_settings(root / "ledger-2.sqlite3", arm),
                second_ledger,
                RealFakeMt5(),
            )
            self.assertTrue(second.start())
            with self.assertRaises(BridgeError) as stale:
                second._require_trading()
            self.assertEqual(stale.exception.code, "LIVE_EXECUTION_DISARMED")
            self.assertEqual(second.health()["liveArmReason"], "ARM_BRIDGE_SESSION_MISMATCH")
            second.stop()

    def test_demo_settings_do_not_require_live_arm(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            decision = evaluate_live_arm(
                path=root / "missing.json",
                bridge_session_id="demo-session",
                configured_account_mode="DEMO",
                account_login=123456,
                account_server="Demo",
                terminal_path=r"C:\MT5-DEMO\terminal64.exe",
                compatibility_enabled=False,
            )
            self.assertFalse(decision.armed)
            self.assertEqual(decision.reason, "LIVE_NOT_SELECTED")


if __name__ == "__main__":
    unittest.main()
