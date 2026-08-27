import unittest

from mt5_bridge.models import OrderRequest


class Phase7BDemoOrderModelTests(unittest.TestCase):
    def test_market_order_allows_zero_take_profit(self):
        request = OrderRequest(
            symbol="XAUUSD",
            side="BUY",
            orderType="MARKET",
            timeInForce="GTC",
            volume=0.03,
            requestedPrice=2400.0,
            stopLoss=2394.0,
            takeProfit=0.0,
            deviationPoints=50,
            magicNumber=270713,
            comment="phase7b-demo",
            clientOrderId="phase7b-demo-1",
            idempotencyKey="phase7b-demo-1",
        )
        self.assertEqual(request.takeProfit, 0.0)


if __name__ == "__main__":
    unittest.main()
