import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { classifyPhase7CTrendEntryBlock } from "./phase7c-trend-entry-block.mjs";

test("classifies the canonical Phase 7C Trend 423 mode-gate response as an expected entry block", () => {
  const result = classifyPhase7CTrendEntryBlock({
    bridgeStatus: 423,
    bridgeMethod: "POST",
    bridgeEndpoint: "/v1/orders",
    bridgePayload: {
      error: "PHASE7C_TREND_ENTRY_BLOCKED",
      accepted: false,
      status: "blocked_by_phase7c_mode_gate",
      message: "AUTO_REGIME_RECOMMENDS_PAUSE",
      activeMode: "AUTO",
      recommendedMode: "PAUSE",
      detail: "Regime=UNCERTAIN; no canonical REVERSAL exception applies.",
    },
  });

  assert.deepEqual(result, {
    status: "blocked_by_phase7c_mode_gate",
    bridgeError: "PHASE7C_TREND_ENTRY_BLOCKED",
    reasonCode: "AUTO_REGIME_RECOMMENDS_PAUSE",
    reason: "Regime=UNCERTAIN; no canonical REVERSAL exception applies.",
    activeMode: "AUTO",
    recommendedMode: "PAUSE",
  });
});

test("does not downgrade unrelated bridge failures into expected entry blocks", () => {
  const canonicalPayload = {
    error: "PHASE7C_TREND_ENTRY_BLOCKED",
    accepted: false,
    status: "blocked_by_phase7c_mode_gate",
    message: "AUTO_REGIME_RECOMMENDS_PAUSE",
  };

  assert.equal(classifyPhase7CTrendEntryBlock({
    bridgeStatus: 500,
    bridgeMethod: "POST",
    bridgeEndpoint: "/v1/orders",
    bridgePayload: canonicalPayload,
  }), null);

  assert.equal(classifyPhase7CTrendEntryBlock({
    bridgeStatus: 423,
    bridgeMethod: "GET",
    bridgeEndpoint: "/v1/orders",
    bridgePayload: canonicalPayload,
  }), null);

  assert.equal(classifyPhase7CTrendEntryBlock({
    bridgeStatus: 423,
    bridgeMethod: "POST",
    bridgeEndpoint: "/v1/positions",
    bridgePayload: canonicalPayload,
  }), null);

  assert.equal(classifyPhase7CTrendEntryBlock({
    bridgeStatus: 423,
    bridgeMethod: "POST",
    bridgeEndpoint: "/v1/orders",
    bridgePayload: {
      ...canonicalPayload,
      error: "SOME_OTHER_BLOCK",
    },
  }), null);
});

test("legacy Trend controller journals canonical policy blocks as ENTRY_MODE_BLOCKED instead of CYCLE_ERROR", () => {
  const source = fs.readFileSync(new URL("./run-phase7b-demo-controller.ts", import.meta.url), "utf8");

  assert.match(source, /classifyPhase7CTrendEntryBlock/);
  assert.match(source, /journal\("ENTRY_MODE_BLOCKED"/);
  assert.match(source, /bridgeStatus/);
  assert.match(source, /bridgePayload/);
});
