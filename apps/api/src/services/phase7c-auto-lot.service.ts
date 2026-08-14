import {
  getPhase7CAccountRisk,
  runPhase7CCanonicalBacktest,
  type Phase7CBacktestRequest,
} from "./phase7c.service";

export type Phase7CAutoLotBacktestRequest = Phase7CBacktestRequest & {
  riskPercent?: number;
  maxAutoLot?: number;
  startingBalance?: number;
};

type ShadowTrade = {
  entryTime: number;
  side: "BUY" | "SELL";
  pattern: string;
  stopDistance: number;
  fixedLot: number;
  fixedPnl: number;
  balanceBefore: number;
  targetRiskUsd: number;
  rawLot: number;
  autoLot: number;
  autoRiskUsd: number;
  autoRiskPercent: number;
  autoPnl: number;
  balanceAfter: number;
  status: "EXECUTE" | "BLOCK";
  reason: string;
};

type FixedScheduleTrade = {
  pnl: number;
  volume: number;
};

export async function runPhase7CAutoLotBacktestComparison(input: Phase7CAutoLotBacktestRequest) {
  const fixedVolume = Number(input.fixedVolume ?? 0.03);
  const riskPercent = Number(input.riskPercent ?? 0.25);
  const maxAutoLot = Number(input.maxAutoLot ?? 0.03);

  if (!Number.isFinite(riskPercent) || riskPercent <= 0 || riskPercent > 5) {
    throw new Error("riskPercent must be > 0 and <= 5.");
  }
  if (!Number.isFinite(maxAutoLot) || maxAutoLot <= 0) {
    throw new Error("maxAutoLot must be positive.");
  }

  const [backtest, accountRisk] = await Promise.all([
    runPhase7CCanonicalBacktest({ from: input.from, to: input.to, fixedVolume }),
    getPhase7CAccountRisk(riskPercent, maxAutoLot),
  ]);

  const currentBalance = Number(accountRisk.account.accountBalance ?? 0);
  const requestedStartingBalance = Number(input.startingBalance ?? 0);
  const startingBalance = requestedStartingBalance > 0 ? requestedStartingBalance : currentBalance;
  if (!Number.isFinite(startingBalance) || startingBalance <= 0) {
    throw new Error("Auto Lot comparison requires a positive starting balance or a valid MT5 account balance.");
  }

  const step = Number(accountRisk.spec.volumeStep);
  const minVolume = Number(accountRisk.spec.minVolume);
  const brokerMaxVolume = Number(accountRisk.spec.maxVolume);
  const cashPerPriceUnitPerLot = Number(accountRisk.spec.cashPerPriceUnitPerLot);
  if (![step, minVolume, brokerMaxVolume, cashPerPriceUnitPerLot].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("Broker volume/risk specification is invalid for Auto Lot comparison.");
  }

  const fixedCompatible = canonicalCompatibleLot(fixedVolume, minVolume, step);
  if (Math.abs(fixedCompatible - fixedVolume) > step / 100) {
    throw new Error(
      `Fixed volume ${fixedVolume} does not preserve exact one-third partial management at broker volumeStep ${step}. Use a compatible volume such as 0.03, 0.06, 0.09...`,
    );
  }

  // Canonical backtest intentionally limits the returned journal to the latest
  // 500 selected trades. Both sizing lanes below use exactly that same schedule
  // so the comparison is apples-to-apples even when the full-period metrics
  // contain more historical trades.
  const chronological = [...backtest.trades].sort((left, right) => left.entryTime - right.entryTime);
  const shadowTrades: ShadowTrade[] = [];
  let balance = startingBalance;

  for (const trade of chronological) {
    const balanceBefore = balance;
    const targetRiskUsd = balanceBefore * riskPercent / 100;
    const oneLotRisk = trade.stopDistance * cashPerPriceUnitPerLot;
    const rawLot = oneLotRisk > 0 ? targetRiskUsd / oneLotRisk : 0;
    const cap = Math.min(rawLot, maxAutoLot, brokerMaxVolume);
    const autoLot = canonicalCompatibleLot(cap, minVolume, step);

    if (autoLot <= 0) {
      shadowTrades.push({
        entryTime: trade.entryTime,
        side: trade.side,
        pattern: trade.pattern,
        stopDistance: round(trade.stopDistance, 4),
        fixedLot: round(trade.volume, 4),
        fixedPnl: round(trade.pnl, 2),
        balanceBefore: round(balanceBefore, 2),
        targetRiskUsd: round(targetRiskUsd, 2),
        rawLot: round(rawLot, 4),
        autoLot: 0,
        autoRiskUsd: 0,
        autoRiskPercent: 0,
        autoPnl: 0,
        balanceAfter: round(balanceBefore, 2),
        status: "BLOCK",
        reason: "Risk/cap cannot support a broker-step lot that preserves exact +10 one-third partial management.",
      });
      continue;
    }

    const scale = trade.volume > 0 ? autoLot / trade.volume : 0;
    const autoRiskUsd = oneLotRisk * autoLot;
    const autoPnl = trade.pnl * scale;
    balance += autoPnl;

    shadowTrades.push({
      entryTime: trade.entryTime,
      side: trade.side,
      pattern: trade.pattern,
      stopDistance: round(trade.stopDistance, 4),
      fixedLot: round(trade.volume, 4),
      fixedPnl: round(trade.pnl, 2),
      balanceBefore: round(balanceBefore, 2),
      targetRiskUsd: round(targetRiskUsd, 2),
      rawLot: round(rawLot, 4),
      autoLot: round(autoLot, 4),
      autoRiskUsd: round(autoRiskUsd, 2),
      autoRiskPercent: round(balanceBefore > 0 ? autoRiskUsd / balanceBefore * 100 : 0, 4),
      autoPnl: round(autoPnl, 2),
      balanceAfter: round(balance, 2),
      status: "EXECUTE",
      reason: "Canonical-compatible sizing overlay; execution remains SHADOW only.",
    });
  }

  const executed = shadowTrades.filter((trade) => trade.status === "EXECUTE");
  const autoMetrics = summarizeShadow(executed, startingBalance);
  const fixedMetrics = summarizeFixedSchedule(chronological, startingBalance);

  return {
    source: "PHASE7C_AUTO_LOT_SHADOW_COMPARISON",
    generatedAt: Date.now(),
    safety: {
      mode: "AUTO_LOT_SHADOW_BACKTEST",
      executionMutation: false,
      phase7bFixedVolumeUnchanged: true,
      liveUnlockAvailable: false,
      strategyRuleMutation: false,
    },
    configuration: {
      riskPercent,
      maxAutoLot,
      fixedVolume,
      startingBalance: round(startingBalance, 2),
      startingBalanceSource: requestedStartingBalance > 0 ? "USER_RESEARCH_INPUT" : "CURRENT_MT5_BALANCE",
      volumeStep: step,
      minVolume,
      managementCompatibility: "EXACT_ONE_THIRD_PARTIAL_ONLY",
      comparedTradeSchedule: chronological.length,
      fullPeriodCanonicalTrades: backtest.metrics.trades,
      journalTradeLimitApplied: backtest.metrics.trades > chronological.length,
    },
    fixed: fixedMetrics,
    autoLot: {
      ...autoMetrics,
      attemptedTrades: shadowTrades.length,
      executedTrades: executed.length,
      blockedTrades: shadowTrades.length - executed.length,
      averageTargetRiskUsd: round(avg(shadowTrades.map((trade) => trade.targetRiskUsd)), 2),
      averageRiskUsd: round(avg(executed.map((trade) => trade.autoRiskUsd)), 2),
      averageRiskPercent: round(avg(executed.map((trade) => trade.autoRiskPercent)), 4),
      minLot: executed.length ? round(Math.min(...executed.map((trade) => trade.autoLot)), 4) : 0,
      maxLot: executed.length ? round(Math.max(...executed.map((trade) => trade.autoLot)), 4) : 0,
      averageLot: round(avg(executed.map((trade) => trade.autoLot)), 4),
    },
    deltaAutoMinusFixed: {
      trades: executed.length - fixedMetrics.trades,
      netPnl: round(autoMetrics.netPnl - fixedMetrics.netPnl, 2),
      winRatePercent: round(autoMetrics.winRatePercent - fixedMetrics.winRatePercent, 2),
      profitFactor: autoMetrics.profitFactor !== null && fixedMetrics.profitFactor !== null
        ? round(autoMetrics.profitFactor - fixedMetrics.profitFactor, 4)
        : null,
      expectancy: round(autoMetrics.expectancy - fixedMetrics.expectancy, 4),
      maxDrawdownUsd: round(autoMetrics.maxDrawdownUsd - fixedMetrics.maxDrawdownUsd, 2),
      endingBalance: round(autoMetrics.endingBalance - fixedMetrics.endingBalance, 2),
    },
    backtest,
    shadowTrades: shadowTrades.slice().reverse(),
    notes: [
      "Auto Lot is a SHADOW sizing overlay only. It never changes Phase 7B DEMO orders.",
      "Only lot sizes that preserve exact one-third partial management at broker volumeStep are allowed; otherwise the shadow trade is BLOCKED.",
      "Fixed and Auto metrics are computed on the same returned canonical trade schedule. If the full-period canonical run exceeds the journal limit, the comparison explicitly reports that limitation.",
      "BLOCKED trades do not re-open signal contention; this is a sizing study, not production-equivalent execution replay.",
      "Balance compounds only from shadow executed P/L. Commission, swap and tick-level slippage remain outside the Phase 7C replay.",
    ],
  };
}

