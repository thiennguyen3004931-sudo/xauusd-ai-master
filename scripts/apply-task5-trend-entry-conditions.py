from pathlib import Path

path = Path("scripts/run-phase7b-demo-controller.ts")
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    text = text.replace(old, new, 1)


replace_once(
'''import { createPhase7CDecisionAudit } from "./phase7c-decision-audit.mjs";
import { canonicalHoldReason } from "./phase7c-hold-observability.mjs";
''',
'''import { createPhase7CDecisionAudit } from "./phase7c-decision-audit.mjs";
import { canonicalHoldReason } from "./phase7c-hold-observability.mjs";
import {
  compareStrategyEntryConfigVersion,
  createVirtualStrategyEntryConditionState,
  evaluateStrategyEntryConditions,
  validateStrategyEntryConditionState,
} from "./phase7c-strategy-entry-conditions.mjs";
''',
"imports",
)

replace_once(
'''type RuntimeEntrySignal = Pick<
  Phase7BSignal,
  "id" | "side" | "pattern" | "signalTimestamp" | "entry" | "patternExtreme"
>;
''',
'''type StrategyEntryConfigSnapshot = {
  version: number;
  valid: boolean;
  state: ReturnType<typeof createVirtualStrategyEntryConditionState> | null;
  error: string | null;
};

type RuntimeEntrySignal = Pick<
  Phase7BSignal,
  "id" | "side" | "pattern" | "signalTimestamp" | "entry" | "patternExtreme"
> & {
  strategyConfigSnapshot: { version: number; valid: boolean };
  entryConditions: ReturnType<typeof evaluateStrategyEntryConditions>;
};
''',
"runtime signal type",
)

replace_once(
'''const workDir = requiredEnv("ZIQ_DEMO_WORK_DIR");
const bridgeEnvPath = process.env.ZIQ_BRIDGE_ENV ?? path.resolve("packages/mt5-broker/bridge/.env.phase7b-demo");
''',
'''const workDir = requiredEnv("ZIQ_DEMO_WORK_DIR");
const strategyEntryConditionsFile = process.env.PHASE7C_STRATEGY_ENTRY_CONDITIONS_FILE?.trim()
  ? path.resolve(process.env.PHASE7C_STRATEGY_ENTRY_CONDITIONS_FILE.trim())
  : path.resolve(process.cwd(), ".runtime", "phase7c-strategy-entry-conditions.json");
const bridgeEnvPath = process.env.ZIQ_BRIDGE_ENV ?? path.resolve("packages/mt5-broker/bridge/.env.phase7b-demo");
''',
"strategy config path",
)

replace_once(
'''  const signal = latestSignal(m15, m5, spec);
  const latest = m15.at(-1);
''',
'''  const strategyEntryConfig = readStrategyEntryConfigSnapshot();
  const signal = latestSignal(m15, m5, spec, strategyEntryConfig);
  const latest = m15.at(-1);
''',
"preview strategy snapshot",
)

