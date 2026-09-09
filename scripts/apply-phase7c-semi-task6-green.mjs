import fs from "node:fs";

function replaceOnce(file, from, to, label) {
  const source = fs.readFileSync(file, "utf8");
  const first = source.indexOf(from);
  const last = source.lastIndexOf(from);
  if (first < 0 || first !== last) {
    throw new Error(`${label}: expected exactly one source match`);
  }
  fs.writeFileSync(file, source.slice(0, first) + to + source.slice(first + from.length), "utf8");
  console.log(`PATCH_OK=${label}`);
}

const decision = "apps/api/src/services/phase7c-decision-monitor.service.ts";
const ui = "apps/api/src/services/phase7c-ui-contract.service.ts";
const trend = "scripts/run-phase7c-trend-controller.mjs";
const sideway = "scripts/run-phase7c-sideway-controller.mjs";

replaceOnce(
  decision,
  `import {
  accountModeAllowsBroker,
  getPhase7CAccountModeState,
  type Phase7CAccountModeState,
} from "./phase7c-account-mode.service";

type Strategy = "TREND" | "SIDEWAY" | "PAUSE";`,
  `import {
  accountModeAllowsBroker,
  getPhase7CAccountModeState,
  type Phase7CAccountModeState,
} from "./phase7c-account-mode.service";
import type { DurableSemiAdoptionState } from "./phase7c-semi-adoption-state.service";
import { getPhase7CSemiAdoptionStateRepository } from "./phase7c-semi-adoption-runtime.service";

type Strategy = "TREND" | "SIDEWAY" | "PAUSE";`,
  "DECISION_IMPORT_SEMI_ADOPTION",
);

replaceOnce(
  decision,
  `export interface Phase7CPreTradeDecision {
  strategy: Strategy;`,
  `export interface Phase7CPreTradeDecision {
  strategy: Strategy | null;`,
  "DECISION_PRETRADE_NULL_STRATEGY",
);

replaceOnce(
  decision,
  `function localApiBase(): string {`,
  `async function loadSemiAdoptions(): Promise<DurableSemiAdoptionState[]> {
  try {
    return await getPhase7CSemiAdoptionStateRepository().listActive();
  } catch {
    // Decision observability must never invent SEMI ownership. An unreadable
    // durable ledger therefore degrades to no adopted owner and stays fail-closed.
    return [];
  }
}

function localApiBase(): string {`,
  "DECISION_LOAD_SEMI_ADOPTIONS",
);

replaceOnce(
  decision,
  `function cleanReason(value: string | null | undefined, fallback: string): string {`,
  `function semiManualOnlyDecision(
  regime: Awaited<ReturnType<typeof getPhase7CLiveRegime>>,
  now: number,
): Phase7CPreTradeDecision {
  return {
    strategy: null,
    stage: "BLOCKED",
    approved: false,
    side: null,
    setup: null,
    confidenceScore: finite(regime.confidence),
    confidenceLabel: null,
    entry: null,
    stopLoss: null,
    stopDistance: null,
    breakEvenPrice: null,
    breakEvenTriggerDistance: 6,
    tp1: null,
    tp2: null,
    partialTriggerDistance: 10,
    partialFraction: "1/3",
    rawLot: null,
    finalLot: null,
    lotCap: null,
    riskTargetPercent: null,
    estimatedRiskUsd: null,
    estimatedRiskPercent: null,
    limitReason: "SEMI chỉ cho phép vào lệnh thủ công; hệ thống chặn mọi system-generated new entry.",
    decisionReason: "SEMI manual-entry-only: sau khi vị thế thủ công được xác minh và PROTECTED/MANAGED, Trend management mới được phép quản lý SL/BE/TP/FastMove.",
    source: "PHASE7C_SEMI_MANUAL_ENTRY_ONLY",
    updatedAt: now,
  };
}

function cleanReason(value: string | null | undefined, fallback: string): string {`,
  "DECISION_SEMI_MANUAL_ONLY",
);

replaceOnce(
  decision,
  `function positionMonitor(input: {
  telemetry: Mt5TelemetrySnapshot;
  audit: DecisionAuditRecord[];
  managedStates?: ManagedRuntimeStates;
}) {`,
  `function positionMonitor(input: {
  telemetry: Mt5TelemetrySnapshot;
  audit: DecisionAuditRecord[];
  managedStates?: ManagedRuntimeStates;
  semiAdoptions?: DurableSemiAdoptionState[];
  activeMode?: string;
}) {`,
  "DECISION_POSITION_INPUT_SEMI",
);