function canonicalCompatibleLot(cap: number, minVolume: number, step: number): number {
  if (!(cap > 0) || !(minVolume > 0) || !(step > 0)) return 0;
  const minUnits = Math.max(1, Math.ceil((minVolume - 1e-12) / step));
  let units = Math.floor((cap + 1e-12) / step);
  while (units >= minUnits * 3) {
    if (units % 3 === 0 && units / 3 >= minUnits && (units * 2) / 3 >= minUnits) {
      return round(units * step, 8);
    }
    units -= 1;
  }
  return 0;
}

function summarizeFixedSchedule(trades: FixedScheduleTrade[], startingBalance: number) {
  const wins = trades.filter((trade) => trade.pnl > 0).length;
  const grossProfit = trades.reduce((sum, trade) => sum + Math.max(0, trade.pnl), 0);
  const grossLoss = Math.abs(trades.reduce((sum, trade) => sum + Math.min(0, trade.pnl), 0));
  const netPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  let equity = startingBalance;
  let peak = startingBalance;
  let maxDrawdownUsd = 0;
  for (const trade of trades) {
    equity += trade.pnl;
    peak = Math.max(peak, equity);
    maxDrawdownUsd = Math.max(maxDrawdownUsd, peak - equity);
  }
  return {
    trades: trades.length,
    winRatePercent: round(trades.length ? wins / trades.length * 100 : 0, 2),
    netPnl: round(netPnl, 2),
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 4) : grossProfit > 0 ? null : 0,
    expectancy: round(trades.length ? netPnl / trades.length : 0, 4),
    maxDrawdownUsd: round(maxDrawdownUsd, 2),
    endingBalance: round(startingBalance + netPnl, 2),
    averageLot: round(avg(trades.map((trade) => trade.volume)), 4),
  };
}

function summarizeShadow(trades: ShadowTrade[], startingBalance: number) {
  const wins = trades.filter((trade) => trade.autoPnl > 0).length;
  const grossProfit = trades.reduce((sum, trade) => sum + Math.max(0, trade.autoPnl), 0);
  const grossLoss = Math.abs(trades.reduce((sum, trade) => sum + Math.min(0, trade.autoPnl), 0));
  const netPnl = trades.reduce((sum, trade) => sum + trade.autoPnl, 0);
  let equity = startingBalance;
  let peak = startingBalance;
  let maxDrawdownUsd = 0;
  for (const trade of trades) {
    equity += trade.autoPnl;
    peak = Math.max(peak, equity);
    maxDrawdownUsd = Math.max(maxDrawdownUsd, peak - equity);
  }
  return {
    trades: trades.length,
    winRatePercent: round(trades.length ? wins / trades.length * 100 : 0, 2),
    netPnl: round(netPnl, 2),
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 4) : grossProfit > 0 ? null : 0,
    expectancy: round(trades.length ? netPnl / trades.length : 0, 4),
    maxDrawdownUsd: round(maxDrawdownUsd, 2),
    endingBalance: round(startingBalance + netPnl, 2),
  };
}

function avg(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
