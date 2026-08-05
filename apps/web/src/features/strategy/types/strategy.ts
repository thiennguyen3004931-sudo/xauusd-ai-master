export type TradeAction =
  | "BUY"
  | "SELL"
  | "WAIT";

export interface StrategyContext {
  trend: "Bullish" | "Bearish" | "Sideway";

  momentum: number;

  volatility: boolean;

  bos: boolean;

  choch: boolean;

  liquidity: boolean;

  bullishOB: boolean;

  bearishOB: boolean;

  bullishFVG: boolean;

  bearishFVG: boolean;
}

export interface StrategyResult {
  action: TradeAction;

  score: number;

  reasons: string[];
}