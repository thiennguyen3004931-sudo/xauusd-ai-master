import type { MarketData } from "../types/market";

export const marketMock: MarketData = {
  symbol: "XAUUSD",

  bid: 3368.25,

  ask: 3368.48,

  spread: 0.23,

  high: 3372.60,

  low: 3358.20,

  session: "London",

  trend: "Bullish",

  volatility: "Medium",

  time: new Date().toLocaleTimeString(),
};