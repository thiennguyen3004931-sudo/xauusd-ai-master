import { Candle } from "../entities/Candle";
import { Timeframe } from "../entities/Timeframe";
import { ICandleRepository } from "../interfaces/ICandleRepository";

export class InMemoryCandleRepository implements ICandleRepository {

    private readonly storage = new Map<string, Candle[]>();

    private key(symbol: string, timeframe: Timeframe): string {
        return `${symbol}:${timeframe}`;
    }

    async save(candle: Candle): Promise<void> {

        const key = this.key(candle.symbol, candle.timeframe);

        const candles = this.storage.get(key) ?? [];

        const existed = candles.findIndex(
            c => c.openTime === candle.openTime
        );

        if (existed >= 0) {

            candles[existed] = candle;

        } else {

            candles.push(candle);

        }

        candles.sort((a, b) => a.openTime - b.openTime);

        this.storage.set(key, candles);

    }

    async saveMany(candles: Candle[]): Promise<void> {

        for (const candle of candles) {

            await this.save(candle);

        }

    }

    async getLatest(

        symbol: string,

        timeframe: Timeframe

    ): Promise<Candle | null> {

        const candles = this.storage.get(

            this.key(symbol, timeframe)

        );

        if (!candles?.length) {

            return null;

        }

        return candles[candles.length - 1];

    }

    async getHistory(

        symbol: string,

        timeframe: Timeframe,

        limit: number

    ): Promise<Candle[]> {

        const candles = this.storage.get(

            this.key(symbol, timeframe)

        ) ?? [];

        return candles.slice(-limit);

    }

    async clear(

        symbol: string,

        timeframe: Timeframe

    ): Promise<void> {

        this.storage.delete(

            this.key(symbol, timeframe)

        );

    }

}