import { Candle } from "../entities/Candle";
import { Timeframe } from "../entities/Timeframe";
import { ICandleRepository } from "../interfaces/ICandleRepository";

export class InMemoryCandleRepository implements ICandleRepository {

    private readonly storage = new Map<string, Candle[]>();

    private getKey(symbol: string, timeframe: Timeframe): string {
        return `${symbol}:${timeframe}`;
    }

    async save(candle: Candle): Promise<void> {

        const key = this.getKey(candle.symbol, candle.timeframe);

        const candles = this.storage.get(key) ?? [];

        candles.push(candle);

        candles.sort((a,b)=>a.openTime-b.openTime);

        this.storage.set(key,candles);

    }

    async saveMany(candles: Candle[]): Promise<void>{

        for(const candle of candles){

            await this.save(candle);

        }

    }

    async getLatest(symbol:string,timeframe:Timeframe){

        const candles=this.storage.get(this.getKey(symbol,timeframe));

        if(!candles?.length) return null;

        return candles[candles.length-1];

    }

    async getHistory(symbol:string,timeframe:Timeframe,limit:number){

        const candles=this.storage.get(this.getKey(symbol,timeframe)) ?? [];

        return candles.slice(-limit);

    }

}