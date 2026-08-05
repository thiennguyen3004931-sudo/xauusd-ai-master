import type { Candle } from "../../market/types/candle";

export function calculateVolume(
  candles: Candle[]
) {
  if (!candles.length) {
    return 0;
  }

  return candles.reduce(
    (sum, candle) => sum + candle.volume,
    0
  );
}