import { marketMock } from "../mock/market.mock";

export async function getMarketData() {
  return Promise.resolve(marketMock);
}