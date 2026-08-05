import type { Candle } from "../../market/types/candle";
import { calculateEMA } from "./ema";

export function calculateEMA200(
  candles: Candle[]
) {
  return calculateEMA(candles, 200);
}