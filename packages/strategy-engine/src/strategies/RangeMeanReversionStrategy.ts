import { MarketStructure, SignalType, TradingSession } from "@xauusd/types";
import type { StrategyEngineConfig } from "../config";
import type {
  MarketRegimeAssessment,
  StrategyCandidate,
  StrategyContext,
} from "../models";
import { PriceLocationUtils } from "../utils";
import { BaseStrategy } from "./BaseStrategy";

export class RangeMeanReversionStrategy extends BaseStrategy {
  readonly id = "RANGE_MEAN_REVERSION" as const;
  readonly name = "Range Mean Reversion";
  readonly supportedRegimes = ["RANGING"] as const;
  readonly supportedSessions = [
    TradingSession.ASIAN,
    TradingSession.LONDON,
    TradingSession.NEW_YORK,
  ] as const;

  evaluate(
    context: StrategyContext,
    regime: MarketRegimeAssessment,
    session: TradingSession,
    config: StrategyEngineConfig,
  ): StrategyCandidate {
    const signal = context.signalResult.signal;
    const direction = signal?.type ?? SignalType.NONE;
    const isRange = context.analysis.structure === MarketStructure.Range;
    const adx = context.indicators.latest.adx.adx;
    const weakTrend = adx !== null && adx <= config.rangeAdxThreshold;
    const favorableLocation = signal
      ? PriceLocationUtils.isFavorable(direction, context.indicators.latest.close, context.analysis)
      : false;
    const percentB = context.indicators.latest.bollingerBands.percentB;
    const bandExtreme = signal
      ? direction === SignalType.BUY
        ? (percentB ?? 0.5) <= 0.2
        : (percentB ?? 0.5) >= 0.8
      : false;
    const sessionSupported = this.supportedSessions.includes(session as never);
    const asianAllowed = session !== TradingSession.ASIAN || config.allowAsianRangeMeanReversion;
    const regimeSupported = this.supportedRegimes.includes(regime.regime as never);

    const eligible = Boolean(
      signal && isRange && weakTrend && favorableLocation && regimeSupported && sessionSupported && asianAllowed,
    );

    return this.candidate(
      direction,
      {
        signal: signal ? Math.min(18, signal.confidence * 0.18) : 0,
        structure: isRange ? 25 : 0,
        regime: regimeSupported ? Math.min(15, regime.confidence * 0.15) : 0,
        momentum: weakTrend ? 12 : 0,
        location: favorableLocation && bandExtreme ? 20 : favorableLocation ? 12 : 0,
        multiTimeframe: context.multiTimeframe?.bias ? 3 : 5,
        session: sessionSupported && asianAllowed ? 5 : 0,
      },
      eligible,
      [
        isRange ? "Market structure is ranging." : "Market structure is not ranging.",
        weakTrend ? "ADX confirms weak directional pressure." : "ADX is too strong for mean reversion.",
        favorableLocation ? "Price is at a favorable range extreme." : "Price is not at a favorable range extreme.",
        bandExtreme ? "Bollinger percent-B confirms a band extreme." : "Bollinger percent-B is not extreme.",
      ],
      ["A confirmed BOS forms away from the range boundary.", "Price closes beyond the approved stop-loss and range extreme."],
      [],
      config,
    );
  }
}
