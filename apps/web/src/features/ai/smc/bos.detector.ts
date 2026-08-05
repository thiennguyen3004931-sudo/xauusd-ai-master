import type { Candle } from "../../market/types/candle";

export interface BOSResult {
  bullish: boolean;
  bearish: boolean;
}

export function detectBOS(
  candles: Candle[],
  swingHigh: number,
  swingLow: number
): BOSResult {
  if (candles.length === 0) {
    return {
      bullish: false,
      bearish: false,
    };
  }

  const last = candles[candles.length - 1];

  return {
    bullish: last.close > swingHigh,
    bearish: last.close < swingLow,
  };
}