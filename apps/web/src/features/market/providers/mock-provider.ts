import type { Candle } from "../types/candle";
import type { MarketData } from "../types/market";
import type { MarketProvider } from "./market.provider";

import { marketMock } from "../mock/market.mock";
import { candleMock } from "../mock/candle.mock";

export class MockProvider implements MarketProvider {
  async getQuote(
    symbol: string
  ): Promise<MarketData> {
    return {
      ...marketMock,
      symbol,
    };
  }

  async getCandles(
    symbol: string,
    timeframe: string,
    limit: number
  ): Promise<Candle[]> {
    void symbol;
    void timeframe;

    return candleMock.slice(0, limit);
  }
}