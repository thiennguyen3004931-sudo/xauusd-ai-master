import type {
  Phase7CPerformanceEntryType,
  Phase7CPerformanceManagementEvent,
  Phase7CPerformanceSide,
  Phase7CPerformanceStrategy,
} from "../contracts/phase7c-performance-effectiveness.schema";
import {
  PHASE7C_COUNTERFACTUAL_INTELLIGENCE_SCHEMA_VERSION,
  type Phase7CCounterfactualOutcome,
  type Phase7CCounterfactualScenario,
  type Phase7CCounterfactualSafety,
} from "../contracts/phase7c-counterfactual-intelligence.schema";

const CURRENT_ACTIVATION_PRICE = 10;
const CURRENT_GIVEBACK_PRICE = 10;
const EPSILON = 1e-9;

export interface Phase7COrderedExitSidePrice {
  timestamp: number;
  price: number;
}

export interface Phase7CFastMoveCounterfactualInput {
  tradeKey: string;
  positionId: string;
  strategy: Phase7CPerformanceStrategy;
  side: Phase7CPerformanceSide;
  entryType?: Phase7CPerformanceEntryType;
  regime?: string | null;
  entry: number;
  actualExit: number;
  actualNetPnl: number;
  actualRealizedR: number | null;
  exactCorrelation: boolean;
  exactManagementEvidence: boolean;
  managementEvents: readonly Phase7CPerformanceManagementEvent[];
  orderedExitSidePrices?: readonly Phase7COrderedExitSidePrice[];
  orderedExitSideEvidenceComplete?: boolean;
  alternativeGivebackPrice: number;
}

interface ReplayResult {
  triggered: boolean;
  stopHit: boolean;
  exitPrice: number | null;
  lockedProfitPrice: number | null;
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

export function phase7CCounterfactualSafety(): Phase7CCounterfactualSafety {
  return {
    readOnly: true,
    shadowOnly: true,
    runtimeMutation: false,
    strategyMutation: false,
    riskMutation: false,
    orderMutation: false,
    positionMutation: false,
    modeMutation: false,
    armMutation: false,
    autoApply: false,
    autoRetune: false,
    liveTestOrder: false,
  };
}

function favorableDistance(side: Phase7CPerformanceSide, entry: number, price: number): number {
  const raw = side === "BUY" ? price - entry : entry - price;
  return round(Math.max(0, raw));
}

function sideAwareExitDelta(
  side: Phase7CPerformanceSide,
  actualExit: number | null,
  shadowExit: number | null,
): number | null {
  if (actualExit === null || shadowExit === null) return null;
  return round(side === "BUY" ? shadowExit - actualExit : actualExit - shadowExit);
}

function explicitLockedProfit(
  side: Phase7CPerformanceSide,
  entry: number,
  events: readonly Phase7CPerformanceManagementEvent[],
): number | null {
  const values = events
    .filter((event) => event.family === "FAST_MOVE_TIGHTEN")
    .map((event) => event.stopLoss)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .map((stopLoss) => favorableDistance(side, entry, stopLoss))
    .filter((value) => value > 0);
  return values.length > 0 ? Math.max(...values) : null;
}

function boundedAlternativeLockedProfit(
  side: Phase7CPerformanceSide,
  entry: number,
  events: readonly Phase7CPerformanceManagementEvent[],
  givebackPrice: number,
): { value: number | null; sources: string[] } {
  const qualifying = events.filter(
    (event) =>
      event.family === "FAST_MOVE_TIGHTEN" &&
      typeof event.price === "number" &&
      Number.isFinite(event.price),
  );
  if (qualifying.length === 0) return { value: null, sources: [] };

  let bestFavorablePrice = entry;
  for (const event of qualifying) {
    const price = Number(event.price);
    bestFavorablePrice = side === "BUY"
      ? Math.max(bestFavorablePrice, price)
      : Math.min(bestFavorablePrice, price);
  }
  const peakFavorable = favorableDistance(side, entry, bestFavorablePrice);
  if (peakFavorable + EPSILON < CURRENT_ACTIVATION_PRICE) {
    return {
      value: null,
      sources: [...new Set(qualifying.map((event) => event.source).filter(Boolean))],
    };
  }
  const candidate = side === "BUY"
    ? bestFavorablePrice - givebackPrice
    : bestFavorablePrice + givebackPrice;
  const locked = favorableDistance(side, entry, candidate);
  return {
    value: locked > 0 ? locked : null,
    sources: [...new Set(qualifying.map((event) => event.source).filter(Boolean))],
  };
}

function validOrderedPrices(
  prices: readonly Phase7COrderedExitSidePrice[],
): Phase7COrderedExitSidePrice[] | null {
  if (prices.length === 0) return null;
  const ordered = prices.map((sample) => ({
    timestamp: Number(sample.timestamp),
    price: Number(sample.price),
  }));
  if (
    ordered.some(
      (sample) =>
        !Number.isFinite(sample.timestamp) ||
        !Number.isFinite(sample.price) ||
        sample.price <= 0,
    )
  ) {
    return null;
  }
  ordered.sort((left, right) => left.timestamp - right.timestamp);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].timestamp <= ordered[index - 1].timestamp) return null;
  }
  return ordered;
}

