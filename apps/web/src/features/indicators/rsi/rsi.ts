import type { Candle } from "../../market/types/candle";

export function calculateRSI(
  candles: Candle[],
  period = 14
) {
  if (candles.length <= period) {
    return 50;
  }

  let gain = 0;

  let loss = 0;

  for (
    let i = candles.length - period;
    i < candles.length;
    i++
  ) {
    const diff =
      candles[i].close -
      candles[i - 1].close;

    if (diff > 0) {
      gain += diff;
    } else {
      loss += Math.abs(diff);
    }
  }

  if (loss === 0) {
    return 100;
  }

  const rs = gain / loss;

  return 100 - 100 / (1 + rs);
}