replaceOnce(
  decision,
  `  const trendManaged = hasExactlyOnePosition && String(states.TREND?.ticket ?? "") === ticket ? states.TREND : null;
  const sidewayManaged = hasExactlyOnePosition && String(states.SIDEWAY?.ticket ?? "") === ticket ? states.SIDEWAY : null;
  const strategy: Strategy | null = trendManaged ? "TREND" : sidewayManaged ? "SIDEWAY" : null;
  const managed = trendManaged ?? sidewayManaged;`,
  `  const trendManaged = hasExactlyOnePosition && String(states.TREND?.ticket ?? "") === ticket ? states.TREND : null;
  const sidewayManaged = hasExactlyOnePosition && String(states.SIDEWAY?.ticket ?? "") === ticket ? states.SIDEWAY : null;
  const semiManaged = hasExactlyOnePosition && input.activeMode === "SEMI"
    ? input.semiAdoptions?.find((owner) =>
      String(owner.ticket) === ticket &&
      owner.entrySource === "MANUAL" &&
      owner.managementStrategy === "TREND" &&
      (owner.protectionStatus === "PROTECTED" || owner.protectionStatus === "MANAGED")) ?? null
    : null;
  const strategy: Strategy | null = trendManaged
    ? "TREND"
    : sidewayManaged
      ? "SIDEWAY"
      : semiManaged
        ? "TREND"
        : null;
  const managed = trendManaged ?? sidewayManaged;`,
  "DECISION_POSITION_SEMI_OWNER",
);

replaceOnce(
  decision,
  `    entryReason: entryReason(strategy, managed, entryAudit),`,
  `    entryReason: semiManaged
      ? "SEMI manual entry đã được xác minh ownership; bot chỉ tiếp quản Trend management và không tạo entry mới."
      : entryReason(strategy, managed, entryAudit),`,
  "DECISION_POSITION_SEMI_ENTRY_REASON",
);

replaceOnce(
  decision,
  `  audit: DecisionAuditRecord[];
  managedStates?: ManagedRuntimeStates;
  accountModeState?: Phase7CAccountModeState;`,
  `  audit: DecisionAuditRecord[];
  managedStates?: ManagedRuntimeStates;
  semiAdoptions?: DurableSemiAdoptionState[];
  accountModeState?: Phase7CAccountModeState;`,
  "DECISION_BUILDER_SEMI_INPUT",
);

replaceOnce(
  decision,
  `  const requestedStrategy = input.regime.activeMode === "AUTO"
    ? autoReversalCanonicalTrendEntry
      ? "TREND"
      : input.regime.recommendedMode
    : input.regime.activeMode;
  const effectiveStrategy: Strategy = requestedStrategy === "TREND" || requestedStrategy === "SIDEWAY"
    ? requestedStrategy
    : "PAUSE";
  const preTrade = effectiveStrategy === "TREND"
    ? trendDecision({ ...input, accountModeState, now })
    : effectiveStrategy === "SIDEWAY"
      ? sidewayDecision({ ...input, accountModeState, now })
      : pauseDecision(input.regime, now);`,
  `  const position = positionMonitor({
    ...input,
    activeMode: input.regime.activeMode,
  });
  const requestedStrategy = input.regime.activeMode === "AUTO"
    ? autoReversalCanonicalTrendEntry
      ? "TREND"
      : input.regime.recommendedMode
    : input.regime.activeMode;
  const effectiveStrategy: Strategy | null = input.regime.activeMode === "SEMI"
    ? position.state === "MANAGING" && position.strategy === "TREND"
      ? "TREND"
      : null
    : requestedStrategy === "TREND" || requestedStrategy === "SIDEWAY"
      ? requestedStrategy
      : "PAUSE";
  const preTrade = input.regime.activeMode === "SEMI"
    ? semiManualOnlyDecision(input.regime, now)
    : effectiveStrategy === "TREND"
      ? trendDecision({ ...input, accountModeState, now })
      : effectiveStrategy === "SIDEWAY"
        ? sidewayDecision({ ...input, accountModeState, now })
        : pauseDecision(input.regime, now);`,
  "DECISION_EFFECTIVE_SEMI_STRATEGY",
);

replaceOnce(
  decision,
  `    position: positionMonitor(input),`,
  `    position,`,
  "DECISION_RETURN_POSITION",
);

replaceOnce(
  decision,
  `    const [regime, demo, telemetry] = await Promise.all([
      getPhase7CLiveRegime(symbol),
      getPhase7BDemoStatus(),
      getMt5Telemetry(symbol),
    ]);`,
  `    const [regime, demo, telemetry, semiAdoptions] = await Promise.all([
      getPhase7CLiveRegime(symbol),
      getPhase7BDemoStatus(),
      getMt5Telemetry(symbol),
      currentBotMode === "SEMI" ? loadSemiAdoptions() : Promise.resolve([]),
    ]);`,
  "DECISION_LOAD_SEMI_RUNTIME",
);

replaceOnce(
  decision,
  `      managedStates: loadManagedStates(accountModeState),
      accountModeState,`,
  `      managedStates: loadManagedStates(accountModeState),
      semiAdoptions,
      accountModeState,`,
  "DECISION_PASS_SEMI_RUNTIME",
);

