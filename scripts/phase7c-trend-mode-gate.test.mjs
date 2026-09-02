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
      confidence: 0.83,
    },
    demo: {
      entryDiagnostics: {
        entry: { eligible: true },
      },
    },
    ...overrides,
  };
}

test("AUTO keeps the normal TREND recommendation path and authoritative regime snapshot", () => {
  const decision = evaluateAutoTrendEntryModeGate(input());
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, "AUTO_REGIME_ALLOWS_TREND");
  assert.equal(decision.regime, "TRENDING");
  assert.equal(decision.regimeConfidence, 0.83);
});

test("AUTO allows REVERSAL only when the canonical Trend entry is eligible and preserves its snapshot", () => {
  const value = input();
  value.regime = {
    activeMode: "AUTO",
    regime: "REVERSAL",
    recommendedMode: "PAUSE",
    confidence: 0.71,
  };

  const decision = evaluateAutoTrendEntryModeGate(value);
  assert.equal(decision.allowed, true);
  assert.equal(decision.recommendedMode, "PAUSE");
  assert.equal(decision.reason, "AUTO_REVERSAL_CANONICAL_TREND_ENTRY");
  assert.equal(decision.regime, "REVERSAL");
  assert.equal(decision.regimeConfidence, 0.71);
});

test("AUTO keeps REVERSAL fail-closed without canonical eligibility", () => {
  const value = input();
  value.regime = {
    activeMode: "AUTO",
    regime: "REVERSAL",
    recommendedMode: "PAUSE",
    confidence: 0.62,
  };
  value.demo.entryDiagnostics.entry.eligible = false;

  const decision = evaluateAutoTrendEntryModeGate(value);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "AUTO_REGIME_RECOMMENDS_PAUSE");
  assert.equal(decision.regime, "REVERSAL");
  assert.equal(decision.regimeConfidence, 0.62);
});

test("AUTO does not use the reversal exception for UNCERTAIN", () => {
  const value = input();
  value.regime = {
    activeMode: "AUTO",
    regime: "UNCERTAIN",
    recommendedMode: "PAUSE",
    confidence: "not-a-number",
  };

  const decision = evaluateAutoTrendEntryModeGate(value);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "AUTO_REGIME_RECOMMENDS_PAUSE");
  assert.equal(decision.regime, "UNCERTAIN");
  assert.equal(decision.regimeConfidence, null);
});

test("mode changes during the locked gate fail closed without losing observed regime", () => {
  const value = input();
  value.regime = {
    activeMode: "PAUSE",
    regime: "REVERSAL",
    recommendedMode: "PAUSE",
    confidence: 0.55,
  };

  const decision = evaluateAutoTrendEntryModeGate(value);
  assert.equal(decision.allowed, false);
  assert.equal(decision.activeMode, "PAUSE");
  assert.equal(decision.reason, "BOT_MODE_CHANGED_DURING_GATE");
  assert.equal(decision.regime, "REVERSAL");
  assert.equal(decision.regimeConfidence, 0.55);
});
