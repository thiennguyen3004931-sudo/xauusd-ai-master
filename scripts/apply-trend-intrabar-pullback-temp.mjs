import fs from "node:fs";

function replaceOnce(text, oldText, newText, label) {
  const count = text.split(oldText).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one target, found ${count}`);
  }
  return text.replace(oldText, newText);
}

const controllerPath = "scripts/run-phase7b-demo-controller.ts";
let controller = fs.readFileSync(controllerPath, "utf8");

controller = replaceOnce(
  controller,
  'const pullbackWaitMinutes = Math.max(1, Number(process.env.ZIQ_PHASE7B_PULLBACK_WAIT_MINUTES ?? "15"));',
  "const pullbackWaitMinutes = 15;",
  "canonical one-M15 pullback window",
);

controller = replaceOnce(
  controller,
  `  if (state.pendingPullback) {
    const pending = state.pendingPullback;
    if (latestM5.closeTime <= state.lastEvaluatedM5Close) return;
    state.lastEvaluatedM5Close = latestM5.closeTime;
    saveState();

`,
  `  if (state.pendingPullback) {
    const pending = state.pendingPullback;
    const pullbackCycleTimestamp = Number(quote.timestamp);
    if (!Number.isFinite(pullbackCycleTimestamp)) {
      journal("QUOTE_TIMESTAMP_INVALID", {
        signalId: pending.signalId,
        quoteTimestamp: quote.timestamp,
      });
      return;
    }

`,
  "intrabar pending-cycle gate",
);

controller = replaceOnce(
  controller,
  `    if (!entryConditions || !entryConditions.allEnabledPassed) {
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
`,
  `    const evaluation = pullbackEntryService.evaluatePullback({
      pending,
      timestamp: pullbackCycleTimestamp,
      candidateEntryPrice: marketEntry,
      barLow: latestM5.low,
      barHigh: latestM5.high,
      setupStillValid: structuralStopDistance > 0,
      m15SupertrendAligned: m15Direction === pending.side,
      m5SupertrendAligned: m5Direction === pending.side,
    });
`,
  "pullback lifecycle before optional strategy gate",
);

controller = replaceOnce(
  controller,
  `      m5CloseTime: latestM5.closeTime,
      expiresAt: pending.expiresAt,
`,
  `      m5CloseTime: latestM5.closeTime,
      pullbackCycleTimestamp,
      expiresAt: pending.expiresAt,
`,
  "pullback cycle observability",
);

controller = replaceOnce(
  controller,
  `    if (evaluation.state === "PULLBACK_STILL_TOO_WIDE") return;
    if (evaluation.state !== "PULLBACK_ENTRY") {
      state.pendingPullback = null;
      saveState();
      return;
    }

    const signal: RuntimeEntrySignal = {
`,
  `    if (evaluation.state === "PULLBACK_STILL_TOO_WIDE") return;
    if (evaluation.state !== "PULLBACK_ENTRY") {
      state.pendingPullback = null;
      saveState();
      return;
    }

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

    const signal: RuntimeEntrySignal = {
`,
  "optional strategy gate after terminal lifecycle",
);

if (controller.includes("ZIQ_PHASE7B_PULLBACK_WAIT_MINUTES")) {
  throw new Error("legacy configurable pullback window still present");
}
if (controller.includes("timestamp: latestM5.closeTime")) {
  throw new Error("pending pullback still uses M5 close timestamp");
}
fs.writeFileSync(controllerPath, controller, "utf8");

const servicePath = "packages/risk-engine/src/services/Phase7BPullbackEntryService.ts";
let service = fs.readFileSync(servicePath, "utf8");
service = replaceOnce(
  service,
  "    if (input.timestamp > pending.expiresAt) {",
  "    if (input.timestamp >= pending.expiresAt) {",
  "inclusive pullback expiry boundary",
);
fs.writeFileSync(servicePath, service, "utf8");

console.log("TREND_INTRABAR_PULLBACK_PATCH=APPLIED");
