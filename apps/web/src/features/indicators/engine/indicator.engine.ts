import type { Candle } from "../../market/types/candle";

import { calculateEMA20 } from "../ema/ema20";
import { calculateEMA50 } from "../ema/ema50";
import { calculateEMA200 } from "../ema/ema200";

import { calculateATR } from "../atr/atr";
import { calculateRSI } from "../rsi/rsi";

import { calculateVolume } from "../volume/volume";
import { detectTrend } from "../trend/trend";

import { detectCrossOver } from "../crossover/crossover";
import { detectVolatility } from "../volatility/volatility";

export function buildIndicators(
  candles: Candle[]
) {
  // ===========================
  // Core Indicators
  // ===========================

  const ema20 = calculateEMA20(candles);

  const ema50 = calculateEMA50(candles);

  const ema200 = calculateEMA200(candles);

  const atr = calculateATR(candles);

  const rsi = calculateRSI(candles);

  const volume = calculateVolume(candles);

  // ===========================
  // Derived Indicators
  // ===========================

  const trend = detectTrend(candles);

  const crossover = detectCrossOver(
    ema20,
    ema50
  );

  const volatility = detectVolatility(
    atr
  );

  // ===========================
  // Return
  // ===========================

  return {
    ema20,
    ema50,
    ema200,

    atr,

    rsi,

    volume,

    trend,

    crossover,

    volatility,
  };
}