import type { Candle } from "../../market/types/candle";
import { calculateEMA } from "./ema";

export function calculateEMA20(
  candles: Candle[]
) {
  return calculateEMA(candles, 20);
}