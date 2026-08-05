import { MockProvider } from "../providers/mock.provider";

const provider = new MockProvider();

export function getQuote() {

  return provider.getQuote("XAUUSD");

}

export function getCandles(

  symbol: string,

  timeframe: string,

  limit: number

) {

  return provider.getCandles(

    symbol,

    timeframe,

    limit

  );

}