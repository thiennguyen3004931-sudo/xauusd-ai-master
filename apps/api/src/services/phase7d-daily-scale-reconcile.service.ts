import {
  runPhase7DDailyPnlResearch,
  type Phase7DDailyPnlRequest,
} from "./phase7d-daily-pnl.service";
import {
  runPhase7DManagementResearch,
  type Phase7DManagementRequest,
} from "./phase7d-management.service";
import {
  runPhase7DDailyScaleResearch,
  type Phase7DDailyScaleRequest,
} from "./phase7d-daily-scale.service";

type Check = {
  key: string;
  pass: boolean;
  expected: number | string | null;
  actual: number | string | null;
  delta: number | null;
  tolerance: number | null;
};

function numericCheck(key: string, expected: number, actual: number, tolerance: number): Check {
  const delta = actual - expected;
  return {
    key,
    pass: Math.abs(delta) <= tolerance + 1e-9,
    expected,
    actual,
    delta: Math.round(delta * 10_000) / 10_000,
    tolerance,
  };
}

function exactCheck(key: string, expected: number | string, actual: number | string): Check {
  return { key, pass: expected === actual, expected, actual, delta: null, tolerance: null };
}

function nullableNumberCheck(
  key: string,
  expected: number | null,
  actual: number | null,
  tolerance: number,
): Check {
  if (expected === null || actual === null) {
    return { key, pass: expected === actual, expected, actual, delta: null, tolerance };
  }
  return numericCheck(key, expected, actual, tolerance);
}

export async function runPhase7DReconciledDailyScaleResearch(input: Phase7DDailyScaleRequest) {
  const managementInput: Phase7DManagementRequest = {
    from: input.from,
    to: input.to,
    fixedVolume: input.fixedVolume,
  };
  const dailyInput: Phase7DDailyPnlRequest = { ...input };

  const [management, daily, scale] = await Promise.all([
    runPhase7DManagementResearch(managementInput),
    runPhase7DDailyPnlResearch(dailyInput),
    runPhase7DDailyScaleResearch(input),
  ]);

  const managementCurrent = management.variants.find((item) => item.name === "CURRENT_BE6_PARTIAL_THIRD");
  if (!managementCurrent) throw new Error("Canonical management CURRENT lane is missing.");

  const checks: Check[] = [
    exactCheck("SIGNALS_MANAGEMENT_VS_DAILY", management.signals, daily.configuration.signals),
    exactCheck("SIGNALS_MANAGEMENT_VS_SCALE", management.signals, scale.configuration.signals),

    exactCheck("CURRENT_TRADES_MANAGEMENT_VS_DAILY", managementCurrent.metrics.trades, daily.baseline.metrics.trades),
    exactCheck("CURRENT_TRADES_MANAGEMENT_VS_SCALE", managementCurrent.metrics.trades, scale.current.metrics.trades),
    numericCheck("CURRENT_NET_MANAGEMENT_VS_DAILY", managementCurrent.metrics.netPnl, daily.baseline.metrics.netPnl, 0.05),
    numericCheck("CURRENT_NET_MANAGEMENT_VS_SCALE", managementCurrent.metrics.netPnl, scale.current.metrics.netPnl, 0.05),
    nullableNumberCheck("CURRENT_PF_MANAGEMENT_VS_DAILY", managementCurrent.metrics.profitFactor, daily.baseline.metrics.profitFactor, 0.0005),
    nullableNumberCheck("CURRENT_PF_MANAGEMENT_VS_SCALE", managementCurrent.metrics.profitFactor, scale.current.metrics.profitFactor, 0.0005),
    numericCheck("CURRENT_DD_MANAGEMENT_VS_DAILY", managementCurrent.metrics.maxDrawdownUsd, daily.baseline.metrics.maxDrawdownUsd, 0.05),
    numericCheck("CURRENT_DD_MANAGEMENT_VS_SCALE", managementCurrent.metrics.maxDrawdownUsd, scale.current.metrics.maxDrawdownUsd, 0.05),

    exactCheck("RECOVERY_LOCK_TRADES_DAILY_VS_SCALE", daily.recoveryPlusLock.metrics.trades, scale.recoveryLockCurrent.metrics.trades),
    exactCheck("RECOVERY_LOCK_BLOCKS_DAILY_VS_SCALE", daily.recoveryPlusLock.metrics.blockedTrades, scale.recoveryLockCurrent.metrics.blockedTrades),
    numericCheck("RECOVERY_LOCK_NET_DAILY_VS_SCALE", daily.recoveryPlusLock.metrics.netPnl, scale.recoveryLockCurrent.metrics.netPnl, 0.05),
    nullableNumberCheck("RECOVERY_LOCK_PF_DAILY_VS_SCALE", daily.recoveryPlusLock.metrics.profitFactor, scale.recoveryLockCurrent.metrics.profitFactor, 0.0005),
    numericCheck("RECOVERY_LOCK_DD_DAILY_VS_SCALE", daily.recoveryPlusLock.metrics.maxDrawdownUsd, scale.recoveryLockCurrent.metrics.maxDrawdownUsd, 0.05),
    numericCheck("RECOVERY_LOCK_POSITIVE_DAY_RATE_DAILY_VS_SCALE", daily.recoveryPlusLock.metrics.positiveDayRatePercent, scale.recoveryLockCurrent.metrics.positiveDayRatePercent, 0.01),
  ];

  const passed = checks.every((check) => check.pass);
  const failedKeys = checks.filter((check) => !check.pass).map((check) => check.key);

  const reconciliation = {
    status: passed ? "PASS" as const : "FAIL" as const,
    passed,
    decisionAllowed: passed,
    canonicalReference: "PHASE7D_MANAGEMENT_CURRENT_PLUS_PHASE7D_DAILY_PNL_RECOVERY_LOCK",
    checks,
    failedKeys,
    references: {
      managementCurrent: managementCurrent.metrics,
      dailyBaseline: daily.baseline.metrics,
      dailyRecoveryPlusLock: daily.recoveryPlusLock.metrics,
      scaleCurrent: scale.current.metrics,
      scaleRecoveryLockCurrent: scale.recoveryLockCurrent.metrics,
    },
    note: passed
      ? "Canonical CURRENT and Recovery+Lock baselines reconcile across research engines for this exact range. Scale-lane comparison may be evaluated."
      : "Research engines do not reconcile on the same range. BE6/BE10 scale verdict is locked until every baseline check passes.",
  };

  return {
    ...scale,
    reconciliation,
    decision: passed
      ? scale.decision
      : {
          ...scale.decision,
          verdict: "RECONCILIATION_FAILED" as const,
          preferredResearchLane: "NONE",
          executionEligible: false as const,
          reason: `Reconciliation failed: ${failedKeys.join(", ")}. Do not compare or promote BE6/BE10 scale lanes yet.`,
        },
  };
}
