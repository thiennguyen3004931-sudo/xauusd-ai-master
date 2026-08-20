import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPhase7CDecisionMonitor,
  formatPhase7CDecisionMonitorForMt5,
} from "../apps/api/src/services/phase7c-decision-monitor.service.ts";

function fixture(overrides = {}) {
  return {
    regime: {
      symbol: "XAUUSD",
      timeframe: "M15",
      regime: "TRENDING",
      confidence: 82,
      recommendedMode: "TREND",
      activeMode: "AUTO",
      modeMatchesRecommendation: true,
      reasons: ["ADX and structure support trend."],
      metrics: {},
      supplyDemandRange: null,
      lastCandleCloseTime: 1_776_000_000_000,
      checkedAt: 1_776_000_001_000,
    },
    demo: {
      botStatus: "WAITING_SIGNAL",
      entryDiagnostics: {
        pattern: { matched: true, name: "ENGULFING", side: "BUY" },
        trend: { confidenceScore: 80, confidenceLevel: "RẤT_CAO" },
        entry: {
          eligible: true,
          side: "BUY",
          referenceEntry: 2500,
          structuralStopDistance: 5,
          stopDistance: 6,
          action: "ENTRY_IMMEDIATE",
          reason: "Canonical Trend setup is valid.",
        },
      },
    },
    telemetry: {
      enabled: true,
      configured: true,
      reachable: true,
      status: "HEALTHY",
      message: "ok",
      latencyMs: 1,
      bridgeBaseUrl: "http://127.0.0.1:8765",
      health: { accountMode: "demo", accountBalance: 10_000, accountCurrency: "USD", timestamp: 1 },
      quote: null,
      spec: { cashPerPriceUnitPerLot: 100 },
      positions: [],
      checkedAt: 1,
    },
    lots: {
      state: { version: 1, trendFixedLot: 0.12, sidewayRiskPercent: 1, sidewayMaxLot: 0.3, updatedAt: "", updatedBy: "test" },
      active: { version: 1, trendFixedLot: 0.12, sidewayRiskPercent: 1, sidewayMaxLot: 0.3, armed: true, supervisorPid: 1, appliedAt: "" },
      activeAlive: true,
      restartRequired: false,
      appliesTo: "NEW_POSITIONS_ONLY",
      safety: {},
      limits: {},
    },
    audit: [],
    now: 1_776_000_002_000,
    ...overrides,
  };
}

test("decision monitor calculates the active Trend lot and exact risk before entry", () => {
  const snapshot = buildPhase7CDecisionMonitor(fixture());
  assert.equal(snapshot.preTrade.strategy, "TREND");
  assert.equal(snapshot.preTrade.approved, true);
  assert.equal(snapshot.preTrade.finalLot, 0.12);
  assert.equal(snapshot.preTrade.stopDistance, 6);
  assert.equal(snapshot.preTrade.estimatedRiskUsd, 72);
  assert.equal(snapshot.preTrade.estimatedRiskPercent, 0.72);
  assert.equal(snapshot.preTrade.tp1, 2510);
  assert.deepEqual(snapshot.engine.reasons, ["ADX and structure support trend."]);
});

test("MT5 payload remains read-only and carries the canonical decision", () => {
  const payload = formatPhase7CDecisionMonitorForMt5(buildPhase7CDecisionMonitor(fixture()));
  assert.match(payload, /^version=1/m);
  assert.match(payload, /^finalLot=0\.12/m);
  assert.match(payload, /^estimatedRiskUsd=72/m);
  assert.match(payload, /^mt5OrderPermission=NONE/m);
});
