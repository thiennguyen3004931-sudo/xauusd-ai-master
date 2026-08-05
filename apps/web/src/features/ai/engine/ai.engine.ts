import type { AISignal } from "../types/ai";

import { marketMock } from "../../market/mock/market.mock";

import { analyzeTrend } from "../analyzers/trend.analyzer";
import { analyzeMomentum } from "../analyzers/momentum.analyzer";
import { analyzeVolatility } from "../analyzers/volatility.analyzer";
import { analyzeRisk } from "../analyzers/risk.analyzer";

import { detectSwing } from "../smc/swing.detector";
import { detectBOS } from "../smc/bos.detector";
import { detectCHOCH } from "../smc/choch.detector";
import { detectLiquidity } from "../smc/liquidity.detector";
import { detectOrderBlock } from "../smc/ob.detector";
import { detectFVG } from "../smc/fvg.detector";

export function generateSignal(): AISignal {
  const market = marketMock;

  // ===== AI ANALYZERS =====

  const trend = analyzeTrend(market);

  const momentum = analyzeMomentum(market);

  const volatility = analyzeVolatility(market);

  // ===== SMC =====

  const swing = detectSwing(market);

  const bos = detectBOS(
    swing,
    market.bid
  );

  const choch = detectCHOCH(
    bos.bullish,
    bos.bearish
  );

  const liquidity = detectLiquidity(
    market.spread
  );

  const orderBlock = detectOrderBlock();

  const fvg = detectFVG();

  // ===== TRADE PLAN =====

  const entry = market.bid;

  const sl =
    trend.direction === "Bullish"
      ? entry - 6
      : entry + 6;

  const tp1 =
    trend.direction === "Bullish"
      ? entry + 8
      : entry - 8;

  const tp2 =
    trend.direction === "Bullish"
      ? entry + 16
      : entry - 16;

  const tp3 =
    trend.direction === "Bullish"
      ? entry + 24
      : entry - 24;

  const risk = analyzeRisk(
    entry,
    sl,
    tp3
  );

  // ===== DECISION ENGINE =====

  let action: "BUY" | "SELL" | "WAIT" = "WAIT";

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

  // ===== RETURN =====

  return {
    action,

    entry,

    sl,

    tp1,

    tp2,

    tp3,

    rr: risk.rr,

    confidence: momentum.score,

    reason: [
      `Trend : ${trend.direction}`,
      `Momentum : ${momentum.score}%`,
      `Spread : ${market.spread}`,
      `Session : ${market.session}`,
      `Volatility : ${
        volatility.highVolatility ? "High" : "Normal"
      }`,
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
        choch.choch ? "Detected" : "No"
      }`,
      `Liquidity Sweep : ${
        liquidity.sweep ? "Yes" : "No"
      }`,
      `Bullish OB : ${
        orderBlock.bullishOB ? "Yes" : "No"
      }`,
      `Bearish OB : ${
        orderBlock.bearishOB ? "Yes" : "No"
      }`,
      `Bullish FVG : ${
        fvg.bullishFVG ? "Yes" : "No"
      }`,
      `Bearish FVG : ${
        fvg.bearishFVG ? "Yes" : "No"
      }`,
      `RR : ${risk.rr}`,
    ],
  };
}