import type { MarketData } from "../../market/types/market";
import type { Candle } from "../../market/types/candle";

import { generateSignal } from "../engine/ai.engine";

export function getAISignal(
  market: MarketData,
  candles: Candle[]
) {
  return generateSignal(
    market,
    candles
  );
}