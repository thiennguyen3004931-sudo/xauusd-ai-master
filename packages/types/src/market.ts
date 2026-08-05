export type TrendDirection = "Bullish" | "Bearish" | "Sideway";

export interface MarketContext {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  trend: TrendDirection;
}