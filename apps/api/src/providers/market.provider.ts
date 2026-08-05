import type { Candle } from "../types/candle";
import type { MarketQuote } from "../types/market";

export interface MarketProvider {
  getQuote(
    symbol: string
  ): Promise<MarketQuote>;

  getCandles(
    symbol: string,
    timeframe: string,
    limit: number
  ): Promise<Candle[]>;
}