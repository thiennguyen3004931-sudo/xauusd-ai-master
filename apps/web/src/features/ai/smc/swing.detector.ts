import type { MarketData } from "../../market/types/market";

export interface SwingPoint {
  high: number;
  low: number;
}

export function detectSwing(
  market: MarketData
): SwingPoint {

  return {
    high: market.high,
    low: market.low,
  };

}