import { MarketStructure, Trend } from "@xauusd/types";
import type { StrategyEngineConfig } from "../config";
import type {
  MarketRegimeAssessment,
  StrategyContext,
} from "../models";
import { NumberUtils } from "../utils";

export class MarketRegimeClassifier {
  classify(
    context: StrategyContext,
    config: StrategyEngineConfig,
  ): MarketRegimeAssessment {
    const adx = context.indicators.latest.adx.adx;
    const bandwidth = context.indicators.latest.bollingerBands.bandwidth;
    const confirmedBos = context.analysis.structureEvents.filter(
      (event) => event.confirmed && event.type === "BOS",
    );
    const confirmedChoch = context.analysis.structureEvents.filter(
      (event) => event.confirmed && event.type === "CHOCH",
    );
    const latestEvent = [...context.analysis.structureEvents]
      .filter((event) => event.confirmed)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    const reasons: string[] = [];
    let regime: MarketRegimeAssessment["regime"] = "UNCERTAIN";
    let confidence = 45;

    if (latestEvent?.type === "CHOCH" && confirmedChoch.length > 0) {
      regime = "REVERSAL";
      confidence = 60 + Math.min(20, confirmedChoch.length * 5);
      reasons.push("A confirmed CHOCH indicates a possible structural reversal.");
    } else if (
      latestEvent?.type === "BOS" &&
      adx !== null &&
      adx >= config.breakoutAdxThreshold
    ) {
      regime = "BREAKOUT";
      confidence = 65 + Math.min(20, (adx - config.breakoutAdxThreshold) * 1.5);
      reasons.push("Confirmed BOS is supported by directional ADX strength.");
    } else if (
      context.analysis.trend !== Trend.Ranging &&
      context.analysis.structure !== MarketStructure.Range &&
      adx !== null &&
      adx >= config.trendAdxThreshold
    ) {
      regime = "TRENDING";
      confidence = 60 + Math.min(25, adx - config.trendAdxThreshold);
      reasons.push("Trend, market structure and ADX support continuation.");
    } else if (
      context.analysis.structure === MarketStructure.Range ||
      (adx !== null && adx <= config.rangeAdxThreshold)
    ) {
      regime = "RANGING";
      confidence = 60 + (adx === null ? 0 : Math.min(20, config.rangeAdxThreshold - adx));
      reasons.push("Range structure or weak ADX indicates non-trending conditions.");
    } else {
      reasons.push("Regime inputs are mixed and do not support a strong classification.");
    }

    if (bandwidth !== null && bandwidth > 0) {
      reasons.push(`Bollinger bandwidth is ${NumberUtils.round(bandwidth, 4)}.`);
    }

    if (context.multiTimeframe) {
      confidence += Math.min(10, context.multiTimeframe.confidence / 10);
      reasons.push("Multi-timeframe analysis was available for regime confirmation.");
    }

    confidence = NumberUtils.clamp(confidence, 0, 100);

    return {
      regime,
      confidence: NumberUtils.round(confidence),
      reasons,
      metrics: {
        adx,
        bollingerBandwidth: bandwidth,
        volatilityPercent: context.analysis.metrics.volatilityPercent,
        confirmedBosCount: confirmedBos.length,
        confirmedChochCount: confirmedChoch.length,
      },
    };
  }
}
