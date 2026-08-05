import type { Candle } from "../types/candle";

export const candleMock: Candle[] = [
  {
    time: Date.now(),
    open: 3360,
    high: 3368,
    low: 3358,
    close: 3366,
    volume: 1000,
  },
  {
    time: Date.now() + 60000,
    open: 3366,
    high: 3371,
    low: 3362,
    close: 3369,
    volume: 1200,
  },
];