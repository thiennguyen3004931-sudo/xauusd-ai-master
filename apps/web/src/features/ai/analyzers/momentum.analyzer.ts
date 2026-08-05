import type { MarketData } from "../../market/types/market";

export function analyzeMomentum(
  market: MarketData
) {
  const range = market.high - market.low;

  return {
    range,

    score:
      range > 20
        ? 95
        : range > 15
        ? 85
        : range > 10
        ? 70
        : 55,
  };
}