import type { Candle } from "../../../market/types/candle";
import type { SwingPoint } from "../types/smc";

export function detectSwingHigh(
  candles: Candle[]
): SwingPoint | undefined {

  if (candles.length < 5) return;

  let highest = 0;

  for (let i = 1; i < candles.length; i++) {
    if (
      candles[i].high >
      candles[highest].high
    ) {
      highest = i;
    }
  }

  return {
    index: highest,
    price: candles[highest].high,
  };
}

export function detectSwingLow(
  candles: Candle[]
): SwingPoint | undefined {

  if (candles.length < 5) return;

  let lowest = 0;

  for (let i = 1; i < candles.length; i++) {
    if (
      candles[i].low <
      candles[lowest].low
    ) {
      lowest = i;
    }
  }

  return {
    index: lowest,
    price: candles[lowest].low,
  };
}