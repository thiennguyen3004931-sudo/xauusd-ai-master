export interface MarketData {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  session: string;
  trend: "Bullish" | "Bearish" | "Sideway";
}