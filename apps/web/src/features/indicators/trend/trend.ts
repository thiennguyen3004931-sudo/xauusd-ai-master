import type { Candle } from "../../market/types/candle";

import { calculateEMA20 } from "../ema/ema20";
import { calculateEMA50 } from "../ema/ema50";

export function detectTrend(
  candles: Candle[]
) {
  const ema20 = calculateEMA20(candles);

  const ema50 = calculateEMA50(candles);

  return {
    bullish: ema20 > ema50,

    bearish: ema20 < ema50,

    ema20,

    ema50,
  };
}