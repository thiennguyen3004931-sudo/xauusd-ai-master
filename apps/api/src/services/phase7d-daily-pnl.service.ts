import { runPhase7CCanonicalBacktest } from "./phase7c.service";

export type Phase7DDailyPnlRequest = {
  from: string;
  to: string;
  fixedVolume?: number;
  recoveryMinPrice?: number;
  recoveryMaxPrice?: number;
  profitBufferUsd?: number;
  positiveLockFloorUsd?: number;
  dayUtcOffsetHours?: number;
};

type Side = "BUY" | "SELL";

type CanonicalTrade = {
  entryTime: number;
  exitTime: number;
  side: Side;
  pattern: string;
  entry: number;
  exit: number;
  stopLoss: number;
  stopDistance: number;
  volume: number;
  pnl: number;
  initialRiskUsd?: number;
};

type Bar = {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  spread: number;
};

type Outcome = {
  entryTime: number;
  exitTime: number;
  side: Side;
  pattern: string;
  pnl: number;
  mode: "BASELINE" | "RECOVERY" | "TREND" | "BLOCKED_POSITIVE_LOCK";
  exitReason: string;
  recoveryTargetPriceMove: number | null;
  dayPnlBeforeEntry: number;
  initialRiskUsd: number;
  blocked: boolean;
};

type DayState = {
  day: string;
  pnl: number;
  trades: number;
  blocked: number;
  recoveryTrades: number;
  wentNegative: boolean;
};

type LaneConfig = {
  name: "BASELINE" | "RECOVERY" | "RECOVERY_PLUS_LOCK";
  useRecovery: boolean;
  usePositiveLock: boolean;
};

const DAY_MS = 86_400_000;
const BE_TRIGGER = 6;

function bridgeBase(): string {
  return (process.env.MT5_BRIDGE_BASE_URL ?? "http://127.0.0.1:8765").trim().replace(/\/$/, "");
}

function bridgeApiKey(): string {
  const value = process.env.MT5_BRIDGE_API_KEY?.trim() ?? "";
  if (!value) throw new Error("MT5_BRIDGE_API_KEY is not configured for Phase 7D.");
  return value;
}

