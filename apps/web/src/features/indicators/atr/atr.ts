import type { Candle } from "../../market/types/candle";

export function calculateATR(
  candles: Candle[],
  period = 14
) {
  if (candles.length < period + 1) {
    return 0;
  }

  const tr: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];

    const previous = candles[i - 1];

    tr.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - previous.close),
        Math.abs(current.low - previous.close)
      )
    );
  }

  return (
    tr.slice(-period).reduce((a, b) => a + b, 0) /
    period
  );
}