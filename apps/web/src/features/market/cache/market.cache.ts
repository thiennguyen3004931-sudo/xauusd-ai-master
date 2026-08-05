import type { Candle } from "../types/candle";
import type { MarketData } from "../types/market";

class MarketCache {

    private candles = new Map<string, Candle[]>();

    private quotes = new Map<string, MarketData>();

    setCandles(
        key: string,
        value: Candle[]
    ) {
        this.candles.set(key, value);
    }

    getCandles(
        key: string
    ) {
        return this.candles.get(key);
    }

    setQuote(
        symbol: string,
        value: MarketData
    ) {
        this.quotes.set(symbol, value);
    }

    getQuote(
        symbol: string
    ) {
        return this.quotes.get(symbol);
    }

}

export const marketCache =
    new MarketCache();