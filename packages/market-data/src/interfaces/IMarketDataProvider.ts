import { Candle } from "../entities/Candle";
import { Tick } from "../entities/Tick";
import { Timeframe } from "../entities/Timeframe";

export interface IMarketDataProvider {
  connect(): Promise<void>;

  disconnect(): Promise<void>;

  getCandles(
    symbol: string,
    timeframe: Timeframe,
    limit: number
  ): Promise<Candle[]>;

  getLatestTick(symbol: string): Promise<Tick>;

  subscribe(
    symbol: string,
    timeframe: Timeframe,
    onCandle: (candle: Candle) => void
  ): Promise<void>;
}