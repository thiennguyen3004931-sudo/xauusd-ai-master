export type TradeAction =
  | "STRONG_BUY"
  | "BUY"
  | "WAIT"
  | "SELL"
  | "STRONG_SELL";

export interface TradePlan {

  action: TradeAction;

  score: number;

  confidence: number;

  strategy: string;

  entry: number;

  stopLoss: number;

  takeProfit1: number;

  takeProfit2: number;

  takeProfit3: number;

  rr: number;

  riskPercent: number;

  lot: number;

  reasons: string[];
}