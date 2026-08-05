import type { SwingPoint } from "./swing.detector";

export function detectBOS(
  swing: SwingPoint,
  price: number
) {

  return {

    bullish: price > swing.high,

    bearish: price < swing.low,

  };

}