import fs from "node:fs";
import path from "node:path";
import { Router, type Request, type Response } from "express";
import { getMt5Telemetry } from "../services/mt5.service";

type ManagedState = {
  ticket: string;
  side: "BUY" | "SELL";
  pattern: string;
  signalTimestamp: number;
  signalEntry: number;
  entry: number;
  initialVolume: number;
  expectedRemainingVolume: number;
  stopDistance: number;
  breakEvenApplied: boolean;
  partialApplied: boolean;
  partialActivatedAt: number | null;
  lastStructuralStop: number | null;
};

type BotState = {
  version: number;
  accountLogin: number | null;
  lastEvaluatedM15Close: number;
  managed: ManagedState | null;
};

type RuntimeState = {
  version: number;
  status: "STARTING" | "RUNNING" | "STOPPED" | string;
  armed: boolean;
  pid: number | null;
  heartbeatAt: number;
  startedAt: number | null;
  intervalSeconds: number;
};

type DemoEvent = Record<string, unknown> & {
  timestamp?: string;
  type?: string;
};

type Phase7BSide = "BUY" | "SELL";
type Phase7BPattern = "ENGULFING" | "TWO_CANDLE_BODY_DOMINANCE";

type M15Bar = {
  openTime?: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type EntryDiagnostics = {
  source: "READ_ONLY_BRIDGE_M15";
  closeTime: number;
  nextCloseTime: number;
  bar: {
    open: number;
    high: number;
    low: number;
    close: number;
  };
  pattern: {
    matched: boolean;
    name: Phase7BPattern | null;
    side: Phase7BSide | null;
    extreme: number | null;
  };
  trend: {
    ma20: number;
    ma50: number;
    ma200: number;
    buyAligned: boolean;
    sellAligned: boolean;
    matchedPatternSide: boolean;
  };
  fvg: {
    buyConfirmed: boolean;
    sellConfirmed: boolean;
    sameDirectionConfirmed: boolean;
    requiredForEntry: false;
  };
  entry: {
    eligible: boolean;
    side: Phase7BSide | null;
    rule: "PATTERN_PLUS_MA";
    referenceEntry: number;
    structuralStopDistance: number | null;
    stopDistance: number | null;
    reason: string;
  };
};

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const demoDir = findLatestDemoDir();
    const telemetry = await getMt5Telemetry("XAUUSD");
    const statePath = demoDir ? path.join(demoDir, "phase7b-demo-state.json") : null;
    const journalPath = demoDir ? path.join(demoDir, "phase7b-demo-events.jsonl") : null;
    const runtimePath = demoDir ? path.join(demoDir, "phase7b-demo-runtime.json") : null;
    const state = statePath && fs.existsSync(statePath) ? readJson<BotState>(statePath) : null;
    const runtime = runtimePath && fs.existsSync(runtimePath) ? readJson<RuntimeState>(runtimePath) : null;
    const events = journalPath && fs.existsSync(journalPath) ? readRecentEvents(journalPath, 80) : [];
    const latestEvent = events.at(-1) ?? null;
    const latestEventAt = latestEvent?.timestamp ? Date.parse(String(latestEvent.timestamp)) : null;
    const activityAgeMs = latestEventAt && Number.isFinite(latestEventAt) ? Math.max(0, Date.now() - latestEventAt) : null;
    const heartbeatAgeMs = runtime?.heartbeatAt && Number.isFinite(runtime.heartbeatAt)
      ? Math.max(0, Date.now() - runtime.heartbeatAt)
      : null;
    const heartbeatLimitMs = Math.max(15_000, Math.max(1, runtime?.intervalSeconds ?? 5) * 3_000);
    const heartbeatAlive = Boolean(
      runtime?.armed &&
      runtime.status === "RUNNING" &&
      heartbeatAgeMs !== null &&
      heartbeatAgeMs <= heartbeatLimitMs,
    );
    const processAlive = Boolean(runtime?.armed && isPidAlive(runtime.pid));
    // The PowerShell wrapper owns the heartbeat file, but the Node controller may
    // continue running if that wrapper exits unexpectedly. In that case, a live
    // controller PID is stronger evidence than a stale wrapper heartbeat.
    const runtimeAlive = heartbeatAlive || processAlive;
    const managedPosition = state?.managed
      ? telemetry.positions.find((position) => String(position.ticket) === String(state.managed?.ticket)) ?? null
      : null;

    let botStatus = "READY_NOT_ARMED";
    if (!demoDir) botStatus = "NOT_CONFIGURED";
    else if (!telemetry.reachable) botStatus = "MT5_OFFLINE";
    else if (state?.managed && !runtimeAlive) botStatus = "POSITION_NOT_MANAGED";
    else if (runtimeAlive && state?.managed) botStatus = "MANAGING";
    else if (runtimeAlive) botStatus = "WAITING_SIGNAL";
    else if (runtime?.armed) botStatus = "BOT_STALE";

    const recentEventCounts: Record<string, number> = {};
    for (const event of events) {
      const key = String(event.type ?? "UNKNOWN");
      recentEventCounts[key] = (recentEventCounts[key] ?? 0) + 1;
    }

    let entryDiagnostics: EntryDiagnostics | null = null;
    let entryDiagnosticsError: string | null = null;
    if (telemetry.reachable && telemetry.health?.accountMode === "demo") {
      try {
        entryDiagnostics = await getEntryDiagnostics();
      } catch (error) {
        entryDiagnosticsError = error instanceof Error ? error.message : "M15 entry diagnostics unavailable.";
      }
    }

    res.json({
      readOnly: true,
      botStatus,
      generatedAt: Date.now(),
      source: {
        demoDir,
        statePath,
        journalPath,
        runtimePath,
      },
      runtime: {
        ...runtime,
        alive: runtimeAlive,
        processAlive,
        heartbeatAlive,
        heartbeatAgeMs,
        heartbeatLimitMs,
      },
      strategy: {
        name: "M15_DUAL_PATTERN_MA_STRUCTURE_RIDER_FVG_CONFIRMATION",
        trigger: "ENGULFING_OR_TWO_SAME_COLOR_BODY_DOMINANCE",
        trend: "MA20_MA50_MA200_MANDATORY",
        fvg: "OPTIONAL_AT_ENTRY_HOLD_CONFIRMATION_ADDON_SHADOW",
        initialStop: "PRICE_DISTANCE_6_TO_10",
        plus6: "SL_TO_ENTRY",
        plus10: "PARTIAL_ONE_THIRD",
        runner: "M15_STRUCTURE_TRAIL",
        reversalExit: "OPPOSING_FVG_PLUS_REJECTION_AFTER_PLUS10",
      },
      entryDiagnostics,
      entryDiagnosticsError,
      state,
      latestEvent,
      latestEventAt,
      activityAgeMs,
      recentEventCounts,
      recentEvents: events.slice(-40).reverse(),
      mt5: {
        enabled: telemetry.enabled,
        configured: telemetry.configured,
        reachable: telemetry.reachable,
        status: telemetry.status,
        message: telemetry.message,
        checkedAt: telemetry.checkedAt,
        health: telemetry.health,
        quote: telemetry.quote,
        spec: telemetry.spec,
        positions: telemetry.positions,
        managedPosition,
      },
    });
  } catch (error) {
    res.status(503).json({
      error: error instanceof Error ? error.message : "Phase 7B DEMO status failed.",
    });
  }
});

