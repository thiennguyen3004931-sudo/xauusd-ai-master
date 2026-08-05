export interface MarketQuote {
  symbol: string;

  bid: number;

  ask: number;

  spread: number;

  high: number;

  low: number;

  session: string;

  trend: string;

  volatility: number;

  time: string;
}