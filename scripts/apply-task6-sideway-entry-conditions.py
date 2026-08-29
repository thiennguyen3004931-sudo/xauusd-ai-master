from pathlib import Path

path = Path("scripts/run-phase7c-sideway-controller.mjs")
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
"canonical imports",
)

replace_once(
'''const workDir = process.env.ZIQ_PHASE7C_SIDEWAY_WORK_DIR?.trim() || path.resolve(".runtime", "phase7c-sideway");
''',
'''const workDir = process.env.ZIQ_PHASE7C_SIDEWAY_WORK_DIR?.trim() || path.resolve(".runtime", "phase7c-sideway");
const strategyEntryConditionsFile = process.env.PHASE7C_STRATEGY_ENTRY_CONDITIONS_FILE?.trim()
  ? path.resolve(process.env.PHASE7C_STRATEGY_ENTRY_CONDITIONS_FILE.trim())
  : path.resolve(process.cwd(), ".runtime", "phase7c-strategy-entry-conditions.json");
''',
"strategy config path",
)

old_initial = '''  const activeMode = String(modePayload?.state?.mode ?? "PAUSE").toUpperCase();
  const permission = resolveSidewayPermission(activeMode, regime?.recommendedMode);
  if (!permission.allowed) {
    journal("ENTRY_MODE_BLOCK", permission);
    return;
  }

  if (
    regime?.regime !== "RANGING" ||
    regime?.recommendedMode !== "SIDEWAY" ||
    !regime?.supplyDemandRange ||
    Number(regime?.confidence ?? 0) < minRegimeConfidence
  ) {
    journal("ENTRY_REGIME_BLOCK", {
      activeMode,
      regime: regime?.regime ?? null,
      confidence: regime?.confidence ?? null,
      minRegimeConfidence,
      recommendedMode: regime?.recommendedMode ?? null,
      hasRange: Boolean(regime?.supplyDemandRange),
    });
    return;
  }

  const side = chooseRangeSide(regime.supplyDemandRange, Number(quote.bid), Number(quote.ask));
  if (!side) {
    journal("ENTRY_LOCATION_BLOCK", {
      closeTime,
      bid: quote.bid,
      ask: quote.ask,
      range: regime.supplyDemandRange,
      note: "Middle-range and live breakouts outside the outer zones are blocked.",
    });
    return;
  }

  const confirmation = detectM5Confirmation(m5, side);
  if (!confirmation || Number(confirmation.closeTime) !== closeTime) {
    journal("ENTRY_M5_CONFIRMATION_BLOCK", { closeTime, side });
    return;
  }
'''
new_initial = '''  const activeMode = String(modePayload?.state?.mode ?? "PAUSE").toUpperCase();
  // Active-mode permission remains a hard control gate. AUTO is allowed to reach
  // canonical condition evaluation; recommendedModeSideway itself is configurable.
  const permission = resolveSidewayPermission(activeMode, "SIDEWAY");
  if (!permission.allowed) {
    journal("ENTRY_MODE_BLOCK", permission);
    return;
  }

  const side = regime?.supplyDemandRange
    ? chooseRangeSide(regime.supplyDemandRange, Number(quote.bid), Number(quote.ask))
    : null;
  const confirmation = side ? detectM5Confirmation(m5, side) : null;
  const strategyEntryConfig = readStrategyEntryConfigSnapshot();
  const entryConditions = strategyEntryConfig.valid && strategyEntryConfig.state
    ? evaluateStrategyEntryConditions({
        strategy: "SIDEWAY",
        config: strategyEntryConfig.state,
        side: side ?? "BUY",
        observations: {
          rangingRegime: { passed: regime?.regime === "RANGING", observed: regime?.regime ?? null },
          recommendedModeSideway: { passed: regime?.recommendedMode === "SIDEWAY", observed: regime?.recommendedMode ?? null },
          minimumRegimeConfidence: {
            passed: Number(regime?.confidence ?? 0) >= minRegimeConfidence,
            observed: { confidence: regime?.confidence ?? null, minimum: minRegimeConfidence },
          },
          supplyDemandRange: { passed: Boolean(regime?.supplyDemandRange), observed: regime?.supplyDemandRange ?? null },
          rangeEdge: { passed: side !== null, observed: side },
          m5Confirmation: {
            passed: Boolean(confirmation && Number(confirmation.closeTime) === closeTime),
            observed: confirmation?.pattern ?? null,
          },
        },
      })
    : null;

  if (!entryConditions || !entryConditions.allEnabledPassed) {
    journal("ENTRY_STRATEGY_CONDITION_BLOCK", {
      closeTime,
      side,
      reason: entryConditions
        ? entryConditions.failedConditions.join(",")
        : "ENTRY_STRATEGY_CONFIG_INVALID",
      configError: strategyEntryConfig.error,
      entryConditions,
    });
    return;
  }

  journal("ENTRY_STRATEGY_CONDITIONS_PASS", {
    closeTime,
    side,
    entryConditions,
  });

  if (!side || !regime?.supplyDemandRange) {
    journal("ENTRY_PLAN_BLOCK", { closeTime, side, reason: "RANGE_DATA_REQUIRED_FOR_SIDEWAY_PLAN" });
    return;
  }
'''
replace_once(old_initial, new_initial, "initial canonical conditions")

