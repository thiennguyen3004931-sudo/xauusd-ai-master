import type { MarketData } from "../../market/types/market";

export function analyzeVolatility(
  market: MarketData
) {
  return {
    spread: market.spread,

    highVolatility:
      market.spread > 0.5,
  };
}