async function getEntryDiagnostics(): Promise<EntryDiagnostics> {
  const baseUrl = process.env.MT5_BRIDGE_BASE_URL?.trim().replace(/\/$/, "") ?? "";
  const apiKey = process.env.MT5_BRIDGE_API_KEY?.trim() ?? "";
  if (!baseUrl || !apiKey) {
    throw new Error("Bridge read-only credentials are unavailable to the Phase 7B API.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(`${baseUrl}/v1/candles/XAUUSD?timeframe=M15&count=320`, {
      headers: { "x-mt5-api-key": apiKey },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Bridge M15 request failed ${response.status}: ${text}`);
    }
    const bars = JSON.parse(text) as M15Bar[];
    return buildEntryDiagnostics(bars);
  } finally {
    clearTimeout(timeout);
  }
}

function buildEntryDiagnostics(bars: M15Bar[]): EntryDiagnostics {
  const index = bars.length - 1;
  if (index < 200) throw new Error(`Need at least 201 closed M15 bars, received ${bars.length}.`);
  const current = bars[index]!;
  if (![current.closeTime, current.open, current.high, current.low, current.close].every(Number.isFinite)) {
    throw new Error("Latest M15 candle is invalid.");
  }

  const closes = bars.slice(0, index + 1).map((bar) => bar.close);
  const ma20 = smaPeriod(closes, 20);
  const ma50 = smaPeriod(closes, 50);
  const ma200 = smaPeriod(closes, 200);
  const buyAligned = ma20 > ma50 && ma50 > ma200 && current.close > ma20;
  const sellAligned = ma20 < ma50 && ma50 < ma200 && current.close < ma20;
  const pattern = detectEntryPattern(bars, index);
  const matchedPatternSide = pattern?.side === "BUY"
    ? buyAligned
    : pattern?.side === "SELL"
      ? sellAligned
      : false;
  const buyFvg = hasRelevantFvg(bars, index, "BUY", 12);
  const sellFvg = hasRelevantFvg(bars, index, "SELL", 12);
  const sameDirectionConfirmed = pattern?.side === "BUY"
    ? buyFvg
    : pattern?.side === "SELL"
      ? sellFvg
      : false;

  const structuralStopDistance = pattern
    ? pattern.side === "BUY"
      ? current.close - pattern.extreme
      : pattern.extreme - current.close
    : null;
  const validStructure = structuralStopDistance !== null && structuralStopDistance > 0;
  const eligible = Boolean(pattern && matchedPatternSide && validStructure);
  const stopDistance = validStructure && structuralStopDistance !== null
    ? clamp(structuralStopDistance, 6, 10)
    : null;

  let reason = "Chưa có Engulfing hoặc Two-candle body dominance trên cây M15 vừa đóng.";
  if (pattern && !matchedPatternSide) {
    reason = `${pattern.side} pattern đã xuất hiện nhưng MA20/50/200 chưa đồng thuận cùng hướng.`;
  } else if (pattern && matchedPatternSide && !validStructure) {
    reason = "Pattern + MA đạt nhưng cấu trúc không tạo được khoảng SL hợp lệ.";
  } else if (eligible) {
    reason = sameDirectionConfirmed
      ? `${pattern!.side} đủ Pattern + MA; FVG cùng hướng cũng xác nhận.`
      : `${pattern!.side} đủ Pattern + MA; FVG chưa xác nhận nhưng không chặn entry.`;
  }

  return {
    source: "READ_ONLY_BRIDGE_M15",
    closeTime: current.closeTime,
    nextCloseTime: current.closeTime + 15 * 60_000,
    bar: {
      open: round(current.open, 5),
      high: round(current.high, 5),
      low: round(current.low, 5),
      close: round(current.close, 5),
    },
    pattern: {
      matched: Boolean(pattern),
      name: pattern?.name ?? null,
      side: pattern?.side ?? null,
      extreme: pattern ? round(pattern.extreme, 5) : null,
    },
    trend: {
      ma20: round(ma20, 5),
      ma50: round(ma50, 5),
      ma200: round(ma200, 5),
      buyAligned,
      sellAligned,
      matchedPatternSide,
    },
    fvg: {
      buyConfirmed: buyFvg,
      sellConfirmed: sellFvg,
      sameDirectionConfirmed,
      requiredForEntry: false,
    },
    entry: {
      eligible,
      side: eligible ? pattern!.side : null,
      rule: "PATTERN_PLUS_MA",
      referenceEntry: round(current.close, 5),
      structuralStopDistance: structuralStopDistance === null ? null : round(structuralStopDistance, 5),
      stopDistance: stopDistance === null ? null : round(stopDistance, 5),
      reason,
    },
  };
}

function detectEntryPattern(
  bars: M15Bar[],
  index: number,
): { side: Phase7BSide; name: Phase7BPattern; extreme: number } | null {
  const current = bars[index]!;
  const previous = bars[index - 1]!;

  if (
    isBearish(previous) &&
    isBullish(current) &&
    current.open <= previous.close &&
    current.close >= previous.open
  ) {
    return { side: "BUY", name: "ENGULFING", extreme: current.low };
  }
  if (
    isBullish(previous) &&
    isBearish(current) &&
    current.open >= previous.close &&
    current.close <= previous.open
  ) {
    return { side: "SELL", name: "ENGULFING", extreme: current.high };
  }

  if (index < 2) return null;
  const priorOpposite = bars[index - 2]!;
  const first = bars[index - 1]!;
  const combinedBody = bodySize(first) + bodySize(current);

  if (isBearish(priorOpposite) && isBullish(first) && isBullish(current) && combinedBody > bodySize(priorOpposite)) {
    return {
      side: "BUY",
      name: "TWO_CANDLE_BODY_DOMINANCE",
      extreme: Math.min(priorOpposite.low, first.low, current.low),
    };
  }
  if (isBullish(priorOpposite) && isBearish(first) && isBearish(current) && combinedBody > bodySize(priorOpposite)) {
    return {
      side: "SELL",
      name: "TWO_CANDLE_BODY_DOMINANCE",
      extreme: Math.max(priorOpposite.high, first.high, current.high),
    };
  }
  return null;
}

function hasRelevantFvg(bars: M15Bar[], index: number, side: Phase7BSide, lookback: number): boolean {
  if (index < 2) return false;
  const start = Math.max(2, index - lookback);
  const current = bars[index]!;
  for (let i = index - 1; i >= start; i -= 1) {
    const first = bars[i - 2]!;
    const third = bars[i]!;
    if (side === "BUY" && third.low > first.high && current.low <= third.low && current.high >= first.high) return true;
    if (side === "SELL" && third.high < first.low && current.high >= third.high && current.low <= first.low) return true;
  }
  return false;
}

function isBullish(bar: M15Bar): boolean {
  return bar.close > bar.open;
}

function isBearish(bar: M15Bar): boolean {
  return bar.close < bar.open;
}

function bodySize(bar: M15Bar): number {
  return Math.abs(bar.close - bar.open);
}

function smaPeriod(values: number[], period: number): number {
  if (values.length < period) throw new Error(`Not enough M15 bars for MA${period}.`);
  return values.slice(-period).reduce((sum, value) => sum + value, 0) / period;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function findLatestDemoDir(): string | null {
  const configured = process.env.PHASE7B_DEMO_WORK_DIR?.trim();
  if (configured) {
    const resolved = path.resolve(configured);
    const candidate = path.basename(resolved).toLowerCase() === "phase7b-demo-forward"
      ? resolved
      : path.join(resolved, "phase7b-demo-forward");
    if (fs.existsSync(candidate)) return candidate;
  }

  const bases = [
    path.resolve(process.cwd(), "data", "historical-replay"),
    path.resolve(process.cwd(), "apps", "api", "data", "historical-replay"),
    path.resolve(process.cwd(), "..", "..", "apps", "api", "data", "historical-replay"),
  ];

  const found: Array<{ dir: string; mtimeMs: number }> = [];
  for (const base of [...new Set(bases)]) {
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const demo = path.join(base, entry.name, "phase7b-demo-forward");
      if (!fs.existsSync(demo)) continue;
      const runtime = path.join(demo, "phase7b-demo-runtime.json");
      const state = path.join(demo, "phase7b-demo-state.json");
      const journal = path.join(demo, "phase7b-demo-events.jsonl");
      const probe = fs.existsSync(runtime) ? runtime : fs.existsSync(journal) ? journal : fs.existsSync(state) ? state : demo;
      found.push({ dir: demo, mtimeMs: fs.statSync(probe).mtimeMs });
    }
  }

  found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return found[0]?.dir ?? null;
}

function isPidAlive(pid: number | null | undefined): boolean {
  if (!Number.isInteger(pid) || (pid ?? 0) <= 0) return false;
  try {
    process.kill(pid as number, 0);
    return true;
  } catch {
    return false;
  }
}

function readJson<T>(file: string): T {
  // Windows PowerShell 5.1 writes `-Encoding utf8` with a UTF-8 BOM.
  // Strip the BOM defensively so runtime/state files remain valid JSON to Node.
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text) as T;
}

function readRecentEvents(file: string, limit: number): DemoEvent[] {
  const buffer = fs.readFileSync(file);
  const maxBytes = 512 * 1024;
  const start = Math.max(0, buffer.length - maxBytes);
  const text = buffer.subarray(start).toString("utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const events: DemoEvent[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as DemoEvent;
      events.push(parsed);
    } catch {
      // The first line may be partial when reading only the tail of a large journal.
    }
  }
  return events.slice(-limit);
}

export default router;
