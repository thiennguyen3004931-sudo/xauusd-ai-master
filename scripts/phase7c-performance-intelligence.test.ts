import assert from "node:assert/strict";
import test from "node:test";
import { __test } from "../apps/api/src/services/phase7c-performance-intelligence.service";

test("canonical entryConditions statuses become PASS/FAIL rule evidence", () => {
  const evidence = __test.ruleEvidence({
    entryConditions: {
      failedConditions: ["supertrendM5"],
      conditions: [
        { id: "patternM15", status: "PASS" },
        { id: "supertrendM5", status: "FAIL" },
        { id: "fvg", status: "IGNORED" },
      ],
    },
  });

  assert.deepEqual(evidence.passed, ["patternM15"]);
  assert.deepEqual(evidence.blocked, ["supertrendM5"]);
});

test("Trend fill exposes only explicit SIGNAL and POSITION identity", () => {
  const identifiers = __test.identifiersOf(
    {
      event: "ENTRY_FILLED",
      raw: {
        signalId: "trend-signal-1",
        position: { ticket: "304590358" },
      },
    },
    "ENTRY_FILLED",
  );

  assert.deepEqual(
    identifiers.map((item) => item.token).sort(),
    ["POSITION:304590358", "SIGNAL:trend-signal-1"],
  );
});

test("Sideway fill exposes explicit ORDER and POSITION identity", () => {
  const identifiers = __test.identifiersOf(
    {
      event: "ENTRY_FILLED",
      raw: {
        orderId: "p7c-sideway-123-BUY",
        position: { ticket: "4001" },
      },
    },
    "ENTRY_FILLED",
  );

  assert.deepEqual(
    identifiers.map((item) => item.token).sort(),
    ["ORDER:p7c-sideway-123-BUY", "POSITION:4001"],
  );
});

test("entry type uses canonical entryState and does not confuse recovery workflow with Daily Recovery", () => {
  assert.equal(
    __test.entryTypeOf({ setup: { entryState: "PULLBACK_ENTRY" } }, "ENTRY_FILLED", "TREND"),
    "PULLBACK",
  );
  assert.equal(
    __test.entryTypeOf({ setup: { entryState: "ENTRY_IMMEDIATE" } }, "ENTRY_FILLED", "TREND"),
    "IMMEDIATE",
  );
  assert.equal(
    __test.entryTypeOf({}, "PENDING_ENTRY_RECOVERED", "TREND"),
    "UNKNOWN",
  );
  assert.equal(
    __test.entryTypeOf({ plan: { dailyMode: "RECOVERY_TP" } }, "ENTRY_FILLED", "TREND"),
    "RECOVERY",
  );
  assert.equal(
    __test.entryTypeOf({}, "ENTRY_FILLED", "SIDEWAY"),
    "IMMEDIATE",
  );
});

test("untrusted generic ticket is not accepted outside entry fill/recovery events", () => {
  const identifiers = __test.identifiersOf(
    { event: "HOLD_POSITION", raw: { ticket: "999" } },
    "HOLD_POSITION",
  );
  assert.equal(identifiers.some((item) => item.token === "POSITION:999"), false);
});
