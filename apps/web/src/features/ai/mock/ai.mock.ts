import type { AISignal } from "../types/ai";

export const aiMock: AISignal = {
  action: "BUY",

  confidence: 91,

  score: 91,

  strategy: "Trend + SMC",

  entry: 3367,

  stopLoss: 3361,

  takeProfit: {
    tp1: 3374,
    tp2: 3382,
    tp3: 3390,
  },

  rr: 3,

  reasons: [
    "Bullish Trend",
    "Order Block",
    "Liquidity Sweep",
    "Fair Value Gap",
  ],

  indicators: {
    ema20: 3358,
    ema50: 3348,
    ema200: 3302,
    rsi: 67,
    atr: 8.5,
  },

  smc: {
    bos: true,
    choch: false,
    liquidity: true,
    orderBlock: true,
    fvg: true,
  },

  timestamp: new Date().toISOString(),
};