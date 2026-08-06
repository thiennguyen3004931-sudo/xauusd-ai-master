import { detectTrend } from "../trend/trend";
import { detectCrossOver } from "../crossover/crossover";
import { detectVolatility } from "../volatility/volatility";

export interface IndicatorResult {
  // Core Indicators
  ema20: number;
  ema50: number;
  ema200: number;

  atr: number;
  rsi: number;
  volume: number;

  // Derived Indicators
  trend: ReturnType<typeof detectTrend>;

  crossover: ReturnType<typeof detectCrossOver>;

  volatility: ReturnType<typeof detectVolatility>;

  // V2 (chưa triển khai)
  macd?: unknown;

  adx?: number;

  vwap?: number;

  cci?: number;

  bollinger?: unknown;

  stochastic?: unknown;

  momentum?: number;

  obv?: number;

  mfi?: number;

  pivot?: number;
}