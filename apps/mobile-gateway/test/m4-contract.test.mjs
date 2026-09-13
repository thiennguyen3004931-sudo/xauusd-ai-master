import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  REMOTE_ACTIONS,
  parseActionBody,
  isRiskIncreasing,
} = require("../m4-contract.cjs");

const EXACT_ACTIONS = [
  "MODE_AUTO",
  "MODE_SEMI",
  "MODE_TREND",
  "MODE_SIDEWAY",
  "MODE_PAUSE",
  "ARM_LIVE",
  "DISARM_LIVE",
];

test("remote action allowlist is exact", () => {
  assert.deepEqual([...REMOTE_ACTIONS], EXACT_ACTIONS);
});

test("mode actions require exact confirmation and no extra fields", () => {
  assert.deepEqual(
    parseActionBody({ action: "MODE_TREND", confirmation: "MODE_TREND" }),
    { action: "MODE_TREND", confirmation: "MODE_TREND" },
  );
  assert.throws(() => parseActionBody({ action: "MODE_TREND" }), /confirmation/i);
  assert.throws(
    () => parseActionBody({ action: "MODE_TREND", confirmation: "MODE_TREND", source: "web-control-center" }),
    /forbidden|unexpected/i,
  );
});

test("ARM and DISARM accept only bounded preflight or execute shapes", () => {
  assert.deepEqual(parseActionBody({ action: "ARM_LIVE", phase: "PREFLIGHT" }), {
    action: "ARM_LIVE",
    phase: "PREFLIGHT",
  });
  assert.deepEqual(
    parseActionBody({
      action: "ARM_LIVE",
      phase: "EXECUTE",
      transactionId: "tx-1",
      confirmation: "ARM_LIVE",
    }),
    {
      action: "ARM_LIVE",
      phase: "EXECUTE",
      transactionId: "tx-1",
      confirmation: "ARM_LIVE",
    },
  );
  assert.throws(
    () => parseActionBody({ action: "DISARM_LIVE", phase: "EXECUTE", transactionId: "tx-1", confirmation: "ARM_LIVE" }),
    /confirmation/i,
  );
});

test("unknown actions and arbitrary upstream controls are rejected", () => {
  for (const action of ["LIFECYCLE_START", "ORDER_BUY", "POSITION_CLOSE", "LOT_SET", "ACCOUNT_SWITCH"]) {
    assert.throws(() => parseActionBody({ action, confirmation: action }), /action/i);
  }

  for (const forbidden of ["url", "path", "method", "source", "body", "headers", "apiOrigin", "mt5Origin"]) {
    assert.throws(
      () => parseActionBody({ action: "MODE_PAUSE", confirmation: "MODE_PAUSE", [forbidden]: "attacker-value" }),
      /forbidden|unexpected/i,
      forbidden,
    );
  }
});

test("risk classification is fixed", () => {
  for (const action of ["MODE_AUTO", "MODE_SEMI", "MODE_TREND", "MODE_SIDEWAY", "ARM_LIVE"]) {
    assert.equal(isRiskIncreasing(action), true, action);
  }
  for (const action of ["MODE_PAUSE", "DISARM_LIVE"]) {
    assert.equal(isRiskIncreasing(action), false, action);
  }
});
