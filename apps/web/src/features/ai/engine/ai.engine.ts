import type { AISignal } from "../types/ai";

import type { MarketData } from "../../market/types/market";
import type { Candle } from "../../market/types/candle";

import { analyzeTrend } from "../analyzers/trend.analyzer";
import { analyzeMomentum } from "../analyzers/momentum.analyzer";
import { analyzeVolatility } from "../analyzers/volatility.analyzer";
import { analyzeRisk } from "../analyzers/risk.analyzer";

import { detectSwing } from "../smc/swing.detector";
import { detectBOS } from "../smc/bos.detector";
import { detectCHOCH } from "../smc/choch.detector";
import { detectLiquiditySweep } from "../smc/liquidity.detector";
import { detectOrderBlock } from "../smc/ob.detector";
import { detectFVG } from "../smc/fvg.detector";

export function generateSignal(
  market: MarketData,
  candles: Candle[]
): AISignal {
  //----------------------------------------
  // ANALYZERS
  //----------------------------------------

  const trend = analyzeTrend(market);

  const momentum = analyzeMomentum(market);

  const volatility = analyzeVolatility(market);

  //----------------------------------------
  // SMART MONEY
  //----------------------------------------

  const swing = detectSwing(candles);

  const bos = detectBOS(
    candles,
    swing.high,
    swing.low
  );

  const choch = detectCHOCH(
    bos.bullish,
    bos.bearish
  );

  const liquidity = detectLiquiditySweep(
    market.spread
  );

  const orderBlock = detectOrderBlock();

  const fvg = detectFVG();

  //----------------------------------------
  // TRADE PLAN
  //----------------------------------------

  const entry = market.bid;

  const stopLoss =
    trend.direction === "Bullish"
      ? entry - 6
      : entry + 6;

  const takeProfit = {
    tp1:
      trend.direction === "Bullish"
        ? entry + 8
        : entry - 8,

    tp2:
      trend.direction === "Bullish"
        ? entry + 16
        : entry - 16,

    tp3:
      trend.direction === "Bullish"
        ? entry + 24
        : entry - 24,
  };

  const risk = analyzeRisk(
    entry,
    stopLoss,
    takeProfit.tp3
  );

  //----------------------------------------
  // DECISION
  //----------------------------------------

  let action: AISignal["action"] = "WAIT";

  if (
    trend.direction === "Bullish" &&
    momentum.score >= 70 &&
    !volatility.highVolatility
  ) {
    action = "BUY";
  }

  if (
    trend.direction === "Bearish" &&
    momentum.score >= 70 &&
    !volatility.highVolatility
  ) {
    action = "SELL";
  }

  //----------------------------------------
  // RETURN
  //----------------------------------------

  return {
    action,

    confidence: momentum.score,

    score: momentum.score,

    strategy: "Trend + Momentum + Smart Money",

    entry,

    stopLoss,

    takeProfit,

    rr: risk.rr,

    reasons: [
      `Trend : ${trend.direction}`,
      `Momentum : ${momentum.score}%`,
      `Spread : ${market.spread}`,
      `Session : ${market.session}`,
      `Volatility : ${
        volatility.highVolatility
          ? "High"
          : "Normal"
      }`,
      `Candles : ${candles.length}`,
      `Swing High : ${swing.high}`,
      `Swing Low : ${swing.low}`,
      `BOS : ${
        bos.bullish
          ? "Bullish"
          : bos.bearish
          ? "Bearish"
          : "No"
      }`,
      `CHOCH : ${
        choch ? "Detected" : "No"
      }`,
      `Liquidity Sweep : ${
        liquidity ? "Yes" : "No"
      }`,
      `Bullish OB : ${
        orderBlock.bullish ? "Yes" : "No"
      }`,
      `Bearish OB : ${
        orderBlock.bearish ? "Yes" : "No"
      }`,
      `Bullish FVG : ${
        fvg.bullishFVG ? "Yes" : "No"
      }`,
      `Bearish FVG : ${
        fvg.bearishFVG ? "Yes" : "No"
      }`,
      `Risk Reward : ${risk.rr}`,
    ],

    indicators: {
      ema20: 0,
      ema50: 0,
      ema200: 0,
      rsi: momentum.score,
      atr: 0,
    },

    smc: {
      bos:
        bos.bullish ||
        bos.bearish,

      choch,

      liquidity,

      orderBlock:
        orderBlock.bullish ||
        orderBlock.bearish,

      fvg:
        fvg.bullishFVG ||
        fvg.bearishFVG,
    },

    timestamp: new Date().toISOString(),
  };
}