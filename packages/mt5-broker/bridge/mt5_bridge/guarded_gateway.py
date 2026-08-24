from __future__ import annotations

import uuid
from typing import Any

from .config import Settings
from .errors import BridgeError
from .ledger import IdempotencyLedger
from .live_arm import LiveArmDecision, evaluate_live_arm
from .mt5_gateway import Mt5Gateway


class GuardedMt5Gateway(Mt5Gateway):
    """MT5 gateway with a process-bound fail-closed guard for REAL mutations.

    The legacy real-account environment flags remain capability prerequisites,
    but they never authorize a REAL order by themselves. Every mutation still
    flows through Mt5Gateway._require_trading(), which dynamically dispatches
    to this override before order_send/order_check is reached.
    """

    def __init__(
        self,
        settings: Settings,
        ledger: IdempotencyLedger,
        module: Any | None = None,
    ) -> None:
        super().__init__(settings, ledger, module)
        self.bridge_session_id = uuid.uuid4().hex

    def _live_arm_decision(self, account: Any | None) -> LiveArmDecision:
        if account is None:
            return LiveArmDecision(False, "ACCOUNT_UNAVAILABLE")
        return evaluate_live_arm(
            path=self.settings.live_arm_state_path,
            bridge_session_id=self.bridge_session_id,
            configured_account_mode=self.settings.account_mode,
            account_login=int(getattr(account, "login", 0) or 0),
            account_server=str(getattr(account, "server", "") or ""),
            terminal_path=self.settings.terminal_path,
            compatibility_enabled=self.settings.live_compatibility_enabled,
        )

    def health(self) -> dict[str, Any]:
        base = super().health()
        connected = bool(base.get("connected"))
        actual_mode = str(base.get("accountMode") or "")

        decision = LiveArmDecision(False, "NOT_REQUIRED")
        if connected and actual_mode == "real":
            with self._lock:
                _, account = self._connection_snapshot_locked(reconnect=True)
            decision = self._live_arm_decision(account)
        elif connected and self.settings.account_mode == "LIVE":
            decision = LiveArmDecision(False, "ACCOUNT_MODE_MISMATCH")

        return {
            **base,
            "configuredAccountMode": self.settings.account_mode,
            "bridgeSessionId": self.bridge_session_id,
            "liveArmRequired": actual_mode == "real" or self.settings.account_mode == "LIVE",
            "liveExecutionArmed": bool(decision.armed),
            "liveArmStatus": "ARMED" if decision.armed else ("NOT_REQUIRED" if decision.reason == "NOT_REQUIRED" else "DISARMED"),
            "liveArmReason": decision.reason,
        }

    def _require_trading(self) -> None:
        # Preserve every existing bridge-level check first: trading switch,
        # connectivity, allowlist, real-account capability and AutoTrading.
        super()._require_trading()

        with self._lock:
            terminal, account = self._connection_snapshot_locked(reconnect=True)
        if terminal is None or account is None:
            raise BridgeError("MT5 terminal is disconnected", 503, "TERMINAL_DISCONNECTED")

        actual_mode = self._account_mode(int(account.trade_mode))
        configured = self.settings.account_mode
        expected_actual = "real" if configured == "LIVE" else "demo"
        if actual_mode != expected_actual:
            raise BridgeError(
                f"Configured account mode {configured} does not match connected MT5 mode {actual_mode}",
                423,
                "ACCOUNT_MODE_MISMATCH",
            )

        if actual_mode != "real":
            return

        decision = self._live_arm_decision(account)
        if not decision.armed:
            raise BridgeError(
                f"LIVE execution is DISARMED: {decision.reason}",
                423,
                "LIVE_EXECUTION_DISARMED",
            )
