import fs from "node:fs";
import path from "node:path";

const targetArg = process.argv[2] ?? "scripts/run-phase7b-demo-controller.ts";
const target = path.resolve(targetArg);
if (!fs.existsSync(target)) {
  console.error(`Phase 7B demo controller not found: ${target}`);
  process.exit(1);
}

let source = fs.readFileSync(target, "utf8");
if (
  source.includes("PHASE7B_DEMO_STRUCTURAL_SL_GT_10=WAIT_PULLBACK") &&
  source.includes("Phase7BPullbackEntryService") &&
  source.includes("pendingPullback")
) {
  console.log("Phase 7B WAIT_PULLBACK demo-controller hook already applied; no changes made.");
  process.exit(0);
}

const backup = `${target}.phase7b-wait-pullback.bak`;
if (!fs.existsSync(backup)) {
  fs.copyFileSync(target, backup);
  console.log(`Backup created: ${backup}`);
}

function replaceOnce(pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`Patch anchor not found: ${label}`);
  source = source.replace(pattern, replacement);
}

replaceOnce(
  /import \{ type Phase7Bar, type Phase7BSignal \} from "@xauusd\/risk-engine";/,
  `import {\n  Phase7BPullbackEntryService,\n  phase7BSupertrend,\n  type Phase7Bar,\n  type Phase7BPendingPullback,\n} from "@xauusd/risk-engine";`,
  "risk-engine import",
);

replaceOnce(
  /type BotState = \{[\s\S]*?\n\};\n\nconst symbol =/,
  `type EntryPattern =\n  | "ENGULFING"\n  | "TWO_CANDLE_BODY_DOMINANCE"\n  | "THREE_CANDLE_BODY_DOMINANCE";\n\ntype EntrySignal = {\n  id: string;\n  side: "BUY" | "SELL";\n  pattern: EntryPattern;\n  signalTimestamp: number;\n  signalEntry: number;\n  structuralStopPrice: number;\n};\n\ntype BotState = {\n  version: 2;\n  accountLogin: number | null;\n  lastEvaluatedM15Close: number;\n  lastEvaluatedM5Close: number;\n  pendingPullback: Phase7BPendingPullback | null;\n  managed: ManagedState | null;\n};\n\nconst symbol =`,
  "BotState",
);

replaceOnce(
  /const ENGULF_BODY_TOLERANCE_PRICE = 0\.1;/,
  `const ENGULF_BODY_TOLERANCE_PRICE = 0.1;\nconst MAX_STRUCTURAL_SL_PRICE = 10;\nconst pullbackWaitMinutes = Math.max(1, Number(process.env.ZIQ_PHASE7B_PULLBACK_WAIT_MINUTES ?? "15"));\nconst pullbackEntryService = new Phase7BPullbackEntryService();`,
  "entry constants",
);

