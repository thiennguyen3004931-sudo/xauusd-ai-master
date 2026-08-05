export type SignalAction =
  | "STRONG_BUY"
  | "BUY"
  | "WAIT"
  | "SELL"
  | "STRONG_SELL";

export interface AISignal {
  action: SignalAction;

  confidence: number;
  score: number;

  strategy: string;

  entry: number;

  stopLoss: number;

  takeProfit: {
    tp1: number;
    tp2: number;
    tp3: number;
  };

  rr: number;

  reasons: string[];

  indicators: {
    ema20: number;
    ema50: number;
    ema200: number;

    rsi: number;

    atr: number;
  };

  smc: {
    bos: boolean;
    choch: boolean;
    liquidity: boolean;
    orderBlock: boolean;
    fvg: boolean;
  };

  timestamp: string;
}