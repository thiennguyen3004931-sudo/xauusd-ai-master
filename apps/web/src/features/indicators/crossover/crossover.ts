export interface CrossOverResult {
  bullish: boolean;
  bearish: boolean;
  cross: boolean;
}

export function detectCrossOver(
  ema20: number,
  ema50: number
): CrossOverResult {
  return {
    bullish: ema20 > ema50,

    bearish: ema20 < ema50,

    cross: Math.abs(ema20 - ema50) < 0.5,
  };
}