replaceOnce(
  /if \(!\[fixedVolume, intervalSeconds, magicNumber, deviationPoints\]\.every\(\(value\) => Number\.isFinite\(value\) && value > 0\)\) \{/,
  `if (![fixedVolume, intervalSeconds, magicNumber, deviationPoints, pullbackWaitMinutes].every((value) => Number.isFinite(value) && value > 0)) {`,
  "numeric config validation",
);

replaceOnce(
  /console\.log\("PHASE7B_DEMO_STRATEGY=M15_DUAL_PATTERN_MA_STRUCTURE_RIDER_FVG_CONFIRMATION"\);/,
  `console.log("PHASE7B_DEMO_STRATEGY=M15_THREE_PATTERN_SUPERTREND_STRUCTURE_RIDER_FVG_CONFIRMATION");`,
  "strategy log",
);
replaceOnce(
  /console\.log\("PHASE7B_DEMO_ENTRY_GATE=PATTERN_PLUS_MA_ONLY"\);/,
  `console.log("PHASE7B_DEMO_ENTRY_GATE=3_PATTERNS_PLUS_SUPERTREND_M15_M5_10_3");\nconsole.log("PHASE7B_DEMO_SUPERTREND=M15_M5_10_3");`,
  "entry gate log",
);
replaceOnce(
  /console\.log\("PHASE7B_DEMO_INITIAL_SL=PRICE_DISTANCE_CLAMPED_6_TO_10"\);/,
  `console.log("PHASE7B_DEMO_INITIAL_SL=ORIGINAL_PATTERN_EXTREME_FIXED");\nconsole.log("PHASE7B_DEMO_STRUCTURAL_SL_LE_10=ENTRY_IMMEDIATE");\nconsole.log("PHASE7B_DEMO_STRUCTURAL_SL_GT_10=WAIT_PULLBACK");\nconsole.log(\`PHASE7B_DEMO_PULLBACK_WAIT_MINUTES=\${pullbackWaitMinutes}\`);\nconsole.log("PHASE7B_DEMO_PULLBACK_INVALIDATE=STRUCTURE_BREAK_OR_M15_ST_FLIP_OR_M5_ST_FLIP_OR_EXPIRY");`,
  "initial SL log",
);

const startAnchor = "async function previewLatestSignal(): Promise<void> {";
const endAnchor = "async function managePosition(";
const start = source.indexOf(startAnchor);
const end = source.indexOf(endAnchor);
if (start < 0 || end < 0 || end <= start) {
  throw new Error("Patch anchors not found for Phase 7B entry subsystem.");
}

const entrySubsystem = String.raw`async function previewLatestSignal(): Promise<void> {
  const [m15, m5, quote] = await Promise.all([
    get<Phase7Bar[]>(\`/v1/candles/\${encodeURIComponent(symbol)}?timeframe=M15&count=360\`),
    get<Phase7Bar[]>(\`/v1/candles/\${encodeURIComponent(symbol)}?timeframe=M5&count=720\`),
    get<Quote>(\`/v1/quotes/\${encodeURIComponent(symbol)}\`),
  ]);
  const now = Date.now();
  const m15Index = latestClosedIndex(m15, now);
  if (m15Index < 0) {
    console.log("PHASE7B_DEMO_LATEST_SIGNAL=NONE");
    return;
  }
  const latest = m15[m15Index]!;
  console.log(\`PHASE7B_DEMO_LATEST_M15_CLOSE=\${latest.closeTime}\`);
  const signal = entrySignalAt(m15, m5, m15Index);
  if (!signal) {
    console.log("PHASE7B_DEMO_LATEST_SIGNAL=NONE");
    return;
  }
  const marketEntry = signal.side === "BUY" ? quote.ask : quote.bid;
  const distance = structuralDistance(signal.side, marketEntry, signal.structuralStopPrice);
  if (!(distance > 0)) {
    console.log("PHASE7B_DEMO_LATEST_SIGNAL=INVALIDATED_BY_MARKET");
    return;
  }
  const decision = pullbackEntryService.decideInitial({
    signalId: signal.id,
    side: signal.side,
    pattern: signal.pattern,
    signalTimestamp: signal.signalTimestamp,
    referenceEntryPrice: marketEntry,
    structuralStopPrice: signal.structuralStopPrice,
    maxStopDistancePrice: MAX_STRUCTURAL_SL_PRICE,
    waitMinutes: pullbackWaitMinutes,
  });
  const fvgConfirmed = hasRelevantFvg(m15, m15Index, signal.side, 12);
  console.log(
    \`PHASE7B_DEMO_LATEST_SIGNAL=\${signal.side}|PATTERN=\${signal.pattern}|MARKET_ENTRY=\${marketEntry}|STRUCTURAL_STOP=\${signal.structuralStopPrice}|SL_DISTANCE=\${decision.structuralStopDistance}|ENTRY_STATE=\${decision.state}|FVG_CONFIRM=\${fvgConfirmed ? "YES" : "NO"}\`,
  );
}

async function cycle(): Promise<void> {
  const health = await get<Health>("/health");
  if (
    health.accountMode !== "demo" ||
    !health.connected ||
    !health.tradingEnabled ||
    !health.terminalTradeAllowed ||
    !health.expertTradeAllowed ||
    !allowedLogins.has(Number(health.accountLogin))
  ) {
    journal("DEMO_GUARD_BLOCK", {
      accountLogin: health.accountLogin,
      accountMode: health.accountMode,
      connected: health.connected,
      tradingEnabled: health.tradingEnabled,
      terminalTradeAllowed: health.terminalTradeAllowed,
      expertTradeAllowed: health.expertTradeAllowed,
    });
    return;
  }

  const [m15, m5, spec, positions, quote] = await Promise.all([
    get<Phase7Bar[]>(\`/v1/candles/\${encodeURIComponent(symbol)}?timeframe=M15&count=360\`),
    get<Phase7Bar[]>(\`/v1/candles/\${encodeURIComponent(symbol)}?timeframe=M5&count=720\`),
    get<SymbolSpec>(\`/v1/symbols/\${encodeURIComponent(symbol)}/spec\`),
    get<Position[]>(\`/v1/positions?symbol=\${encodeURIComponent(symbol)}\`),
    get<Quote>(\`/v1/quotes/\${encodeURIComponent(symbol)}\`),
  ]);

  validateVolume(spec);

  if (state.managed) {
    const managedPosition = positions.find((position) => position.ticket === state.managed!.ticket);
    if (!managedPosition) {
      journal("MANAGED_POSITION_CLOSED", { ticket: state.managed.ticket, lastKnownState: state.managed });
      state.managed = null;
      saveState();
      return;
    }
    if (positions.length !== 1) {
      journal("UNEXPECTED_ADDITIONAL_POSITION", { managedTicket: state.managed.ticket, positions: positions.map((p) => p.ticket) });
      return;
    }
    const expectedSide = state.managed.side === "BUY" ? "LONG" : "SHORT";
    if (managedPosition.side !== expectedSide) {
      journal("MANAGED_POSITION_SIDE_MISMATCH", { expectedSide, actualSide: managedPosition.side, ticket: managedPosition.ticket });
      return;
    }
    if (Math.abs(managedPosition.volume - state.managed.expectedRemainingVolume) > spec.volumeStep / 2 + 1e-9) {
      journal("MANAGED_POSITION_VOLUME_MISMATCH", {
        ticket: managedPosition.ticket,
        expected: state.managed.expectedRemainingVolume,
        actual: managedPosition.volume,
      });
      return;
    }
    await managePosition(managedPosition, quote, spec, m15);
    return;
  }

  if (positions.length > 0) {
    journal("UNMANAGED_POSITION_PRESENT", { positions: positions.map((p) => ({ ticket: p.ticket, side: p.side, volume: p.volume })) });
    return;
  }

  const now = Date.now();
  const m15Index = latestClosedIndex(m15, now);
  const m5Index = latestClosedIndex(m5, now);
  if (m15Index < 0 || m5Index < 0) return;

  if (state.pendingPullback) {
    const pending = state.pendingPullback;
    const latestM5 = m5[m5Index]!;
    if (latestM5.closeTime <= state.lastEvaluatedM5Close) return;
    state.lastEvaluatedM5Close = latestM5.closeTime;
    saveState();

    const st15 = phase7BSupertrend(m15, 10, 3);
    const st5 = phase7BSupertrend(m5, 10, 3);
    const alignedM15Index = latestClosedIndex(m15, latestM5.closeTime);
    const m15Aligned = alignedM15Index >= 0 && st15.direction[alignedM15Index] === pending.side;
    const m5Aligned = st5.direction[m5Index] === pending.side;
    const marketEntry = pending.side === "BUY" ? quote.ask : quote.bid;
    const evaluation = pullbackEntryService.evaluatePullback({
      pending,
      timestamp: latestM5.closeTime,
      candidateEntryPrice: marketEntry,
      barLow: latestM5.low,
      barHigh: latestM5.high,
      setupStillValid: true,
      m15SupertrendAligned: m15Aligned,
      m5SupertrendAligned: m5Aligned,
    });

    journal(evaluation.state, {
      signalId: pending.signalId,
      side: pending.side,
      pattern: pending.pattern,
      structuralStopPrice: pending.structuralStopPrice,
      structuralStopDistanceAtSignal: pending.structuralStopDistanceAtSignal,
      structuralStopDistanceNow: evaluation.structuralStopDistance,
      marketEntry,
      m15Aligned,
      m5Aligned,
      m5CloseTime: latestM5.closeTime,
      expiresAt: pending.expiresAt,
    });

    if (evaluation.state === "PULLBACK_STILL_TOO_WIDE") return;
    if (evaluation.state !== "PULLBACK_ENTRY") {
      state.pendingPullback = null;
      saveState();
      return;
    }

    const submit = await submitEntry({
      signalId: pending.signalId,
      side: pending.side,
      pattern: pending.pattern as EntryPattern,
      signalTimestamp: pending.signalTimestamp,
      signalEntry: pending.side === "BUY"
        ? pending.structuralStopPrice + pending.structuralStopDistanceAtSignal
        : pending.structuralStopPrice - pending.structuralStopDistanceAtSignal,
      structuralStopPrice: pending.structuralStopPrice,
    }, marketEntry, spec, m15, m15Index, "PULLBACK_ENTRY");

    if (submit !== "BROKER_GAP_WAIT") {
      state.pendingPullback = null;
      saveState();
    }
    return;
  }

  const latestM15 = m15[m15Index]!;
  if (latestM15.closeTime <= state.lastEvaluatedM15Close) return;
  state.lastEvaluatedM15Close = latestM15.closeTime;
  saveState();

  const signal = entrySignalAt(m15, m5, m15Index);
  if (!signal) {
    journal("M15_NO_ENTRY_SIGNAL", {
      closeTime: latestM15.closeTime,
      close: latestM15.close,
      entryRule: "3_PATTERNS_PLUS_SUPERTREND_M15_M5_10_3",
      engulfBodyTolerancePrice: ENGULF_BODY_TOLERANCE_PRICE,
    });
    return;
  }

  const marketEntry = signal.side === "BUY" ? quote.ask : quote.bid;
  const distance = structuralDistance(signal.side, marketEntry, signal.structuralStopPrice);
  if (!(distance > 0)) {
    journal("ENTRY_SETUP_INVALIDATED_BEFORE_DECISION", {
      signalId: signal.id,
      marketEntry,
      structuralStopPrice: signal.structuralStopPrice,
    });
    return;
  }

  const decision = pullbackEntryService.decideInitial({
    signalId: signal.id,
    side: signal.side,
    pattern: signal.pattern,
    signalTimestamp: signal.signalTimestamp,
    referenceEntryPrice: marketEntry,
    structuralStopPrice: signal.structuralStopPrice,
    maxStopDistancePrice: MAX_STRUCTURAL_SL_PRICE,
    waitMinutes: pullbackWaitMinutes,
  });

  if (decision.state === "WAIT_PULLBACK") {
    state.pendingPullback = decision.pending;
    state.lastEvaluatedM5Close = signal.signalTimestamp;
    saveState();
    journal("WAIT_PULLBACK", {
      signalId: signal.id,
      side: signal.side,
      pattern: signal.pattern,
      signalEntry: signal.signalEntry,
      marketEntry,
      structuralStopPrice: signal.structuralStopPrice,
      structuralStopDistance: decision.structuralStopDistance,
      expiresAt: decision.pending!.expiresAt,
    });
    return;
  }

  journal("ENTRY_IMMEDIATE", {
    signalId: signal.id,
    side: signal.side,
    pattern: signal.pattern,
    signalEntry: signal.signalEntry,
    marketEntry,
    structuralStopPrice: signal.structuralStopPrice,
    structuralStopDistance: decision.structuralStopDistance,
  });
  await submitEntry(signal, marketEntry, spec, m15, m15Index, "ENTRY_IMMEDIATE");
}

async function submitEntry(
  signal: EntrySignal,
  marketEntry: number,
  spec: SymbolSpec,
  m15: Phase7Bar[],
  m15Index: number,
  entryState: "ENTRY_IMMEDIATE" | "PULLBACK_ENTRY",
): Promise<"FILLED" | "BROKER_GAP_WAIT" | "REJECTED" | "UNRESOLVED"> {
  const stopLoss = roundPrice(signal.structuralStopPrice, spec.digits);
  const stopDistance = structuralDistance(signal.side, marketEntry, stopLoss);
  const minimumStopGap = Math.max(0, spec.stopsLevelTicks * spec.point);
  if (!(stopDistance > 0)) {
    journal("ENTRY_SETUP_INVALIDATED_BEFORE_SUBMIT", { signalId: signal.id, marketEntry, stopLoss });
    return "REJECTED";
  }
  if (stopDistance > MAX_STRUCTURAL_SL_PRICE + 1e-9) {
    journal("ENTRY_DISTANCE_REGRESSION_BLOCK", { signalId: signal.id, marketEntry, stopLoss, stopDistance });
    return "REJECTED";
  }
  if (stopDistance + 1e-9 < minimumStopGap) {
    journal("INITIAL_SL_BROKER_DISTANCE_BLOCK", { signalId: signal.id, stopDistance, minimumStopGap, entryState });
    return entryState === "PULLBACK_ENTRY" ? "BROKER_GAP_WAIT" : "REJECTED";
  }

  const fvgConfirmedAtEntry = hasRelevantFvg(m15, m15Index, signal.side, 12);
  const orderId = \`p7b-\${entryState === "PULLBACK_ENTRY" ? "pb" : "im"}-\${signal.signalTimestamp}-\${signal.side}\`;
  journal("ENTRY_SUBMIT", {
    signalId: signal.id,
    side: signal.side,
    pattern: signal.pattern,
    signalEntry: signal.signalEntry,
    marketEntry,
    stopDistance,
    stopLoss,
    volume: fixedVolume,
    entryState,
    entryRule: "3_PATTERNS_PLUS_SUPERTREND_M15_M5_10_3",
    fvgConfirmedAtEntry,
    fvgRequiredForEntry: false,
  });

  const order = await post<OrderResponse>("/v1/orders", {
    symbol,
    side: signal.side,
    orderType: "MARKET",
    timeInForce: "GTC",
    volume: fixedVolume,
    requestedPrice: marketEntry,
    stopLoss,
    takeProfit: 0,
    deviationPoints,
    magicNumber,
    comment: entryState === "PULLBACK_ENTRY" ? "phase7b-pullback" : "phase7b-immediate",
    clientOrderId: orderId,
    idempotencyKey: orderId,
  });

  if (!order.accepted) {
    journal("ENTRY_REJECTED", { signalId: signal.id, entryState, message: order.message, retcode: order.retcode });
    return "REJECTED";
  }

  let opened = order.position ?? null;
  if (!opened) {
    const after = await get<Position[]>(\`/v1/positions?symbol=\${encodeURIComponent(symbol)}\`);
    if (after.length === 1) opened = after[0]!;
  }
  if (!opened) {
    journal("ENTRY_ACCEPTED_POSITION_NOT_RESOLVED", { signalId: signal.id, entryState, ticket: order.ticket, fillPrice: order.fillPrice });
    return "UNRESOLVED";
  }

  state.managed = {
    ticket: opened.ticket,
    side: signal.side,
    pattern: signal.pattern,
    signalTimestamp: signal.signalTimestamp,
    signalEntry: signal.signalEntry,
    entry: opened.entry,
    initialVolume: opened.volume,
    expectedRemainingVolume: opened.volume,
    stopDistance: Math.abs(opened.entry - stopLoss),
    breakEvenApplied: false,
    partialApplied: false,
    partialActivatedAt: null,
    lastStructuralStop: opened.stopLoss || stopLoss,
    lastReversalM15CloseChecked: signal.signalTimestamp,
    lastTrendM15CloseChecked: signal.signalTimestamp,
    beAttempt: 0,
    partialAttempt: 0,
    exitAttempt: 0,
    structureAttempt: 0,
  };
  saveState();
  journal("ENTRY_FILLED", {
    signalId: signal.id,
    entryState,
    structuralStopPrice: stopLoss,
    position: opened,
    fillPrice: order.fillPrice,
    fvgConfirmedAtEntry,
  });
  return "FILLED";
}

function entrySignalAt(m15: Phase7Bar[], m5: Phase7Bar[], m15Index: number): EntrySignal | null {
  const current = m15[m15Index];
  if (!current) return null;
  const trigger = detectEntryPattern(m15, m15Index);
  if (!trigger) return null;

  const st15 = phase7BSupertrend(m15, 10, 3);
  if (st15.direction[m15Index] !== trigger.side) return null;

  const m5Index = latestClosedIndex(m5, current.closeTime);
  if (m5Index < 0) return null;
  const st5 = phase7BSupertrend(m5, 10, 3);
  if (st5.direction[m5Index] !== trigger.side) return null;

  return {
    id: \`phase7b-demo-\${current.closeTime}-\${trigger.side}-\${trigger.pattern}\`,
    side: trigger.side,
    pattern: trigger.pattern,
    signalTimestamp: current.closeTime,
    signalEntry: current.close,
    structuralStopPrice: trigger.patternExtreme,
  };
}

function detectEntryPattern(
  bars: Phase7Bar[],
  index: number,
): { side: "BUY" | "SELL"; pattern: EntryPattern; patternExtreme: number } | null {
  const current = bars[index];
  const previous = bars[index - 1];
  if (!current || !previous) return null;

  if (
    isBearish(previous) && isBullish(current) &&
    current.open <= previous.close + ENGULF_BODY_TOLERANCE_PRICE + 1e-9 &&
    current.close + ENGULF_BODY_TOLERANCE_PRICE + 1e-9 >= previous.open
  ) {
    return { side: "BUY", pattern: "ENGULFING", patternExtreme: current.low };
  }
  if (
    isBullish(previous) && isBearish(current) &&
    current.open + ENGULF_BODY_TOLERANCE_PRICE + 1e-9 >= previous.close &&
    current.close <= previous.open + ENGULF_BODY_TOLERANCE_PRICE + 1e-9
  ) {
    return { side: "SELL", pattern: "ENGULFING", patternExtreme: current.high };
  }

  if (index >= 2) {
    const a = bars[index - 2]!;
    const b = bars[index - 1]!;
    const bodyA = bodySize(a);
    const bodyB = bodySize(b);
    const bodyD = bodySize(current);
    if (isBearish(a) && isBullish(b) && isBullish(current) && bodyB < bodyA && bodyB + bodyD > bodyA) {
      return { side: "BUY", pattern: "TWO_CANDLE_BODY_DOMINANCE", patternExtreme: Math.min(a.low, b.low, current.low) };
    }
    if (isBullish(a) && isBearish(b) && isBearish(current) && bodyB < bodyA && bodyB + bodyD > bodyA) {
      return { side: "SELL", pattern: "TWO_CANDLE_BODY_DOMINANCE", patternExtreme: Math.max(a.high, b.high, current.high) };
    }
  }

  if (index >= 3) {
    const a = bars[index - 3]!;
    const b = bars[index - 2]!;
    const c = bars[index - 1]!;
    const bodyA = bodySize(a);
    const bodyB = bodySize(b);
    const bodyC = bodySize(c);
    const bodyD = bodySize(current);
    if (
      isBearish(a) && isBullish(b) && isBullish(c) && isBullish(current) &&
      bodyB < bodyA && bodyB + bodyC <= bodyA + 1e-9 && bodyB + bodyC + bodyD > bodyA
    ) {
      return { side: "BUY", pattern: "THREE_CANDLE_BODY_DOMINANCE", patternExtreme: Math.min(a.low, b.low, c.low, current.low) };
    }
    if (
      isBullish(a) && isBearish(b) && isBearish(c) && isBearish(current) &&
      bodyB < bodyA && bodyB + bodyC <= bodyA + 1e-9 && bodyB + bodyC + bodyD > bodyA
    ) {
      return { side: "SELL", pattern: "THREE_CANDLE_BODY_DOMINANCE", patternExtreme: Math.max(a.high, b.high, c.high, current.high) };
    }
  }
  return null;
}

function latestClosedIndex(bars: Phase7Bar[], timestamp: number): number {
  let result = -1;
  for (let i = 0; i < bars.length; i += 1) {
    if (bars[i]!.closeTime <= timestamp) result = i;
    else break;
  }
  return result;
}

function structuralDistance(side: "BUY" | "SELL", entry: number, stop: number): number {
  return side === "BUY" ? entry - stop : stop - entry;
}

`;

source = source.slice(0, start) + entrySubsystem + source.slice(end);

replaceOnce(
  /function loadState\(file: string\): BotState \{[\s\S]*?\n\}/,
  `function loadState(file: string): BotState {\n  if (!fs.existsSync(file)) {\n    return {\n      version: 2,\n      accountLogin: null,\n      lastEvaluatedM15Close: 0,\n      lastEvaluatedM5Close: 0,\n      pendingPullback: null,\n      managed: null,\n    };\n  }\n  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<BotState> & { version?: number };\n  if (parsed.version === 1) {\n    return {\n      version: 2,\n      accountLogin: parsed.accountLogin ?? null,\n      lastEvaluatedM15Close: parsed.lastEvaluatedM15Close ?? 0,\n      lastEvaluatedM5Close: 0,\n      pendingPullback: null,\n      managed: parsed.managed ?? null,\n    };\n  }\n  if (parsed.version !== 2) throw new Error("Unsupported Phase 7B demo state version.");\n  return {\n    version: 2,\n    accountLogin: parsed.accountLogin ?? null,\n    lastEvaluatedM15Close: parsed.lastEvaluatedM15Close ?? 0,\n    lastEvaluatedM5Close: parsed.lastEvaluatedM5Close ?? 0,\n    pendingPullback: parsed.pendingPullback ?? null,\n    managed: parsed.managed ?? null,\n  };\n}`,
  "state loader",
);

const requiredAssertions = [
  'PHASE7B_DEMO_STRUCTURAL_SL_GT_10=WAIT_PULLBACK',
  'Phase7BPullbackEntryService',
  'phase7BSupertrend',
  'THREE_CANDLE_BODY_DOMINANCE',
  'pendingPullback',
  'ORIGINAL_PATTERN_EXTREME_FIXED',
];
for (const marker of requiredAssertions) {
  if (!source.includes(marker)) throw new Error(`Post-patch assertion failed: ${marker}`);
}
if (source.includes("PRICE_DISTANCE_CLAMPED_6_TO_10")) {
  throw new Error("Post-patch assertion failed: legacy SL clamp remains.");
}
if (source.includes("PATTERN_PLUS_MA_ONLY")) {
  throw new Error("Post-patch assertion failed: legacy entry gate remains.");
}

fs.writeFileSync(target, source, "utf8");
console.log(`Phase 7B WAIT_PULLBACK demo-controller hook applied: ${target}`);
console.log(`Backup: ${backup}`);
console.log("ENTRY_GATE=3_PATTERNS_PLUS_SUPERTREND_M15_M5_10_3");
console.log("STRUCTURAL_SL_LE_10=ENTRY_IMMEDIATE");
console.log("STRUCTURAL_SL_GT_10=WAIT_PULLBACK");
console.log("STRUCTURAL_STOP=ORIGINAL_PATTERN_EXTREME_FIXED");
console.log("REAL_ACCOUNT_GUARD=PRESERVED");
