import type { Candle } from "../../../market/types/candle";

export function detectSwingHigh(
  candles: Candle[],
  left = 2,
  right = 2
): number | null {
  if (candles.length < left + right + 1) {
    return null;
  }

  const index = candles.length - right - 1;
  const current = candles[index];

  for (let i = index - left; i <= index + right; i++) {
    if (i === index) continue;

    if (candles[i].high >= current.high) {
      return null;
    }
  }

  return current.high;
}