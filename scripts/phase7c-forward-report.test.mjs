import assert from "node:assert/strict";
import test from "node:test";
import {
  blockedReasonCounts,
  buildEntryRows,
  eventTimeMs,
  filterWindow,
  nearestDecision,
  regimeDistribution,
  summarizeDeals,
} from "./phase7c-forward-report-utils.mjs";

test("eventTimeMs parses numeric and ISO timestamps", () => {
  assert.equal(eventTimeMs({ timestamp: 1234 }), 1234);
  assert.equal(eventTimeMs({ timestamp: "2026-08-16T00:00:00.000Z" }), Date.parse("2026-08-16T00:00:00.000Z"));
});

test("filterWindow keeps only in-range rows", () => {
  const rows = [{ timestamp: 100 }, { timestamp: 200 }, { timestamp: 300 }];
  assert.deepEqual(filterWindow(rows, 150, 250), [{ timestamp: 200 }]);
});

test("nearestDecision selects latest snapshot at or before entry", () => {
  const decisions = [
    { timestamp: 100, regime: "UNCERTAIN" },
    { timestamp: 200, regime: "TRENDING" },
    { timestamp: 300, regime: "RANGING" },
  ];
  assert.equal(nearestDecision(decisions, 250).regime, "TRENDING");
});

test("buildEntryRows correlates entries with regime journal", () => {
  const trend = [{ type: "ENTRY_FILLED", timestamp: 250, position: { ticket: "1", side: "LONG", volume: 0.03, entry: 2500 } }];
  const decisions = [{ type: "AUTO_DECISION", timestamp: 200, regime: "TRENDING", recommendedMode: "TREND", activeMode: "AUTO", confidence: 80 }];
  const rows = buildEntryRows(trend, [], decisions);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].regime, "TRENDING");
  assert.equal(rows[0].recommendedMode, "TREND");
});

test("summarizeDeals keeps Sideway exits with Sideway position when bridge close magic is Trend magic", () => {
  const deals = [
    { isTradingDeal: true, timestamp: 100, positionId: "T1", magic: 270713, comment: "phase7b-demo", entry: "IN", volume: 0.03, profit: 0, commission: -0.1, swap: 0, fee: 0, netPnl: -0.1 },
    { isTradingDeal: true, timestamp: 200, positionId: "T1", magic: 270713, comment: "p7b-exit", entry: "OUT", volume: 0.03, profit: 9, commission: -0.1, swap: 0, fee: 0, netPnl: 8.9 },
    { isTradingDeal: true, timestamp: 100, positionId: "S1", magic: 270714, comment: "phase7c-sideway", entry: "IN", volume: 0.03, profit: 0, commission: -0.1, swap: 0, fee: 0, netPnl: -0.1 },
    { isTradingDeal: true, timestamp: 200, positionId: "S1", magic: 270713, comment: "p7c-sideway-tp1", entry: "OUT", volume: 0.01, profit: 4, commission: 0, swap: 0, fee: 0, netPnl: 4 },
  ];
  const summary = summarizeDeals(deals, 270713, 270714);
  assert.equal(summary.TREND.deals, 2);
  assert.equal(summary.TREND.netPnl, 8.8);
  assert.equal(summary.SIDEWAY.deals, 2);
  assert.equal(summary.SIDEWAY.netPnl, 3.9);
});

test("summarizeDeals uses pre-window opening deal only for ownership, not pnl", () => {
  const deals = [
    { isTradingDeal: true, timestamp: 100, positionId: "S2", magic: 270714, comment: "phase7c-sideway", entry: "IN", volume: 0.03, profit: 0, commission: -0.1, swap: 0, fee: 0, netPnl: -0.1 },
    { isTradingDeal: true, timestamp: 250, positionId: "S2", magic: 270713, comment: "p7c-sideway-exit", entry: "OUT", volume: 0.03, profit: 6, commission: -0.1, swap: 0, fee: 0, netPnl: 5.9 },
  ];
  const summary = summarizeDeals(deals, 270713, 270714, { fromMs: 200, toMs: 300 });
  assert.equal(summary.SIDEWAY.deals, 1);
  assert.equal(summary.SIDEWAY.entryDeals, 0);
  assert.equal(summary.SIDEWAY.exitDeals, 1);
  assert.equal(summary.SIDEWAY.netPnl, 5.9);
  assert.equal(summary.TREND.deals, 0);
});

test("blockedReasonCounts and regimeDistribution summarize telemetry", () => {
  assert.deepEqual(blockedReasonCounts([{ type: "ENTRY_MODE_BLOCK" }, { type: "ENTRY_MODE_BLOCK" }, { type: "ENTRY_FILLED" }]), { ENTRY_MODE_BLOCK: 2 });
  const distribution = regimeDistribution([
    { type: "AUTO_DECISION", regime: "RANGING", recommendedMode: "SIDEWAY", activeMode: "AUTO" },
    { type: "AUTO_DECISION", regime: "RANGING", recommendedMode: "SIDEWAY", activeMode: "AUTO" },
    { type: "AUTO_DECISION", regime: "TRENDING", recommendedMode: "TREND", activeMode: "AUTO" },
  ]);
  assert.equal(distribution.regime.RANGING, 2);
  assert.equal(distribution.regime.TRENDING, 1);
});
