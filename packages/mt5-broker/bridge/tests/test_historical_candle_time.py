from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

BRIDGE_ROOT = Path(__file__).resolve().parents[1]
if str(BRIDGE_ROOT) not in sys.path:
    sys.path.insert(0, str(BRIDGE_ROOT))

from mt5_bridge.historical_candles import historical_candles


class _Settings:
    def broker_symbol(self, canonical: str) -> str:
        return canonical


class _Mt5:
    TIMEFRAME_M5 = 5

    @staticmethod
    def last_error() -> tuple[int, str]:
        return (0, "ok")


class _Gateway:
    def __init__(self) -> None:
        self.mt5 = _Mt5()
        self._lock = SimpleNamespace(
            __enter__=lambda self: self,
            __exit__=lambda self, exc_type, exc, tb: False,
        )
        self.captured: dict[str, object] = {}

    def _ensure_symbol(self, canonical: str) -> str:
        return canonical

    def _read_with_reconnect_locked(self, method_name: str, *args: object):
        if method_name == "symbol_info":
            return SimpleNamespace(point=0.01)

        if method_name == "copy_rates_range":
            self.captured["method_name"] = method_name
            self.captured["args"] = args
            return []

        raise AssertionError(f"Unexpected MT5 read: {method_name}")


class HistoricalCandleBrokerTimeRangeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_offset = os.environ.get("MT5_BROKER_TIME_OFFSET_SECONDS")

    def tearDown(self) -> None:
        if self.original_offset is None:
            os.environ.pop("MT5_BROKER_TIME_OFFSET_SECONDS", None)
        else:
            os.environ["MT5_BROKER_TIME_OFFSET_SECONDS"] = self.original_offset

    def test_utc_range_is_denormalized_to_broker_clock_before_copy_rates_range(self) -> None:
        os.environ["MT5_BROKER_TIME_OFFSET_SECONDS"] = "10800"
        gateway = _Gateway()

        from_ms = int(
            datetime(2026, 9, 11, 6, 5, tzinfo=timezone.utc).timestamp() * 1000
        )
        to_ms = int(
            datetime(2026, 9, 11, 6, 35, tzinfo=timezone.utc).timestamp() * 1000
        )

        self.assertEqual(
            historical_candles(gateway, "XAUUSD", "M5", from_ms, to_ms),
            [],
        )
        self.assertEqual(gateway.captured["method_name"], "copy_rates_range")

        broker_symbol, timeframe, start, end = gateway.captured["args"]  # type: ignore[misc]
        self.assertEqual(broker_symbol, "XAUUSD")
        self.assertEqual(timeframe, _Mt5.TIMEFRAME_M5)
        self.assertEqual(
            start,
            datetime(2026, 9, 11, 9, 5, tzinfo=timezone.utc),
            "UTC fromMs must be shifted to broker pseudo-UTC before copy_rates_range",
        )
        self.assertEqual(
            end,
            datetime(2026, 9, 11, 9, 35, tzinfo=timezone.utc),
            "UTC toMs must be shifted to broker pseudo-UTC before copy_rates_range",
        )


if __name__ == "__main__":
    unittest.main()
