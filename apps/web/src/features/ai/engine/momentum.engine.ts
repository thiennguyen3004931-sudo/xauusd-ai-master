import type { MarketData } from "../../market/types/market";

export function detectMomentum(
  market: MarketData
): number {

  const range = market.high - market.low;

  if (range > 20) return 95;

  if (range > 15) return 85;

  if (range > 10) return 75;

  return 60;
}