old_pending = '''    const m5Direction = phase7BSupertrend(m5, 10, 3).direction[m5.length - 1] ?? null;
    const marketEntry = pending.side === "BUY" ? quote.ask : quote.bid;
    const evaluation = pullbackEntryService.evaluatePullback({
      pending,
      timestamp: latestM5.closeTime,
      candidateEntryPrice: marketEntry,
      barLow: latestM5.low,
      barHigh: latestM5.high,
      setupStillValid: true,
      m15SupertrendAligned: m15Direction === pending.side,
      m5SupertrendAligned: m5Direction === pending.side,
    });
'''
new_pending = '''    const m5Direction = phase7BSupertrend(m5, 10, 3).direction[m5.length - 1] ?? null;
    const marketEntry = pending.side === "BUY" ? quote.ask : quote.bid;
    const strategyEntryConfig = readStrategyEntryConfigSnapshot();
    const structuralStopDistance = structuralDistance(
      pending.side,
      marketEntry,
      pending.structuralStopPrice,
    );
    const closes = m15.slice(0, Math.max(0, m15Index) + 1).map((bar) => bar.close);
    const ma20 = smaPeriod(closes, 20);
    const ma50 = smaPeriod(closes, 50);
    const fvgConfirmed = m15Index >= 0
      ? hasRelevantFvg(m15, m15Index, pending.side, 12)
      : false;
    const entryConditions = strategyEntryConfig.valid && strategyEntryConfig.state
      ? evaluateStrategyEntryConditions({
          strategy: "TREND",
          config: strategyEntryConfig.state,
          side: pending.side,
          observations: {
            patternM15: { passed: true, observed: `${pending.side}:${pending.pattern}` },
            supertrendM15: { passed: m15Direction === pending.side, observed: m15Direction },
            supertrendM5: { passed: m5Direction === pending.side, observed: m5Direction },
            validTrendStructure: { passed: structuralStopDistance > 0, observed: structuralStopDistance },
            ma20Ma50: {
              passed: pending.side === "BUY" ? ma20 > ma50 : ma20 < ma50,
              observed: { ma20, ma50 },
            },
            fvg: { passed: fvgConfirmed, observed: fvgConfirmed ? "CONFIRMED" : "NONE" },
          },
        })
      : null;

    if (!entryConditions || !entryConditions.allEnabledPassed) {
      journal("ENTRY_STRATEGY_CONDITION_BLOCK", {
        signalId: pending.signalId,
        side: pending.side,
        pattern: pending.pattern,
        reason: entryConditions
          ? entryConditions.failedConditions.join(",")
          : "ENTRY_STRATEGY_CONFIG_INVALID",
        configError: strategyEntryConfig.error,
        entryConditions,
      });
      return;
    }

    journal("ENTRY_STRATEGY_CONDITIONS_PASS", {
      signalId: pending.signalId,
      side: pending.side,
      pattern: pending.pattern,
      entryConditions,
    });

    const conditionAllows = (id: string) =>
      entryConditions.conditions.find((row) => row.id === id)?.status !== "FAIL";
    const evaluation = pullbackEntryService.evaluatePullback({
      pending,
      timestamp: latestM5.closeTime,
      candidateEntryPrice: marketEntry,
      barLow: latestM5.low,
      barHigh: latestM5.high,
      setupStillValid: conditionAllows("validTrendStructure"),
      m15SupertrendAligned: conditionAllows("supertrendM15"),
      m5SupertrendAligned: conditionAllows("supertrendM5"),
    });
'''
replace_once(old_pending, new_pending, "pending pullback conditions")

replace_once(
'''    const signal: RuntimeEntrySignal = {
      id: pending.signalId,
      side: pending.side,
      pattern: pending.pattern as Phase7BSignal["pattern"],
      signalTimestamp: pending.signalTimestamp,
      entry: pending.side === "BUY"
        ? pending.structuralStopPrice + pending.structuralStopDistanceAtSignal
        : pending.structuralStopPrice - pending.structuralStopDistanceAtSignal,
      patternExtreme: pending.structuralStopPrice,
    };
''',
'''    const signal: RuntimeEntrySignal = {
      id: pending.signalId,
      side: pending.side,
      pattern: pending.pattern as Phase7BSignal["pattern"],
      signalTimestamp: pending.signalTimestamp,
      entry: pending.side === "BUY"
        ? pending.structuralStopPrice + pending.structuralStopDistanceAtSignal
        : pending.structuralStopPrice - pending.structuralStopDistanceAtSignal,
      patternExtreme: pending.structuralStopPrice,
      strategyConfigSnapshot: {
        version: entryConditions.configVersion,
        valid: true,
      },
      entryConditions,
    };
''',
"pending signal snapshot",
)

replace_once(
'''  const signal = latestSignal(m15, m5, spec);
  if (!signal || signal.signalTimestamp !== latestM15.closeTime) {
''',
'''  const strategyEntryConfig = readStrategyEntryConfigSnapshot();
  const signal = latestSignal(m15, m5, spec, strategyEntryConfig);
  if (!signal || signal.signalTimestamp !== latestM15.closeTime) {
''',
"fresh signal strategy snapshot",
)

replace_once(
'''  const pendingEntry: PendingTrendEntry = {
''',
'''  const currentStrategyConfig = readStrategyEntryConfigSnapshot();
  const versionGuard = compareStrategyEntryConfigVersion(
    signal.strategyConfigSnapshot,
    { version: currentStrategyConfig.version, valid: currentStrategyConfig.valid },
  );
  if (!versionGuard.ok) {
    const reasonCode = versionGuard.reasonCode === "ENTRY_CONFIG_VERSION_CHANGED"
      ? "ENTRY_CONFIG_VERSION_CHANGED"
      : "ENTRY_STRATEGY_CONFIG_INVALID";
    journal(reasonCode, {
      signalId: signal.id,
      entryState,
      reasonCode,
      cycleConfigVersion: signal.strategyConfigSnapshot.version,
      currentConfigVersion: currentStrategyConfig.version,
      configError: currentStrategyConfig.error,
      entryConditions: signal.entryConditions,
    });
    return "REJECTED";
  }

  const pendingEntry: PendingTrendEntry = {
''',
"final version guard",
)

