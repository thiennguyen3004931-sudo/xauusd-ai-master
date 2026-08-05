import type { Candle } from "../../../market/types/candle";

export function detectSwingLow(
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

    if (candles[i].low <= current.low) {
      return null;
    }
  }

  return current.low;
}