old_final = '''  const finalPermission = resolveSidewayPermission(freshMode?.state?.mode, freshRegime?.recommendedMode);
  const finalQuoteFreshness = evaluateTimestampFreshness(freshQuote?.timestamp, { maxAgeMs: maxQuoteAgeMs, clockOffsetMs: brokerClockOffsetMs });
  const finalRegimeFreshness = evaluateTimestampFreshness(freshRegime?.lastCandleCloseTime, { maxAgeMs: maxM15AgeMs, clockOffsetMs: brokerClockOffsetMs });
  const finalSide = freshRegime?.supplyDemandRange
    ? chooseRangeSide(freshRegime.supplyDemandRange, Number(freshQuote?.bid), Number(freshQuote?.ask))
    : null;
  const finalSpreadBlocked = Number.isFinite(maxSpread) && maxSpread > 0 && Number(freshQuote?.spread) > maxSpread;

  if (
    !finalPermission.allowed ||
    freshRegime?.regime !== "RANGING" ||
    freshRegime?.recommendedMode !== "SIDEWAY" ||
    !freshRegime?.supplyDemandRange ||
    Number(freshRegime?.confidence ?? 0) < minRegimeConfidence ||
    !finalQuoteFreshness.fresh ||
    !finalRegimeFreshness.fresh ||
    finalSpreadBlocked ||
    finalSide !== side
  ) {
    journal("ENTRY_FINAL_GATE_BLOCK", {
      finalPermission,
      regime: freshRegime?.regime ?? null,
      confidence: freshRegime?.confidence ?? null,
      minRegimeConfidence,
      hasRange: Boolean(freshRegime?.supplyDemandRange),
      finalSide,
      expectedSide: side,
      quoteFreshness: finalQuoteFreshness,
      regimeFreshness: finalRegimeFreshness,
      spread: freshQuote?.spread ?? null,
      maxSpread,
    });
    return;
  }
'''
new_final = '''  const finalPermission = resolveSidewayPermission(freshMode?.state?.mode, "SIDEWAY");
  const finalQuoteFreshness = evaluateTimestampFreshness(freshQuote?.timestamp, { maxAgeMs: maxQuoteAgeMs, clockOffsetMs: brokerClockOffsetMs });
  const finalRegimeFreshness = evaluateTimestampFreshness(freshRegime?.lastCandleCloseTime, { maxAgeMs: maxM15AgeMs, clockOffsetMs: brokerClockOffsetMs });
  const finalSide = freshRegime?.supplyDemandRange
    ? chooseRangeSide(freshRegime.supplyDemandRange, Number(freshQuote?.bid), Number(freshQuote?.ask))
    : null;
  const finalSpreadBlocked = Number.isFinite(maxSpread) && maxSpread > 0 && Number(freshQuote?.spread) > maxSpread;
  const finalEntryConditions = strategyEntryConfig.valid && strategyEntryConfig.state
    ? evaluateStrategyEntryConditions({
        strategy: "SIDEWAY",
        config: strategyEntryConfig.state,
        side: finalSide ?? side,
        observations: {
          rangingRegime: { passed: freshRegime?.regime === "RANGING", observed: freshRegime?.regime ?? null },
          recommendedModeSideway: { passed: freshRegime?.recommendedMode === "SIDEWAY", observed: freshRegime?.recommendedMode ?? null },
          minimumRegimeConfidence: {
            passed: Number(freshRegime?.confidence ?? 0) >= minRegimeConfidence,
            observed: { confidence: freshRegime?.confidence ?? null, minimum: minRegimeConfidence },
          },
          supplyDemandRange: { passed: Boolean(freshRegime?.supplyDemandRange), observed: freshRegime?.supplyDemandRange ?? null },
          rangeEdge: { passed: finalSide !== null, observed: finalSide },
          m5Confirmation: {
            passed: Boolean(confirmation && Number(confirmation.closeTime) === closeTime),
            observed: confirmation?.pattern ?? null,
          },
        },
      })
    : null;

  if (!finalEntryConditions || !finalEntryConditions.allEnabledPassed) {
    journal("ENTRY_STRATEGY_CONDITION_BLOCK", {
      closeTime,
      side: finalSide,
      phase: "FINAL_GATE",
      reason: finalEntryConditions
        ? finalEntryConditions.failedConditions.join(",")
        : "ENTRY_STRATEGY_CONFIG_INVALID",
      configError: strategyEntryConfig.error,
      entryConditions: finalEntryConditions,
    });
    return;
  }

  if (
    !finalPermission.allowed ||
    !finalQuoteFreshness.fresh ||
    !finalRegimeFreshness.fresh ||
    finalSpreadBlocked ||
    finalSide !== side
  ) {
    journal("ENTRY_FINAL_GATE_BLOCK", {
      finalPermission,
      regime: freshRegime?.regime ?? null,
      confidence: freshRegime?.confidence ?? null,
      minRegimeConfidence,
      hasRange: Boolean(freshRegime?.supplyDemandRange),
      finalSide,
      expectedSide: side,
      quoteFreshness: finalQuoteFreshness,
      regimeFreshness: finalRegimeFreshness,
      spread: freshQuote?.spread ?? null,
      maxSpread,
      entryConditions: finalEntryConditions,
    });
    return;
  }
'''
replace_once(old_final, new_final, "final configurable conditions")

