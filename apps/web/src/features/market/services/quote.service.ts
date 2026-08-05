import type { MarketData } from "../types/market";

import { marketProvider } from "../providers/provider.factory";
import { marketCache } from "../cache/market.cache";

export async function getQuote(
  symbol: string
): Promise<MarketData> {
  const cached = marketCache.getQuote(symbol);

  if (cached) {
    return cached;
  }

  const quote = await marketProvider.getQuote(symbol);

  marketCache.setQuote(symbol, quote);

  return quote;
}