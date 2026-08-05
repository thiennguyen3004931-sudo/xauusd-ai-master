import type { TradePlan } from "../types/trade-plan";

export function buildTradePlan(
  market: any,
  score: number,
  confidence: number,
  strategy: string,
  reasons: string[]
): TradePlan {

  const entry = market.bid;

  const stopLoss = entry - 6;

  const takeProfit1 = entry + 8;

  const takeProfit2 = entry + 16;

  const takeProfit3 = entry + 24;

  return {

    action:
      score >= 85
        ? "STRONG_BUY"
        : score >= 70
        ? "BUY"
        : score >= 50
        ? "WAIT"
        : score >= 30
        ? "SELL"
        : "STRONG_SELL",

    score,

    confidence,

    strategy,

    entry,

    stopLoss,

    takeProfit1,

    takeProfit2,

    takeProfit3,

    rr: 3,

    riskPercent: 1,

    lot: 0.01,

    reasons,

  };
}