replace_once(
'''    recoveryCanRecoverInOneTrade: dailyRecovery.canRecoverInOneTrade,
  });

  if (!armed) {
''',
'''    recoveryCanRecoverInOneTrade: dailyRecovery.canRecoverInOneTrade,
    entryConditions: finalEntryConditions,
  });

  if (!armed) {
''',
"entry submit observability",
)

replace_once(
'''  state.pendingEntry = {
''',
'''  const currentStrategyConfig = readStrategyEntryConfigSnapshot();
  const versionGuard = compareStrategyEntryConfigVersion(
    { version: strategyEntryConfig.version, valid: strategyEntryConfig.valid },
    { version: currentStrategyConfig.version, valid: currentStrategyConfig.valid },
  );
  if (!versionGuard.ok) {
    const reasonCode = versionGuard.reasonCode === "ENTRY_CONFIG_VERSION_CHANGED"
      ? "ENTRY_CONFIG_VERSION_CHANGED"
      : "ENTRY_STRATEGY_CONFIG_INVALID";
    journal(reasonCode, {
      closeTime,
      side,
      reasonCode,
      cycleConfigVersion: strategyEntryConfig.version,
      currentConfigVersion: currentStrategyConfig.version,
      configError: currentStrategyConfig.error,
      entryConditions: finalEntryConditions,
    });
    return;
  }

  state.pendingEntry = {
''',
"final config version guard",
)

marker = '''async function resolveDailyRecoveryPlan(
'''
helper = '''function readStrategyEntryConfigSnapshot() {
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

async function resolveDailyRecoveryPlan(
'''
replace_once(marker, helper, "config snapshot helper")

path.write_text(text, encoding="utf-8")
print("TASK6_SIDEWAY_PATCH_APPLIED=PASS")
