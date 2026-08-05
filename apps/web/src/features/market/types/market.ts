export interface MarketData {
  symbol: string;

  bid: number;

  ask: number;

  spread: number;

  high: number;

  low: number;

  session: string;

  trend: string;

  volatility: string;

  time: string;
}