function replayOrderedPrices(
  side: Phase7CPerformanceSide,
  entry: number,
  prices: readonly Phase7COrderedExitSidePrice[],
  givebackPrice: number,
  fallbackExit: number,
): ReplayResult {
  if (prices.length === 0) {
    return { triggered: false, stopHit: false, exitPrice: null, lockedProfitPrice: null };
  }

  let bestFavorablePrice = entry;
  let triggered = false;
  let stopPrice: number | null = null;

  for (const sample of prices) {
    bestFavorablePrice = side === "BUY"
      ? Math.max(bestFavorablePrice, sample.price)
      : Math.min(bestFavorablePrice, sample.price);
    const favorable = favorableDistance(side, entry, bestFavorablePrice);
    if (favorable + EPSILON >= CURRENT_ACTIVATION_PRICE) {
      triggered = true;
      const candidate = side === "BUY"
        ? bestFavorablePrice - givebackPrice
        : bestFavorablePrice + givebackPrice;
      const candidateLocked = favorableDistance(side, entry, candidate);
      if (candidateLocked > 0) {
        stopPrice = stopPrice === null
          ? candidate
          : side === "BUY"
            ? Math.max(stopPrice, candidate)
            : Math.min(stopPrice, candidate);
      }
    }

    if (stopPrice !== null) {
      const hit = side === "BUY" ? sample.price <= stopPrice : sample.price >= stopPrice;
      if (hit) {
        const exitPrice = round(stopPrice);
        return {
          triggered,
          stopHit: true,
          exitPrice,
          lockedProfitPrice: favorableDistance(side, entry, exitPrice),
        };
      }
    }
  }

  const exitPrice = round(fallbackExit);
  return {
    triggered,
    stopHit: false,
    exitPrice,
    lockedProfitPrice: favorableDistance(side, entry, exitPrice),
  };
}

function unavailableOutcome(): Phase7CCounterfactualOutcome {
  return {
    exitPrice: null,
    netPnl: null,
    realizedR: null,
    lockedProfitPrice: null,
  };
}

