import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as performanceService from "./mt5-performance.service";

type Trade = {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  ownership: "SYSTEM" | "VALIDATION" | "OTHER";
  strategy: "TREND" | "SIDEWAY" | "OTHER";
  openedAt: number;
  closedAt: number;
  durationMinutes: number;
  volume: number;
  entry: number;
  exit: number;
  netPnl: number;
  session: string;
  brokerHour: number;
  weekday: string;
  exitReason: "UNKNOWN";
};

type AuditRow = {
  timestamp: number;
  strategy: "TREND" | "SIDEWAY";
  event: string;
  setup?: {
    side?: string | null;
    regime?: string | null;
    confidence?: number | null;
  };
  sizing?: {
    finalLot?: number | null;
  };
  raw?: Record<string, unknown>;
};

type EnrichedTrade = Trade & {
  regime: string | null;
  regimeConfidence: number | null;
  regimeAttribution: "MATCHED" | "UNMATCHED";
  regimeSource: string | null;
};

type Enrich = (trades: readonly Trade[], auditRows: readonly AuditRow[], maxDeltaMs?: number) => EnrichedTrade[];
type LoadFromDirectory = (root: string) => Promise<AuditRow[]>;

function subject(): Enrich {
  const candidate = (performanceService as unknown as Record<string, unknown>).enrichPerformanceTradesWithRegimeAttribution;
  assert.equal(
    typeof candidate,
    "function",
    "mt5-performance.service must export enrichPerformanceTradesWithRegimeAttribution",
  );
  return candidate as Enrich;
}

function loaderSubject(): LoadFromDirectory {
  const candidate = (performanceService as unknown as Record<string, unknown>).loadPhase7CPerformanceRegimeAuditFromDirectory;
  assert.equal(
    typeof candidate,
    "function",
    "mt5-performance.service must export loadPhase7CPerformanceRegimeAuditFromDirectory",
  );
  return candidate as LoadFromDirectory;
}

function trade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: "mt5-1001",
    symbol: "XAUUSD",
    side: "BUY",
    ownership: "SYSTEM",
    strategy: "TREND",
    openedAt: 1_000_000,
    closedAt: 1_600_000,
    durationMinutes: 10,
    volume: 0.12,
    entry: 3500,
    exit: 3510,
    netPnl: 120,
    session: "LONDON",
    brokerHour: 9,
    weekday: "Thứ 4",
    exitReason: "UNKNOWN",
    ...overrides,
  };
}

function trendAudit(overrides: Partial<AuditRow> = {}): AuditRow {
  return {
    timestamp: 999_500,
    strategy: "TREND",
    event: "ENTRY_FINAL_PERMISSION_GRANTED",
    setup: {
      side: "BUY",
      regime: "BREAKOUT",
      confidence: 87,
    },
    sizing: { finalLot: 0.12 },
    raw: { clientOrderId: "p7b-im-1-BUY" },
    ...overrides,
  };
}

function sidewayAudit(overrides: Partial<AuditRow> = {}): AuditRow {
  return {
    timestamp: 1_999_600,
    strategy: "SIDEWAY",
    event: "ENTRY_SUBMIT",
    setup: {
      side: "SELL",
      regime: "RANGING",
      confidence: 91,
    },
    sizing: { finalLot: 0.06 },
    raw: { orderId: "p7c-sideway-1-SELL" },
    ...overrides,
  };
}

test("matches a Trend system trade to its unique final-permission regime snapshot", () => {
  const enrich = subject();
  const [result] = enrich([trade()], [trendAudit()]);

  assert.equal(result.regimeAttribution, "MATCHED");
  assert.equal(result.regime, "BREAKOUT");
  assert.equal(result.regimeConfidence, 87);
  assert.equal(result.regimeSource, "TREND:ENTRY_FINAL_PERMISSION_GRANTED");
});

test("matches a Sideway system trade to its unique ENTRY_SUBMIT regime snapshot", () => {
  const enrich = subject();
  const sidewayTrade = trade({
    id: "mt5-2001",
    side: "SELL",
    strategy: "SIDEWAY",
    openedAt: 2_000_000,
    volume: 0.06,
    netPnl: 35,
  });
  const [result] = enrich([sidewayTrade], [sidewayAudit()]);

  assert.equal(result.regimeAttribution, "MATCHED");
  assert.equal(result.regime, "RANGING");
  assert.equal(result.regimeConfidence, 91);
  assert.equal(result.regimeSource, "SIDEWAY:ENTRY_SUBMIT");
});

test("fails closed when more than one authoritative event can match the same trade", () => {
  const enrich = subject();
  const [result] = enrich(
    [trade()],
    [
      trendAudit(),
      trendAudit({ timestamp: 999_700, setup: { side: "BUY", regime: "TRENDING", confidence: 82 } }),
    ],
  );

  assert.equal(result.regimeAttribution, "UNMATCHED");
  assert.equal(result.regime, null);
  assert.equal(result.regimeConfidence, null);
  assert.equal(result.regimeSource, null);
});

test("never assigns a system regime to manual or OTHER trades", () => {
  const enrich = subject();
  const manual = trade({ ownership: "OTHER", strategy: "OTHER" });
  const [result] = enrich([manual], [trendAudit()]);

  assert.equal(result.regimeAttribution, "UNMATCHED");
  assert.equal(result.regime, null);
  assert.equal(result.regimeSource, null);
});

test("keeps historical system trades UNMATCHED when no authoritative entry event exists", () => {
  const enrich = subject();
  const [result] = enrich([trade()], []);

  assert.equal(result.regimeAttribution, "UNMATCHED");
  assert.equal(result.regime, null);
  assert.equal(result.regimeConfidence, null);
  assert.equal(result.regimeSource, null);
});

test("regime enrichment is accounting-invariant", () => {
  const enrich = subject();
  const trades = [
    trade({ id: "mt5-1", netPnl: 120 }),
    trade({ id: "mt5-2", side: "SELL", openedAt: 2_000_000, netPnl: -30 }),
  ];
  const before = trades.reduce((sum, row) => sum + row.netPnl, 0);
  const enriched = enrich(trades, [trendAudit()]);
  const after = enriched.reduce((sum, row) => sum + row.netPnl, 0);

  assert.equal(after, before);
  assert.deepEqual(
    enriched.map(({ id, netPnl, entry, exit, volume }) => ({ id, netPnl, entry, exit, volume })),
    trades.map(({ id, netPnl, entry, exit, volume }) => ({ id, netPnl, entry, exit, volume })),
  );
});

test("audit reader keeps only authoritative Trend and Sideway entry rows and skips malformed lines", async () => {
  const load = loaderSubject();
  const root = mkdtempSync(join(tmpdir(), "phase7c-performance-regime-"));

  try {
    writeFileSync(
      join(root, "trend-decisions.jsonl"),
      [
        JSON.stringify(trendAudit()),
        JSON.stringify(trendAudit({ event: "ENTRY_SUBMIT" })),
        "{not-json",
      ].join("\n") + "\n",
      "utf8",
    );
    writeFileSync(
      join(root, "sideway-decisions.jsonl"),
      [
        JSON.stringify(sidewayAudit()),
        JSON.stringify(sidewayAudit({ event: "HOLD_POSITION" })),
      ].join("\n") + "\n",
      "utf8",
    );

    const rows = await load(root);
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((row) => `${row.strategy}:${row.event}`),
      [
        "TREND:ENTRY_FINAL_PERMISSION_GRANTED",
        "SIDEWAY:ENTRY_SUBMIT",
      ],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
