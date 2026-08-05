import type { Signal } from "../types/signal";

export const signalMock: Signal = {
  direction: "BUY",

  entry: 3367.20,

  stopLoss: 3362.10,

  takeProfit1: 3374.50,

  takeProfit2: 3380.20,

  rr: 3.2,

  confidence: 91,

  strategy: "SMC + ICT",

  timeframe: "M15",
};