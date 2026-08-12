import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from mt5_bridge.config import Settings
from mt5_bridge.ledger import IdempotencyLedger
from mt5_bridge.models import OrderRequest
from mt5_bridge.mt5_gateway import Mt5Gateway


class FakeMt5:
    ACCOUNT_TRADE_MODE_DEMO = 0
    ACCOUNT_TRADE_MODE_CONTEST = 1
    POSITION_TYPE_BUY = 0
    POSITION_TYPE_SELL = 1
    ORDER_TYPE_BUY = 0
    ORDER_TYPE_SELL = 1
    ORDER_TYPE_BUY_LIMIT = 2
    ORDER_TYPE_SELL_LIMIT = 3
    ORDER_TYPE_BUY_STOP = 4
    ORDER_TYPE_SELL_STOP = 5
    TRADE_ACTION_DEAL = 1
    TRADE_ACTION_PENDING = 5
    TRADE_ACTION_SLTP = 6
    TRADE_ACTION_REMOVE = 8
    ORDER_FILLING_FOK = 0
    ORDER_FILLING_IOC = 1
    ORDER_FILLING_RETURN = 2
    SYMBOL_FILLING_FOK = 1
    SYMBOL_FILLING_IOC = 2
    SYMBOL_TRADE_EXECUTION_MARKET = 2
    ORDER_TIME_GTC = 0
    ORDER_TIME_DAY = 1
    ORDER_TIME_SPECIFIED = 2
    TRADE_RETCODE_PLACED = 10008
    TRADE_RETCODE_DONE = 10009
    TRADE_RETCODE_DONE_PARTIAL = 10010
    TRADE_RETCODE_NO_CHANGES = 10025

    def __init__(self, trade_mode=0, bid=2399.9, ask=2400.0):
        self.send_calls = 0
        self.check_calls = 0
        self.position = None
        self.trade_mode = trade_mode
        self.bid = bid
        self.ask = ask

    def initialize(self, **_): return True
    def shutdown(self): return None
    def last_error(self): return (0, "ok")
    def version(self): return (500, 5735, "test")
    def terminal_info(self): return SimpleNamespace(trade_allowed=True)
    def account_info(self):
        return SimpleNamespace(login=123456, trade_mode=self.trade_mode, trade_allowed=True, trade_expert=True, server="Demo")
    def symbol_select(self, _symbol, _select): return True
    def symbol_info(self, symbol):
        return SimpleNamespace(symbol=symbol, visible=True, trade_tick_size=0.01, point=0.01, trade_tick_value=0.1, trade_tick_value_profit=0.1, trade_tick_value_loss=0.1, trade_contract_size=100.0, digits=2,
            volume_min=0.01, volume_max=100.0, volume_step=0.01, trade_stops_level=10,
            trade_freeze_level=5, filling_mode=3, trade_exemode=2)
    def symbol_info_tick(self, _symbol):
        return SimpleNamespace(bid=self.bid, ask=self.ask, time=1700000000, time_msc=1700000000000)
    def order_calc_profit(
        self,
        order_type,
        symbol,
        volume,
        price_open,
        price_close,
    ):
        direction = 1.0 if int(order_type) == int(self.ORDER_TYPE_BUY) else -1.0
        return (
            direction
            * (float(price_close) - float(price_open))
            * 100.0
            * float(volume)
        )

    def order_check(self, request):
        self.check_calls += 1
        return SimpleNamespace(retcode=0, comment="ok", request=request)
    def order_send(self, request):
        self.send_calls += 1
        self.position = SimpleNamespace(ticket=2001, symbol=request.get("symbol", "XAUUSD"), type=0,
            volume=request.get("volume", 0.2), price_open=2400.0, sl=request.get("sl", 2395.0),
            tp=request.get("tp", 2411.0), profit=0.0, swap=0.0, time=1700000000, time_msc=1700000000000)
        return SimpleNamespace(retcode=10009, order=1001, deal=3001, price=2400.0,
            volume=request.get("volume", 0.2), comment="done")
    def positions_get(self, symbol=None, ticket=None):
        if self.position is None: return ()
        if symbol is not None and self.position.symbol != symbol: return ()
        if ticket is not None and self.position.ticket != ticket: return ()
        return (self.position,)


def settings(path: Path):
    return Settings(
        host="127.0.0.1", port=8765, api_key="0123456789abcdef", trading_enabled=True,
        allow_real_account=False, allowed_logins=frozenset({123456}), terminal_path=None,
        login=None, password=None, server=None, portable=False, initialize_timeout_ms=60000,
        fail_startup_if_disconnected=True, symbol_map={"XAUUSD": "XAUUSDm"},
        max_spread_points={"XAUUSD": 50}, magic_number=260806, deviation_points=50,
        ledger_path=path, log_level="INFO")