replaceOnce(
  decision,
  `  if (snapshot.mode.active === "PAUSE") {
    return "Bot đang PAUSE; không mở lệnh mới. Mở Control Center và nhấn BẬT BOT sau khi hoàn tất kiểm tra an toàn.";
  }`,
  `  if (snapshot.mode.active === "SEMI") {
    return "SEMI chỉ cho phép vào lệnh thủ công; bot không tạo lệnh mới. Vị thế MANUAL_SEMI chỉ được Trend management tiếp quản sau khi đã xác minh và PROTECTED/MANAGED.";
  }
  if (snapshot.mode.active === "PAUSE") {
    return "Bot đang PAUSE; không mở lệnh mới. Mở Control Center và nhấn BẬT BOT sau khi hoàn tất kiểm tra an toàn.";
  }`,
  "DECISION_MT5_SEMI_REASON",
);

replaceOnce(
  ui,
  `  effectiveStrategy: string;`,
  `  effectiveStrategy: string | null;`,
  "UI_NULL_EFFECTIVE_STRATEGY",
);

replaceOnce(
  ui,
  `  } else {
    pushUnique(reasons, \`Bot đang ở chế độ \${snapshot.mode.active}; AUTO không quyết định strategy lúc này.\`);
  }
  return reasons.slice(0, 4);`,
  `  } else if (snapshot.mode.active === "SEMI") {
    pushUnique(reasons, "SEMI: chỉ vào lệnh thủ công; Trend/Sideway không được tạo entry mới. MANUAL_SEMI đã PROTECTED/MANAGED được quản lý theo Trend.");
  } else {
    pushUnique(reasons, \`Bot đang ở chế độ \${snapshot.mode.active}; AUTO không quyết định strategy lúc này.\`);
  }
  return reasons.slice(0, 4);`,
  "UI_SEMI_MANUAL_REASON",
);

replaceOnce(
  trend,
  `    const decision = await evaluateTrendEntryPermission();
    if (!decision.allowed) {`,
  `    const decision = await evaluateTrendEntryPermission();
    if (decision.activeMode === "SEMI") {
      const semiDecision = {
        ...decision,
        allowed: false,
        recommendedMode: null,
        reason: "SEMI_MANUAL_ENTRY_ONLY",
      };
      console.warn("PHASE7C_TREND_ENTRY_BLOCKED=SEMI_MANUAL_ENTRY_ONLY|ACTIVE_SEMI");
      return blockedResponse(semiDecision);
    }
    if (!decision.allowed) {`,
  "TREND_SUBMIT_BOUNDARY_SEMI",
);

replaceOnce(
  trend,
  `  if (activeMode === "SIDEWAY") {
    return {
      allowed: false,
      activeMode,
      recommendedMode: "SIDEWAY",
      reason: "SIDEWAY_MODE_BLOCKS_TREND_ENTRY",
    };
  }

  if (activeMode === "PAUSE") {`,
  `  if (activeMode === "SIDEWAY") {
    return {
      allowed: false,
      activeMode,
      recommendedMode: "SIDEWAY",
      reason: "SIDEWAY_MODE_BLOCKS_TREND_ENTRY",
    };
  }

  if (activeMode === "SEMI") {
    return {
      allowed: false,
      activeMode,
      recommendedMode: null,
      reason: "SEMI_MANUAL_ENTRY_ONLY",
    };
  }

  if (activeMode === "PAUSE") {`,
  "TREND_PERMISSION_SEMI",
);

replaceOnce(
  sideway,
  `  journal("ENTRY_PENDING_DURABLE", {
    orderId,
    side,
    volume,
    stopLoss: executionPlan.stopLoss,
    tp2: executionPlan.takeProfit,
    dailyMode: dailyRecovery.mode,
    dailyNetPnl: dailyRecovery.dailyNetPnl,
    recoveryTpDistance: dailyRecovery.tpDistance,
  });

  const order = await bridgeRequest("POST", "/v1/orders", {`,
  `  journal("ENTRY_PENDING_DURABLE", {
    orderId,
    side,
    volume,
    stopLoss: executionPlan.stopLoss,
    tp2: executionPlan.takeProfit,
    dailyMode: dailyRecovery.mode,
    dailyNetPnl: dailyRecovery.dailyNetPnl,
    recoveryTpDistance: dailyRecovery.tpDistance,
  });

  // Re-read canonical mode at the actual submit boundary. SEMI is manual-entry-only;
  // clearing our own durable pending marker here does not touch any broker position.
  const submitMode = await controlGet("/api/v1/phase7c/bot-mode");
  const submitActiveMode = String(submitMode?.state?.mode ?? "PAUSE").toUpperCase();
  if (submitActiveMode === "SEMI") {
    journal("ENTRY_SEMI_MODE_BLOCK", {
      orderId,
      side,
      cycleMode: freshMode?.state?.mode ?? null,
      submitMode: submitActiveMode,
      reason: "SEMI_MANUAL_ENTRY_ONLY",
    });
    state.pendingEntry = null;
    saveState();
    return;
  }

  const order = await bridgeRequest("POST", "/v1/orders", {`,
  "SIDEWAY_SUBMIT_BOUNDARY_SEMI",
);

console.log("PHASE7C_SEMI_TASK6_GREEN_PATCH=COMPLETE");
