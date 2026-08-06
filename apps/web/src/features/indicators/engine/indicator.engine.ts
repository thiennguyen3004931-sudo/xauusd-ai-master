import type { Candle } from "../../market/types/candle";
import type { IndicatorResult } from "../types/indicator.types";

import { calculateEMA20 } from "../ema/ema20";
import { calculateEMA50 } from "../ema/ema50";
import { calculateEMA200 } from "../ema/ema200";

import { calculateATR } from "../atr/atr";
import { calculateRSI } from "../rsi/rsi";

import { calculateVolume } from "../volume/volume";
import { detectTrend } from "../trend/trend";

import { detectCrossOver } from "../crossover/crossover";
import { detectVolatility } from "../volatility/volatility";

// V2
// import { calculateMACD } from "../macd/macd";
// import { calculateADX } from "../adx/adx";
// import { calculateVWAP } from "../vwap/vwap";
// import { calculateCCI } from "../cci/cci";

export function buildIndicators(
  candles: Candle[]
): IndicatorResult {

  // ==========================================
  // Core Indicators
  // ==========================================

  const ema20 = calculateEMA20(candles);

  const ema50 = calculateEMA50(candles);

  const ema200 = calculateEMA200(candles);

  const atr = calculateATR(candles);

  const rsi = calculateRSI(candles);

  const volume = calculateVolume(candles);

  // ==========================================
  // Derived Indicators
  // ==========================================

  const trend = detectTrend(candles);

  const crossover = detectCrossOver(
    ema20,
    ema50
  );

  const volatility = detectVolatility(
    atr
  );

  // ==========================================
  // V2 Indicators (chuẩn bị)
  // ==========================================

  // const macd = calculateMACD(candles);
  // const adx = calculateADX(candles);
  // const vwap = calculateVWAP(candles);
  // const cci = calculateCCI(candles);

  // ==========================================
  // Return
  // ==========================================

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

    // ---------- V2 ----------

    macd: undefined,

    adx: undefined,

    vwap: undefined,

    cci: undefined,

    bollinger: undefined,

    stochastic: undefined,

    momentum: undefined,

    obv: undefined,

    mfi: undefined,

    pivot: undefined,

  };

}