class GatewayTests(unittest.TestCase):
    def test_symbol_spec_exposes_broker_risk_values(self):
        with tempfile.TemporaryDirectory() as directory:
            fake = FakeMt5()
            ledger_path = Path(directory) / "ledger.sqlite3"
            ledger = IdempotencyLedger(ledger_path)
            gateway = Mt5Gateway(settings(ledger_path), ledger, fake)
            self.assertTrue(gateway.start())

            spec = gateway.symbol_spec("XAUUSD")

            self.assertEqual(spec["tickSize"], 0.01)
            self.assertEqual(spec["point"], 0.01)
            self.assertEqual(spec["tickValuePerLot"], 0.1)
            self.assertEqual(spec["tickValueProfitPerLot"], 0.1)
            self.assertEqual(spec["tickValueLossPerLot"], 0.1)
            self.assertEqual(spec["contractSize"], 100.0)
            self.assertEqual(spec["minVolume"], 0.01)
            self.assertEqual(spec["volumeStep"], 0.01)

            ledger.close()

    def test_order_send_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            fake = FakeMt5()
            ledger = IdempotencyLedger(Path(directory) / "ledger.sqlite3")
            gateway = Mt5Gateway(settings(Path(directory) / "ledger.sqlite3"), ledger, fake)
            self.assertTrue(gateway.start())
            request = OrderRequest(symbol="XAUUSD", side="BUY", orderType="MARKET", timeInForce="IOC",
                volume=0.2, requestedPrice=2400, stopLoss=2395, takeProfit=2411,
                deviationPoints=50, magicNumber=260806, comment="test", clientOrderId="client-1",
                idempotencyKey="same-key")
            first = gateway.place_order(request)
            second = gateway.place_order(request)
            self.assertTrue(first["accepted"])
            self.assertTrue(second["idempotentReplay"])
            self.assertEqual(fake.send_calls, 1)
            ledger.close()

    def test_excessive_spread_is_blocked_before_order_check_and_send(self):
        with tempfile.TemporaryDirectory() as directory:
            # point=0.01, so a 0.66 price spread = 66 broker points.
            # Configured maximum is 50 points.
            fake = FakeMt5(bid=2399.34, ask=2400.00)
            ledger = IdempotencyLedger(Path(directory) / "ledger.sqlite3")
            gateway = Mt5Gateway(settings(Path(directory) / "ledger.sqlite3"), ledger, fake)
            gateway.start()
            request = OrderRequest(
                symbol="XAUUSD",
                side="BUY",
                orderType="MARKET",
                timeInForce="IOC",
                volume=0.01,
                requestedPrice=2400,
                stopLoss=2395,
                takeProfit=2411,
                deviationPoints=50,
                magicNumber=260806,
                comment="spread-guard-test",
                clientOrderId="spread-guard-client",
                idempotencyKey="spread-guard-key",
            )

            with self.assertRaisesRegex(Exception, "Spread too wide"):
                gateway.place_order(request)

            self.assertEqual(fake.check_calls, 0)
            self.assertEqual(fake.send_calls, 0)
            ledger.close()

    def test_comment_is_ascii_and_broker_safe_length(self):
        value = "gate2b-orphan-cleanup-1786088035660-\u2603"
        comment = Mt5Gateway._comment(value)

        self.assertLessEqual(len(comment), 28)
        self.assertTrue(comment.isascii())
        self.assertTrue(comment.startswith("xau:"))
        self.assertNotIn("\u2603", comment)

    def test_symbol_mapping_and_quote(self):
        with tempfile.TemporaryDirectory() as directory:
            fake = FakeMt5()
            ledger = IdempotencyLedger(Path(directory) / "ledger.sqlite3")
            gateway = Mt5Gateway(settings(Path(directory) / "ledger.sqlite3"), ledger, fake)
            gateway.start()
            quote = gateway.quote("XAUUSD")
            self.assertEqual(quote["brokerSymbol"], "XAUUSDm")
            self.assertEqual(quote["ask"], 2400.0)
            ledger.close()

    def test_real_account_is_blocked_by_default(self):
        with tempfile.TemporaryDirectory() as directory:
            fake = FakeMt5(trade_mode=2)
            ledger = IdempotencyLedger(Path(directory) / "ledger.sqlite3")
            gateway = Mt5Gateway(settings(Path(directory) / "ledger.sqlite3"), ledger, fake)
            gateway.start()
            request = OrderRequest(symbol="XAUUSD", side="BUY", orderType="MARKET", timeInForce="IOC",
                volume=0.2, requestedPrice=2400, stopLoss=2395, takeProfit=2411,
                deviationPoints=50, magicNumber=260806, comment="test", clientOrderId="client-real",
                idempotencyKey="real-key")
            with self.assertRaisesRegex(Exception, "Real-account trading"):
                gateway.place_order(request)
            self.assertEqual(fake.send_calls, 0)
            ledger.close()


if __name__ == "__main__":
    unittest.main()
