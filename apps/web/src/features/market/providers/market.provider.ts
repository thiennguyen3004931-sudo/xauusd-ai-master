import type { Candle } from "../types/candle";
import type { MarketData } from "../types/market";

export interface MarketProvider {
  getCandles(
    symbol: string,
    timeframe: string,
    limit: number
  ): Promise<Candle[]>;

  getQuote(
    symbol: string
  ): Promise<MarketData>;
}