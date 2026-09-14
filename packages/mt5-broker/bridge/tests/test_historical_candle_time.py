from __future__ import annotations

import os
import sys
import threading
import unittest
from datetime import datetime, timezone
from pathlib import Path


BRIDGE_ROOT = Path(__file__).resolve().parents[1]
if str(BRIDGE_ROOT) not in sys.path:
    sys.path.insert(0, str(BRIDGE_ROOT))

from mt5_bridge.historical_candles import historical_candles


class _Mt5:
    TIMEFRAME_M1 = 1
    TIMEFRAME_M5 = 5
    TIMEFRAME_M15 = 15
    TIMEFRAME_M30 = 30
    TIMEFRAME_H1 = 60
    TIMEFRAME_H4 = 240
    TIMEFRAME_D1 = 1440

    @staticmethod
    def last_error() -> tuple[int, str]:
        return (0, "ok")


class _Gateway:
    def __init__(self) -> None:
        self.mt5 = _Mt5()
        self._lock = threading.RLock()
        self.captured: dict[str, object] = {}

    def _ensure_symbol(self, canonical_symbol: str) -> str:
        return canonical_symbol

    def _read_with_reconnect_locked(
        self,
        method_name: str,
        *args: object,
        **kwargs: object,
    ) -> object:
        if method_name == "symbol_info":
            return type("Info", (), {"point": 0.01})()
        if method_name == "copy_rates_range":
            self.captured["method_name"] = method_name
            self.captured["args"] = args
            self.captured["kwargs"] = kwargs
            return []
        raise AssertionError(f"Unexpected MT5 method: {method_name}")


class HistoricalCandleBrokerTimeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_offset = os.environ.get("MT5_BROKER_TIME_OFFSET_SECONDS")
        os.environ["MT5_BROKER_TIME_OFFSET_SECONDS"] = "10800"

    def tearDown(self) -> None:
        if self.original_offset is None:
            os.environ.pop("MT5_BROKER_TIME_OFFSET_SECONDS", None)
        else:
            os.environ["MT5_BROKER_TIME_OFFSET_SECONDS"] = self.original_offset

    def test_utc_range_is_denormalized_to_broker_clock_before_copy_rates_range(self) -> None:
        gateway = _Gateway()
        from_ms = int(
            datetime(2026, 9, 11, 0, 0, tzinfo=timezone.utc).timestamp() * 1000
        )
        to_ms = int(
            datetime(2026, 9, 11, 1, 0, tzinfo=timezone.utc).timestamp() * 1000
        )

        self.assertEqual(
            historical_candles(gateway, "XAUUSD", "M5", from_ms, to_ms),
            [],
        )
        self.assertEqual(gateway.captured["method_name"], "copy_rates_range")

        _, _, start, end = gateway.captured["args"]  # type: ignore[misc]
        self.assertEqual(
            start,
            datetime(2026, 9, 11, 3, 0, tzinfo=timezone.utc),
            "UTC fromMs must be shifted to broker pseudo-UTC before copy_rates_range",
        )
        self.assertEqual(
            end,
            datetime(2026, 9, 11, 4, 0, tzinfo=timezone.utc),
            "UTC toMs must be shifted to broker pseudo-UTC before copy_rates_range",
        )


if __name__ == "__main__":
    unittest.main()
