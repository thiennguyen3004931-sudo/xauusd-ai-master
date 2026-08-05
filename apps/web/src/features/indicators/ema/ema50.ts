import type { Candle } from "../../market/types/candle";
import { calculateEMA } from "./ema";

export function calculateEMA50(
  candles: Candle[]
) {
  return calculateEMA(candles, 50);
}