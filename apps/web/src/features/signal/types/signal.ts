export interface Signal {
  direction: "BUY" | "SELL" | "WAIT";

  entry: number;

  stopLoss: number;

  takeProfit1: number;

  takeProfit2: number;

  rr: number;

  confidence: number;

  strategy: string;

  timeframe: string;
}