old_latest = '''function latestSignal(m15: Phase7Bar[], m5: Phase7Bar[], spec: SymbolSpec): Phase7BSignal | null {
  const index = m15.length - 1;
  if (index < 200) return null;
  const current = m15[index]!;
  const trigger = detectEntryPattern(m15, index);
  if (!trigger) return null;

  const closes = m15.slice(0, index + 1).map((bar) => bar.close);
  const ma20 = smaPeriod(closes, 20);
  const ma50 = smaPeriod(closes, 50);
  const ma200 = smaPeriod(closes, 200);
  const m15Supertrend = phase7BSupertrend(m15.slice(0, index + 1), 10, 3);
  const m15Direction = m15Supertrend.direction[index] ?? null;
  let m5SignalIndex = m5.length - 1;
  while (m5SignalIndex >= 0 && m5[m5SignalIndex]!.closeTime > current.closeTime) m5SignalIndex -= 1;
  if (m5SignalIndex < 9) return null;
  const m5AtSignal = m5.slice(0, m5SignalIndex + 1);
  const m5Supertrend = phase7BSupertrend(m5AtSignal, 10, 3);
  const m5Direction = m5Supertrend.direction[m5SignalIndex] ?? null;
  if (m15Direction !== trigger.side || m5Direction !== trigger.side) return null;

  const entry = current.close;
  const structuralStopDistance = trigger.side === "BUY"
    ? entry - trigger.patternExtreme
    : trigger.patternExtreme - entry;
  if (!(structuralStopDistance > 0)) return null;

  const stopDistance = structuralStopDistance > MAX_INITIAL_SL_PRICE
    ? structuralStopDistance
    : Math.max(MIN_INITIAL_SL_PRICE, structuralStopDistance);
  const stopLoss = trigger.side === "BUY" ? entry - stopDistance : entry + stopDistance;
  const initialRiskUsd = spec.tickSize > 0
    ? Math.abs(entry - stopLoss) / spec.tickSize * spec.effectiveTickValuePerLot * fixedVolume
    : 0;

  return {
    id: `phase7b-demo-${current.closeTime}-${trigger.side}-${trigger.pattern}`,
    side: trigger.side,
    pattern: trigger.pattern,
    signalTimestamp: current.closeTime,
    entry: roundValue(entry, 5),
    patternExtreme: roundValue(trigger.patternExtreme, 5),
    structuralStopDistance: roundValue(structuralStopDistance, 5),
    stopDistance: roundValue(stopDistance, 5),
    stopLoss: roundValue(stopLoss, 5),
    volume: roundValue(fixedVolume, 4),
    initialRiskUsd: roundValue(initialRiskUsd, 4),
    ma20: roundValue(ma20, 5),
    ma50: roundValue(ma50, 5),
    ma200: roundValue(ma200, 5),
  };
}
'''
new_latest = '''function latestSignal(
  m15: Phase7Bar[],
  m5: Phase7Bar[],
  spec: SymbolSpec,
  strategy: StrategyEntryConfigSnapshot,
): RuntimeEntrySignal | null {
  const index = m15.length - 1;
  if (index < 200) return null;
  const current = m15[index]!;
  const trigger = detectEntryPattern(m15, index);
  if (!trigger) return null;

  const closes = m15.slice(0, index + 1).map((bar) => bar.close);
  const ma20 = smaPeriod(closes, 20);
  const ma50 = smaPeriod(closes, 50);
  const ma200 = smaPeriod(closes, 200);
  const m15Supertrend = phase7BSupertrend(m15.slice(0, index + 1), 10, 3);
  const m15Direction = m15Supertrend.direction[index] ?? null;
  let m5SignalIndex = m5.length - 1;
  while (m5SignalIndex >= 0 && m5[m5SignalIndex]!.closeTime > current.closeTime) m5SignalIndex -= 1;
  if (m5SignalIndex < 9) return null;
  const m5AtSignal = m5.slice(0, m5SignalIndex + 1);
  const m5Supertrend = phase7BSupertrend(m5AtSignal, 10, 3);
  const m5Direction = m5Supertrend.direction[m5SignalIndex] ?? null;

  const entry = current.close;
  const structuralStopDistance = trigger.side === "BUY"
    ? entry - trigger.patternExtreme
    : trigger.patternExtreme - entry;
  const fvgConfirmed = hasRelevantFvg(m15, index, trigger.side, 12);

  const entryConditions = strategy.valid && strategy.state
    ? evaluateStrategyEntryConditions({
        strategy: "TREND",
        config: strategy.state,
        side: trigger.side,
        observations: {
          patternM15: { passed: true, observed: `${trigger.side}:${trigger.pattern}` },
          supertrendM15: { passed: m15Direction === trigger.side, observed: m15Direction },
          supertrendM5: { passed: m5Direction === trigger.side, observed: m5Direction },
          validTrendStructure: { passed: structuralStopDistance > 0, observed: structuralStopDistance },
          ma20Ma50: {
            passed: trigger.side === "BUY" ? ma20 > ma50 : ma20 < ma50,
            observed: { ma20, ma50 },
          },
          fvg: { passed: fvgConfirmed, observed: fvgConfirmed ? "CONFIRMED" : "NONE" },
        },
      })
    : null;

  if (!entryConditions || !entryConditions.allEnabledPassed) {
    journal("ENTRY_STRATEGY_CONDITION_BLOCK", {
      signalId: `phase7b-demo-${current.closeTime}-${trigger.side}-${trigger.pattern}`,
      side: trigger.side,
      pattern: trigger.pattern,
      reason: entryConditions
        ? entryConditions.failedConditions.join(",")
        : "ENTRY_STRATEGY_CONFIG_INVALID",
      configError: strategy.error,
      entryConditions,
    });
    return null;
  }

  journal("ENTRY_STRATEGY_CONDITIONS_PASS", {
    signalId: `phase7b-demo-${current.closeTime}-${trigger.side}-${trigger.pattern}`,
    side: trigger.side,
    pattern: trigger.pattern,
    entryConditions,
  });

  if (!(structuralStopDistance > 0)) return null;

  const stopDistance = structuralStopDistance > MAX_INITIAL_SL_PRICE
    ? structuralStopDistance
    : Math.max(MIN_INITIAL_SL_PRICE, structuralStopDistance);
  const stopLoss = trigger.side === "BUY" ? entry - stopDistance : entry + stopDistance;
  const initialRiskUsd = spec.tickSize > 0
    ? Math.abs(entry - stopLoss) / spec.tickSize * spec.effectiveTickValuePerLot * fixedVolume
    : 0;

  return {
    id: `phase7b-demo-${current.closeTime}-${trigger.side}-${trigger.pattern}`,
    side: trigger.side,
    pattern: trigger.pattern,
    signalTimestamp: current.closeTime,
    entry: roundValue(entry, 5),
    patternExtreme: roundValue(trigger.patternExtreme, 5),
    strategyConfigSnapshot: {
      version: entryConditions.configVersion,
      valid: true,
    },
    entryConditions,
  };
}
'''
replace_once(old_latest, new_latest, "latestSignal configurable conditions")

marker = '''function detectEntryPattern(
'''
helper = '''function readStrategyEntryConfigSnapshot(): StrategyEntryConfigSnapshot {
  if (!fs.existsSync(strategyEntryConditionsFile)) {
    const state = createVirtualStrategyEntryConditionState();
    return { version: state.version, valid: true, state, error: null };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(strategyEntryConditionsFile, "utf8"));
    const validation = validateStrategyEntryConditionState(raw, {
      allowVirtualVersionZero: false,
    });
    if (!validation.valid) {
      return {
        version: Number.isInteger(raw?.version) ? Number(raw.version) : 0,
        valid: false,
        state: null,
        error: validation.error,
      };
    }
    return {
      version: validation.state.version,
      valid: true,
      state: validation.state,
      error: null,
    };
  } catch (error) {
    return {
      version: 0,
      valid: false,
      state: null,
      error: errorMessage(error),
    };
  }
}

function detectEntryPattern(
'''
replace_once(marker, helper, "strategy config reader")

path.write_text(text, encoding="utf-8")
print("TASK5_TREND_PATCH_APPLIED=PASS")
