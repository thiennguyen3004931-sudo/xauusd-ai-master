import type { MarketData } from "../../market/types/market";

export function analyzeTrend(market: MarketData) {
  return {
    direction: market.trend,
    score: market.trend === "Bullish" ? 90 : 30,
  };
}