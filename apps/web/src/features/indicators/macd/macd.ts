import type { Candle } from "../../market/types/candle";

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
}

function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;

  const k = 2 / (period + 1);

  let emaValue = values[0];

  for (let i = 1; i < values.length; i++) {
    emaValue = values[i] * k + emaValue * (1 - k);
  }

  return emaValue;
}

export function calculateMACD(
  candles: Candle[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): MACDResult {

  const closes = candles.map(c => c.close);

  const fastEMA = ema(closes, fast);

  const slowEMA = ema(closes, slow);

  const macd = fastEMA - slowEMA;

  // tạm thời Signal Line = EMA của chuỗi MACD
  // hiện chỉ có 1 giá trị MACD nên dùng giá trị hiện tại

  const signal = ema([macd], signalPeriod);

  const histogram = macd - signal;

  return {
    macd,
    signal,
    histogram,
  };
}   