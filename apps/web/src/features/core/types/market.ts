export type TrendDirection =
  | "Bullish"
  | "Bearish"
  | "Sideway";

export type TradingSession =
  | "Sydney"
  | "Tokyo"
  | "London"
  | "NewYork"
  | "Overlap";

export interface MarketContext {
  symbol: string;

  bid: number;

  ask: number;

  spread: number;

  high: number;

  low: number;

  trend: TrendDirection;

  session: TradingSession;

  volatility: number;

  timestamp: number;
}