async function bridgeGet<T>(path: string, timeoutMs = 60_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${bridgeBase()}${path}`, {
      headers: { "x-mt5-api-key": bridgeApiKey() },
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`MT5 bridge ${response.status}: ${text}`);
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function runPhase7DDailyPnlResearch(input: Phase7DDailyPnlRequest) {
  const fixedVolume = finite(input.fixedVolume, 0.03);
  const recoveryMinPrice = finite(input.recoveryMinPrice, 6);
  const recoveryMaxPrice = finite(input.recoveryMaxPrice, 10);
  const profitBufferUsd = Math.max(0, finite(input.profitBufferUsd, 3));
  const positiveLockFloorUsd = Math.max(0, finite(input.positiveLockFloorUsd, 0));
  const dayUtcOffsetHours = finite(input.dayUtcOffsetHours, 7);

  if (!(fixedVolume > 0)) throw new Error("fixedVolume must be positive.");
  if (!(recoveryMinPrice > 0) || !(recoveryMaxPrice >= recoveryMinPrice)) {
    throw new Error("Recovery price range is invalid.");
  }
  if (recoveryMaxPrice > 30) throw new Error("recoveryMaxPrice must be <= 30.");
  if (dayUtcOffsetHours < -12 || dayUtcOffsetHours > 14) throw new Error("dayUtcOffsetHours must be between -12 and +14.");

  const fromMs = Date.parse(input.from);
  const toStartMs = Date.parse(input.to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toStartMs)) throw new Error("Invalid from/to date.");
  const toMs = toStartMs + DAY_MS;
  if (fromMs >= toMs) throw new Error("from must be before to.");

  const [backtest, m5] = await Promise.all([
    runPhase7CCanonicalBacktest({ from: input.from, to: input.to, fixedVolume }),
    bridgeGet<Bar[]>(`/v1/history/candles/XAUUSD?timeframe=M5&fromMs=${fromMs}&toMs=${toMs}`, 90_000),
  ]);

  const cashPerPriceUnitPerLot = Number(backtest.broker.cashPerPriceUnitPerLot);
  if (!(cashPerPriceUnitPerLot > 0)) throw new Error("Broker cash-per-price-unit value is unavailable.");

  const schedule = ([...backtest.trades] as CanonicalTrade[]).sort((a, b) => a.entryTime - b.entryTime);
  const sortedM5 = [...m5].sort((a, b) => a.openTime - b.openTime);
  const m5OpenTimes = sortedM5.map((bar) => bar.openTime);

  const common = {
    recoveryMinPrice,
    recoveryMaxPrice,
    profitBufferUsd,
    positiveLockFloorUsd,
    dayUtcOffsetHours,
    cashPerPriceUnitPerLot,
    m5: sortedM5,
    m5OpenTimes,
  };

  const baseline = simulateLane(schedule, { name: "BASELINE", useRecovery: false, usePositiveLock: false }, common);
  const recovery = simulateLane(schedule, { name: "RECOVERY", useRecovery: true, usePositiveLock: false }, common);
  const recoveryPlusLock = simulateLane(schedule, { name: "RECOVERY_PLUS_LOCK", useRecovery: true, usePositiveLock: true }, common);

  const decision = evaluateDecision(baseline.metrics, recovery.metrics, recoveryPlusLock.metrics, schedule.length);

  return {
    source: "PHASE7D_DAILY_PNL_RESEARCH",
    generatedAt: Date.now(),
    safety: {
      researchOnly: true,
      executionMutation: false,
      phase7bStrategyMutation: false,
      fixedVolumeUnchanged: true,
      liveUnlockAvailable: false,
      profitGuarantee: false,
    },
    configuration: {
      from: input.from,
      to: input.to,
      fixedVolume,
      recoveryMinPrice,
      recoveryMaxPrice,
      profitBufferUsd,
      positiveLockFloorUsd,
      dayUtcOffsetHours,
      comparedTradeSchedule: schedule.length,
      fullPeriodCanonicalTrades: backtest.metrics.trades,
      journalTradeLimitApplied: backtest.metrics.trades > schedule.length,
    },
    baseline,
    recovery,
    recoveryPlusLock,
    decision,
    notes: [
      "Research only: no Phase 7B DEMO order, stop, volume or management setting is changed.",
      "Recovery mode is used only when realized P/L of the local trading day is negative at entry. Dynamic full-exit target is clamped to the configured 6-10 price range by default.",
      "Recovery mode applies the existing +6 break-even protection while waiting for a target above +6.",
      "Positive Lock blocks a new trend-mode trade when its initial SL risk could reduce an already-positive trading day to the configured floor or below.",
      "A positive day can be targeted but cannot be guaranteed. Historical replay is not a promise of future daily profit.",
      "M5 OHLC is used for recovery TP/BE path approximation with conservative STOP_FIRST priority when one bar contains conflicting paths.",
      "The comparison uses the canonical trades returned by Phase 7C. If journalTradeLimitApplied=true, use a shorter date range before making conclusions.",
    ],
  };
}

function simulateLane(
  schedule: CanonicalTrade[],
  lane: LaneConfig,
  common: {
    recoveryMinPrice: number;
    recoveryMaxPrice: number;
    profitBufferUsd: number;
    positiveLockFloorUsd: number;
    dayUtcOffsetHours: number;
    cashPerPriceUnitPerLot: number;
    m5: Bar[];
    m5OpenTimes: number[];
  },
) {
  const dayStates = new Map<string, DayState>();
  const outcomes: Outcome[] = [];

  const getDay = (timestamp: number) => {
    const key = dayKey(timestamp, common.dayUtcOffsetHours);
    let state = dayStates.get(key);
    if (!state) {
      state = { day: key, pnl: 0, trades: 0, blocked: 0, recoveryTrades: 0, wentNegative: false };
      dayStates.set(key, state);
    }
    return state;
  };

  for (const trade of schedule) {
    const entryDay = getDay(trade.entryTime);
    const dayPnlBeforeEntry = entryDay.pnl;
    const initialRiskUsd = Number.isFinite(trade.initialRiskUsd)
      ? Number(trade.initialRiskUsd)
      : trade.stopDistance * common.cashPerPriceUnitPerLot * trade.volume;

    const recoveryMode = lane.useRecovery && dayPnlBeforeEntry < 0;
    const trendMode = !recoveryMode;

    if (
      lane.usePositiveLock &&
      trendMode &&
      dayPnlBeforeEntry > common.positiveLockFloorUsd &&
      dayPnlBeforeEntry - initialRiskUsd <= common.positiveLockFloorUsd
    ) {
      entryDay.blocked += 1;
      outcomes.push({
        entryTime: trade.entryTime,
        exitTime: trade.entryTime,
        side: trade.side,
        pattern: trade.pattern,
        pnl: 0,
        mode: "BLOCKED_POSITIVE_LOCK",
        exitReason: "POSITIVE_DAY_LOCK",
        recoveryTargetPriceMove: null,
        dayPnlBeforeEntry: round(dayPnlBeforeEntry, 2),
        initialRiskUsd: round(initialRiskUsd, 2),
        blocked: true,
      });
      continue;
    }

    let result: { pnl: number; exitTime: number; exitReason: string; targetMove: number | null };
    if (recoveryMode) {
      const requiredMove = (-dayPnlBeforeEntry + common.profitBufferUsd) /
        (common.cashPerPriceUnitPerLot * trade.volume);
      const targetMove = clamp(requiredMove, common.recoveryMinPrice, common.recoveryMaxPrice);
      result = simulateRecoveryTrade(trade, targetMove, common);
      entryDay.recoveryTrades += 1;
    } else {
      result = {
        pnl: trade.pnl,
        exitTime: trade.exitTime,
        exitReason: "CANONICAL_BASELINE",
        targetMove: null,
      };
    }

    const exitDay = getDay(result.exitTime);
    exitDay.pnl += result.pnl;
    exitDay.trades += 1;
    if (exitDay.pnl < 0) exitDay.wentNegative = true;

    outcomes.push({
      entryTime: trade.entryTime,
      exitTime: result.exitTime,
      side: trade.side,
      pattern: trade.pattern,
      pnl: round(result.pnl, 2),
      mode: lane.name === "BASELINE" ? "BASELINE" : recoveryMode ? "RECOVERY" : "TREND",
      exitReason: result.exitReason,
      recoveryTargetPriceMove: result.targetMove === null ? null : round(result.targetMove, 4),
      dayPnlBeforeEntry: round(dayPnlBeforeEntry, 2),
      initialRiskUsd: round(initialRiskUsd, 2),
      blocked: false,
    });
  }

  const days = [...dayStates.values()]
    .filter((day) => day.trades > 0 || day.blocked > 0)
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((day) => ({
      ...day,
      pnl: round(day.pnl, 2),
      recoveredFromNegative: day.wentNegative && day.pnl > 0,
    }));

  return {
    lane: lane.name,
    metrics: summarizeLane(outcomes, days),
    days: days.slice(-370).reverse(),
    outcomes: outcomes.slice(-1500).reverse(),
  };
}

function simulateRecoveryTrade(
  trade: CanonicalTrade,
  targetMove: number,
  common: {
    recoveryMinPrice: number;
    recoveryMaxPrice: number;
    profitBufferUsd: number;
    positiveLockFloorUsd: number;
    dayUtcOffsetHours: number;
    cashPerPriceUnitPerLot: number;
    m5: Bar[];
    m5OpenTimes: number[];
  },
) {
  const start = lowerBound(common.m5OpenTimes, trade.entryTime);
  let activeStop = trade.stopLoss;
  let beApplied = false;

  for (let index = start; index < common.m5.length; index += 1) {
    const bar = common.m5[index]!;
    if (bar.openTime > trade.exitTime) break;

    if (stopTouched(trade.side, bar, activeStop)) {
      const reason = beApplied && Math.abs(activeStop - trade.entry) < 1e-8 ? "RECOVERY_BE" : "RECOVERY_STOP";
      return {
        pnl: pnlUsd(trade.side, trade.entry, activeStop, trade.volume, common.cashPerPriceUnitPerLot),
        exitTime: Math.min(bar.closeTime, trade.exitTime),
        exitReason: reason,
        targetMove,
      };
    }

    if (targetTouched(trade.side, trade.entry, targetMove, bar)) {
      const targetPrice = trade.side === "BUY" ? trade.entry + targetMove : trade.entry - targetMove;
      return {
        pnl: targetMove * common.cashPerPriceUnitPerLot * trade.volume,
        exitTime: Math.min(bar.closeTime, trade.exitTime),
        exitReason: "RECOVERY_TP",
        targetMove,
      };
    }

    if (!beApplied && favorableMove(trade.side, trade.entry, bar) >= BE_TRIGGER) {
      activeStop = improveStop(trade.side, activeStop, trade.entry);
      beApplied = true;
    }
  }

  return {
    pnl: pnlUsd(trade.side, trade.entry, trade.exit, trade.volume, common.cashPerPriceUnitPerLot),
    exitTime: trade.exitTime,
    exitReason: "RECOVERY_BASELINE_FALLBACK",
    targetMove,
  };
}

function summarizeLane(
  outcomes: Outcome[],
  days: Array<DayState & { recoveredFromNegative: boolean }>,
) {
  const executed = outcomes.filter((item) => !item.blocked);
  const blocked = outcomes.filter((item) => item.blocked);
  const wins = executed.filter((item) => item.pnl > 0).length;
  const grossProfit = executed.reduce((sum, item) => sum + Math.max(0, item.pnl), 0);
  const grossLoss = Math.abs(executed.reduce((sum, item) => sum + Math.min(0, item.pnl), 0));
  const netPnl = executed.reduce((sum, item) => sum + item.pnl, 0);
  let equity = 0;
  let peak = 0;
  let maxDrawdownUsd = 0;
  for (const item of [...executed].sort((a, b) => a.exitTime - b.exitTime)) {
    equity += item.pnl;
    peak = Math.max(peak, equity);
    maxDrawdownUsd = Math.max(maxDrawdownUsd, peak - equity);
  }

  const daily = days.map((day) => day.pnl);
  const positiveDays = daily.filter((value) => value > 0).length;
  const negativeDays = daily.filter((value) => value < 0).length;
  const flatDays = daily.length - positiveDays - negativeDays;
  const recoveryTargets = executed
    .map((item) => item.recoveryTargetPriceMove)
    .filter((value): value is number => value !== null);

  return {
    trades: executed.length,
    blockedTrades: blocked.length,
    winRatePercent: round(executed.length ? wins / executed.length * 100 : 0, 2),
    netPnl: round(netPnl, 2),
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 4) : grossProfit > 0 ? null : 0,
    expectancy: round(executed.length ? netPnl / executed.length : 0, 4),
    maxDrawdownUsd: round(maxDrawdownUsd, 2),
    activeDays: daily.length,
    positiveDays,
    negativeDays,
    flatDays,
    positiveDayRatePercent: round(daily.length ? positiveDays / daily.length * 100 : 0, 2),
    averageDailyPnl: round(avg(daily), 2),
    medianDailyPnl: round(median(daily), 2),
    bestDayUsd: round(daily.length ? Math.max(...daily) : 0, 2),
    worstDayUsd: round(daily.length ? Math.min(...daily) : 0, 2),
    maxConsecutiveLosingDays: maxConsecutiveLosingDays(daily),
    recoveredDays: days.filter((day) => day.recoveredFromNegative).length,
    recoveryTrades: executed.filter((item) => item.mode === "RECOVERY").length,
    recoveryTpHits: executed.filter((item) => item.exitReason === "RECOVERY_TP").length,
    recoveryBeExits: executed.filter((item) => item.exitReason === "RECOVERY_BE").length,
    averageRecoveryTargetPrice: round(avg(recoveryTargets), 4),
    positiveLockBlockedTrades: blocked.filter((item) => item.exitReason === "POSITIVE_DAY_LOCK").length,
    positiveLockBlockedDays: new Set(blocked.map((item) => dayKey(item.entryTime, 7))).size,
  };
}

function evaluateDecision(
  baseline: ReturnType<typeof summarizeLane>,
  recovery: ReturnType<typeof summarizeLane>,
  lock: ReturnType<typeof summarizeLane>,
  scheduleTrades: number,
) {
  const candidates = [
    scoreCandidate("RECOVERY", baseline, recovery),
    scoreCandidate("RECOVERY_PLUS_LOCK", baseline, lock),
  ].sort((a, b) => b.score - a.score);
  const best = candidates[0]!;
  const sufficientSample = scheduleTrades >= 100 && baseline.activeDays >= 30;
  const hardPass =
    best.metrics.netPnl > baseline.netPnl &&
    (best.metrics.profitFactor ?? 999) >= 1 &&
    best.metrics.positiveDayRatePercent > baseline.positiveDayRatePercent &&
    best.metrics.maxDrawdownUsd <= baseline.maxDrawdownUsd * 1.2 + 1e-9;

  return {
    sampleTrades: scheduleTrades,
    sampleDays: baseline.activeDays,
    sufficientSample,
    recommendedLane: sufficientSample && hardPass ? best.lane : "KEEP_BASELINE_RESEARCH",
    verdict: !sufficientSample
      ? "INSUFFICIENT_SAMPLE"
      : hardPass
        ? "RESEARCH_PROMISING"
        : "NO_CLEAR_IMPROVEMENT",
    executionEligible: false,
    bestResearchScore: best.score,
    candidates,
    reason: !sufficientSample
      ? "Need at least 100 compared trades and 30 active trading days before judging daily P/L controls."
      : hardPass
        ? "Best research lane improves positive-day rate and total economics without increasing max drawdown by more than 20%."
        : "No candidate passes all research guards at the same time; keep Phase 7B execution unchanged.",
  };
}

function scoreCandidate(
  lane: "RECOVERY" | "RECOVERY_PLUS_LOCK",
  baseline: ReturnType<typeof summarizeLane>,
  metrics: ReturnType<typeof summarizeLane>,
) {
  let score = 0;
  const positiveDayDelta = metrics.positiveDayRatePercent - baseline.positiveDayRatePercent;
  if (positiveDayDelta >= 10) score += 35;
  else if (positiveDayDelta >= 5) score += 28;
  else if (positiveDayDelta > 0) score += 18;

  if (metrics.netPnl >= baseline.netPnl) score += 20;
  else if (metrics.netPnl >= baseline.netPnl * 0.9) score += 10;

  const pf = metrics.profitFactor ?? 999;
  const baselinePf = baseline.profitFactor ?? 999;
  if (pf >= 1 && pf >= baselinePf) score += 15;
  else if (pf >= 1) score += 10;

  if (metrics.maxDrawdownUsd <= baseline.maxDrawdownUsd) score += 20;
  else if (metrics.maxDrawdownUsd <= baseline.maxDrawdownUsd * 1.1) score += 12;
  else if (metrics.maxDrawdownUsd <= baseline.maxDrawdownUsd * 1.2) score += 5;

  if (metrics.worstDayUsd >= baseline.worstDayUsd) score += 10;

  return {
    lane,
    score,
    metrics,
    deltas: {
      positiveDayRatePercent: round(positiveDayDelta, 2),
      netPnl: round(metrics.netPnl - baseline.netPnl, 2),
      profitFactor: metrics.profitFactor !== null && baseline.profitFactor !== null
        ? round(metrics.profitFactor - baseline.profitFactor, 4)
        : null,
      maxDrawdownUsd: round(metrics.maxDrawdownUsd - baseline.maxDrawdownUsd, 2),
      worstDayUsd: round(metrics.worstDayUsd - baseline.worstDayUsd, 2),
    },
  };
}

function dayKey(timestamp: number, utcOffsetHours: number): string {
  const shifted = new Date(timestamp + utcOffsetHours * 3_600_000);
  return shifted.toISOString().slice(0, 10);
}

function targetTouched(side: Side, entry: number, move: number, bar: Bar): boolean {
  return side === "BUY"
    ? bar.high >= entry + move - 1e-9
    : bar.low + bar.spread <= entry - move + 1e-9;
}

function favorableMove(side: Side, entry: number, bar: Bar): number {
  return side === "BUY" ? bar.high - entry : entry - (bar.low + bar.spread);
}

function stopTouched(side: Side, bar: Bar, stop: number): boolean {
  return side === "BUY" ? bar.low <= stop + 1e-9 : bar.high + bar.spread >= stop - 1e-9;
}

function improveStop(side: Side, current: number, candidate: number): number {
  return side === "BUY" ? Math.max(current, candidate) : Math.min(current, candidate);
}

function pnlUsd(side: Side, entry: number, exit: number, volume: number, cashPerPriceUnitPerLot: number): number {
  const move = side === "BUY" ? exit - entry : entry - exit;
  return move * cashPerPriceUnitPerLot * volume;
}

function lowerBound(values: number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (values[mid]! < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

function maxConsecutiveLosingDays(values: number[]): number {
  let current = 0;
  let best = 0;
  for (const value of values) {
    if (value < 0) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

function avg(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function finite(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