export function evaluateFastMoveCounterfactual(
  input: Phase7CFastMoveCounterfactualInput,
): Phase7CCounterfactualScenario {
  const entry = Number(input.entry);
  const actualExit = Number(input.actualExit);
  const alternativeGivebackPrice = Number(input.alternativeGivebackPrice);
  if (!(entry > 0) || !(actualExit > 0) || !(alternativeGivebackPrice > 0)) {
    throw new Error("Fast-Move counterfactual requires positive entry, exit, and giveback prices.");
  }

  const base = {
    schemaVersion: PHASE7C_COUNTERFACTUAL_INTELLIGENCE_SCHEMA_VERSION,
    scenarioId: `${input.tradeKey}:FAST_MOVE_GIVEBACK:${alternativeGivebackPrice}`,
    tradeKey: input.tradeKey,
    positionId: input.positionId,
    strategy: input.strategy,
    side: input.side,
    entryType: input.entryType ?? "UNKNOWN",
    regime: input.regime ?? null,
    family: "FAST_MOVE_GIVEBACK" as const,
    mode: "SHADOW_ONLY" as const,
    baseline: {
      description: "CURRENT_FAST_MOVE_GIVEBACK",
      activationPrice: CURRENT_ACTIVATION_PRICE,
      givebackPrice: CURRENT_GIVEBACK_PRICE,
      ruleId: null,
      ruleState: null,
      managementFamily: "FAST_MOVE_TIGHTEN",
    },
    alternative: {
      description: "SHADOW_FAST_MOVE_GIVEBACK",
      activationPrice: CURRENT_ACTIVATION_PRICE,
      givebackPrice: alternativeGivebackPrice,
      ruleId: null,
      ruleState: "ALTERNATIVE" as const,
      managementFamily: "FAST_MOVE_TIGHTEN",
    },
    safety: phase7CCounterfactualSafety(),
  };

  const actualObservedLocked = explicitLockedProfit(input.side, entry, input.managementEvents);
  const actualOutcome: Phase7CCounterfactualOutcome = {
    exitPrice: round(actualExit),
    netPnl: Number.isFinite(Number(input.actualNetPnl)) ? round(Number(input.actualNetPnl)) : null,
    realizedR: typeof input.actualRealizedR === "number" && Number.isFinite(input.actualRealizedR)
      ? round(input.actualRealizedR)
      : null,
    lockedProfitPrice: actualObservedLocked,
  };

  if (!input.exactCorrelation) {
    return {
      ...base,
      evidence: { verdict: "UNAVAILABLE", sources: [] },
      actualOutcome,
      shadowOutcome: unavailableOutcome(),
      delta: { exitPrice: null, netPnl: null, realizedR: null, lockedProfitPrice: null },
      quality: { warnings: ["CORRELATION_NOT_EXACT"] },
    };
  }

  const orderedInput = input.orderedExitSidePrices ?? [];
  const ordered = validOrderedPrices(orderedInput);
  const orderedEvidenceComplete = input.orderedExitSideEvidenceComplete === true;
  const orderedEvidenceReplayable = orderedEvidenceComplete && ordered !== null;
  const orderedEvidenceWarning = orderedInput.length > 0 && !orderedEvidenceReplayable
    ? orderedEvidenceComplete
      ? "ORDERED_EXIT_SIDE_EVIDENCE_INVALID"
      : "ORDERED_EXIT_SIDE_EVIDENCE_INCOMPLETE"
    : null;

  if (orderedEvidenceReplayable && ordered !== null) {
    const replay = replayOrderedPrices(
      input.side,
      entry,
      ordered,
      alternativeGivebackPrice,
      actualExit,
    );
    const actualComparableLocked = favorableDistance(input.side, entry, actualExit);
    const shadowOutcome: Phase7CCounterfactualOutcome = {
      exitPrice: replay.exitPrice,
      netPnl: null,
      realizedR: null,
      lockedProfitPrice: replay.lockedProfitPrice,
    };
    return {
      ...base,
      evidence: { verdict: "EXACT", sources: ["ORDERED_EXIT_SIDE_PRICES_COMPLETE"] },
      actualOutcome: {
        ...actualOutcome,
        lockedProfitPrice: actualComparableLocked,
      },
      shadowOutcome,
      delta: {
        exitPrice: sideAwareExitDelta(input.side, actualExit, shadowOutcome.exitPrice),
        netPnl: null,
        realizedR: null,
        lockedProfitPrice: shadowOutcome.lockedProfitPrice === null
          ? null
          : round(shadowOutcome.lockedProfitPrice - actualComparableLocked),
      },
      quality: {
        warnings: ["COUNTERFACTUAL_PNL_NOT_COMPUTED_WITHOUT_EXECUTION_VALUE_MODEL"],
      },
    };
  }

  if (input.exactManagementEvidence) {
    const bounded = boundedAlternativeLockedProfit(
      input.side,
      entry,
      input.managementEvents,
      alternativeGivebackPrice,
    );
    if (bounded.value !== null) {
      const shadowOutcome: Phase7CCounterfactualOutcome = {
        exitPrice: null,
        netPnl: null,
        realizedR: null,
        lockedProfitPrice: bounded.value,
      };
      return {
        ...base,
        evidence: {
          verdict: "BOUNDED",
          sources: bounded.sources.length > 0 ? bounded.sources : ["EXPLICIT_MANAGEMENT_EVENT"],
        },
        actualOutcome,
        shadowOutcome,
        delta: {
          exitPrice: null,
          netPnl: null,
          realizedR: null,
          lockedProfitPrice: actualObservedLocked === null
            ? null
            : round(bounded.value - actualObservedLocked),
        },
        quality: {
          warnings: [
            ...(orderedEvidenceWarning ? [orderedEvidenceWarning] : []),
            "COUNTERFACTUAL_EXIT_NOT_PROVABLE",
            "COUNTERFACTUAL_PNL_NOT_PROVABLE",
          ],
        },
      };
    }
  }

  return {
    ...base,
    evidence: { verdict: "UNAVAILABLE", sources: [] },
    actualOutcome,
    shadowOutcome: unavailableOutcome(),
    delta: { exitPrice: null, netPnl: null, realizedR: null, lockedProfitPrice: null },
    quality: {
      warnings: orderedEvidenceWarning
        ? [orderedEvidenceWarning]
        : [
            input.exactManagementEvidence
              ? "ORDERED_OR_EXPLICIT_FAST_MOVE_EVIDENCE_MISSING"
              : "MANAGEMENT_EVIDENCE_NOT_EXACT",
          ],
    },
  };
}
