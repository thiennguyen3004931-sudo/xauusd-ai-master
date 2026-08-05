import type { MarketData } from "./market";
import type { Candle } from "./candle";

export interface MarketContext {
  market: MarketData;

  candles: Candle[];
}