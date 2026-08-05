import type { Candle } from "../../market/types/candle";

export function calculateEMASeries(
  candles: Candle[],
  period: number
): number[] {
  if (candles.length < period) {
    return [];
  }

  const k = 2 / (period + 1);

  const ema: number[] = [];

  let previous =
    candles
      .slice(0, period)
      .reduce((sum, candle) => sum + candle.close, 0) / period;

  ema.push(previous);

  for (let i = period; i < candles.length; i++) {
    previous =
      candles[i].close * k +
      previous * (1 - k);

    ema.push(previous);
  }

  return ema;
}

export function calculateEMA(
  candles: Candle[],
  period: number
): number {
  const series = calculateEMASeries(
    candles,
    period
  );

  if (series.length === 0) {
    return 0;
  }

  return series[series.length - 1];
}