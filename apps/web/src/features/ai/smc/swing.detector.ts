import type { Candle } from "../../market/types/candle";

export interface SwingPoint {
  high: number;
  low: number;
}

export function detectSwing(
  candles: Candle[]
): SwingPoint {

  if (candles.length === 0) {
    return {
      high: 0,
      low: 0,
    };
  }

  let highest = candles[0].high;
  let lowest = candles[0].low;

  for (const candle of candles) {
    if (candle.high > highest) {
      highest = candle.high;
    }

    if (candle.low < lowest) {
      lowest = candle.low;
    }
  }

  return {
    high: highest,
    low: lowest,
  };
}