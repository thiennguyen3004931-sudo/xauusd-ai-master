import type { MarketProvider } from "./market.provider";

import type { MarketQuote } from "../types/market";
import type { Candle } from "../types/candle";

export class MockProvider implements MarketProvider {

  async getQuote(): Promise<MarketQuote> {

    return {

      symbol: "XAUUSD",

      bid: 3367.15,

      ask: 3367.45,

      spread: 0.30,

      high: 3378,

      low: 3355,

      trend: "Bullish",

      session: "London",

      volatility: 0.82,

      time: new Date().toISOString(),

    };

  }

  async getCandles(
    symbol: string,
    timeframe: string,
    limit: number
  ): Promise<Candle[]> {

    const candles: Candle[] = [];

    let price = 3360;

    for (let i = 0; i < limit; i++) {

      const open = price;

      const close = open + (Math.random() - 0.5) * 6;

      const high = Math.max(open, close) + Math.random() * 3;

      const low = Math.min(open, close) - Math.random() * 3;

      candles.push({

        time: Date.now() - (limit - i) * 60000,

        open,

        high,

        low,

        close,

        volume: 1000 + Math.random() * 1000,

      });

      price = close;

    }

    return candles;

  }

}