import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAutoTrendEntryModeGate } from "./phase7c-trend-mode-gate.mjs";

function input(overrides = {}) {
  return {
    activeMode: "AUTO",
    regime: {
      activeMode: "AUTO",
      regime: "TRENDING",
      recommendedMode: "TREND",
    },
    demo: {
      entryDiagnostics: {
        entry: { eligible: true },
      },
    },
    ...overrides,
  };
}

test("AUTO keeps the normal TREND recommendation path", () => {
  const decision = evaluateAutoTrendEntryModeGate(input());
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, "AUTO_REGIME_ALLOWS_TREND");
});

test("AUTO allows REVERSAL only when the canonical Trend entry is eligible", () => {
  const value = input();
  value.regime = {
    activeMode: "AUTO",
    regime: "REVERSAL",
    recommendedMode: "PAUSE",
  };

  const decision = evaluateAutoTrendEntryModeGate(value);
  assert.equal(decision.allowed, true);
  assert.equal(decision.recommendedMode, "PAUSE");
  assert.equal(decision.reason, "AUTO_REVERSAL_CANONICAL_TREND_ENTRY");
});

test("AUTO keeps REVERSAL fail-closed without canonical eligibility", () => {
  const value = input();
  value.regime = {
    activeMode: "AUTO",
    regime: "REVERSAL",
    recommendedMode: "PAUSE",
  };
  value.demo.entryDiagnostics.entry.eligible = false;

  const decision = evaluateAutoTrendEntryModeGate(value);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "AUTO_REGIME_RECOMMENDS_PAUSE");
});

test("AUTO does not use the reversal exception for UNCERTAIN", () => {
  const value = input();
  value.regime = {
    activeMode: "AUTO",
    regime: "UNCERTAIN",
    recommendedMode: "PAUSE",
  };

  const decision = evaluateAutoTrendEntryModeGate(value);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "AUTO_REGIME_RECOMMENDS_PAUSE");
});

test("mode changes during the locked gate fail closed", () => {
  const value = input();
  value.regime = {
    activeMode: "PAUSE",
    regime: "REVERSAL",
    recommendedMode: "PAUSE",
  };

  const decision = evaluateAutoTrendEntryModeGate(value);
  assert.equal(decision.allowed, false);
  assert.equal(decision.activeMode, "PAUSE");
  assert.equal(decision.reason, "BOT_MODE_CHANGED_DURING_GATE");
});
