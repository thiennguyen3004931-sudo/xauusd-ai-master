import type { Candle } from "../types/candle";

import { marketProvider } from "../providers/provider.factory";
import { marketCache } from "../cache/market.cache";

export async function getCandles(
  symbol: string,
  timeframe: string,
  limit: number
): Promise<Candle[]> {
  const key = `${symbol}_${timeframe}_${limit}`;

  const cached = marketCache.getCandles(key);

  if (cached) {
    return cached;
  }

  const candles = await marketProvider.getCandles(
    symbol,
    timeframe,
    limit
  );

  marketCache.setCandles(key, candles);

  return candles;
}