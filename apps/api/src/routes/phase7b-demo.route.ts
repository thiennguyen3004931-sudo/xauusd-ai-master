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

type DemoEvent = Record<string, unknown> & {
  timestamp?: string;
  type?: string;
};

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const demoDir = findLatestDemoDir();
    const telemetry = await getMt5Telemetry("XAUUSD");
    const statePath = demoDir ? path.join(demoDir, "phase7b-demo-state.json") : null;
    const journalPath = demoDir ? path.join(demoDir, "phase7b-demo-events.jsonl") : null;
    const state = statePath && fs.existsSync(statePath) ? readJson<BotState>(statePath) : null;
    const events = journalPath && fs.existsSync(journalPath) ? readRecentEvents(journalPath, 80) : [];
    const latestEvent = events.at(-1) ?? null;
    const latestEventAt = latestEvent?.timestamp ? Date.parse(String(latestEvent.timestamp)) : null;
    const activityAgeMs = latestEventAt && Number.isFinite(latestEventAt) ? Math.max(0, Date.now() - latestEventAt) : null;
    const managedPosition = state?.managed
      ? telemetry.positions.find((position) => String(position.ticket) === String(state.managed?.ticket)) ?? null
      : null;

    let botStatus = "IDLE";
    if (!demoDir) botStatus = "NOT_CONFIGURED";
    else if (!telemetry.reachable) botStatus = "MT5_OFFLINE";
    else if (state?.managed) botStatus = "MANAGING";
    else if (activityAgeMs !== null && activityAgeMs <= 20 * 60_000) botStatus = "ACTIVE";
    else botStatus = "READY";

    const recentEventCounts: Record<string, number> = {};
    for (const event of events) {
      const key = String(event.type ?? "UNKNOWN");
      recentEventCounts[key] = (recentEventCounts[key] ?? 0) + 1;
    }

    res.json({
      readOnly: true,
      botStatus,
      generatedAt: Date.now(),
      source: {
        demoDir,
        statePath,
        journalPath,
      },
      strategy: {
        name: "M15_DUAL_PATTERN_MA_FVG_STRUCTURE_RIDER",
        trigger: "ENGULFING_OR_TWO_SAME_COLOR_BODY_DOMINANCE",
        trend: "MA20_MA50_MA200_MANDATORY",
        fvg: "MANDATORY_SAME_DIRECTION",
        initialStop: "PRICE_DISTANCE_6_TO_10",
        plus6: "SL_TO_ENTRY",
        plus10: "PARTIAL_ONE_THIRD",
        runner: "M15_STRUCTURE_TRAIL",
        reversalExit: "OPPOSING_FVG_PLUS_REJECTION",
      },
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
      const state = path.join(demo, "phase7b-demo-state.json");
      const journal = path.join(demo, "phase7b-demo-events.jsonl");
      const probe = fs.existsSync(journal) ? journal : fs.existsSync(state) ? state : demo;
      found.push({ dir: demo, mtimeMs: fs.statSync(probe).mtimeMs });
    }
  }

  found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return found[0]?.dir ?? null;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
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
