import assert from "node:assert/strict";
import fs from "node:fs";

const index = fs.readFileSync("apps/api/src/index.ts", "utf8");
const runner = fs.readFileSync(
  "apps/api/src/services/phase7c-semi-adoption-runner.service.ts",
  "utf8",
);

assert.match(
  index,
  /startPhase7CSemiAdoptionRunner/,
  "API production startup must import the SEMI adoption runner.",
);
assert.match(
  index,
  /startPhase7CSemiAdoptionRunner\(\)/,
  "API production startup must start the SEMI adoption runner.",
);
assert.match(
  index,
  /stopPhase7CSemiAdoptionRunner\(\)/,
  "API shutdown must stop the SEMI adoption runner.",
);

assert.match(
  runner,
  /evaluateSemiManualAdoption/,
  "Runner must reuse the canonical manual-adoption evaluator.",
);
assert.match(
  runner,
  /createPhase7CSemiProtectionExecutor/,
  "Runner must reuse the broker-confirmed protection executor.",
);
assert.match(
  runner,
  /ZIQ_PHASE7C_EXECUTION_LOCK/,
  "Runner must serialize adoption through the same shared execution lock file as entry executors.",
);
assert.match(
  runner,
  /liveExecutionArmed/,
  "LIVE SEMI protection must fail closed unless the current bridge session is armed.",
);
assert.match(
  runner,
  /getMt5DealHistory/,
  "Manual provenance must be proven from canonical MT5 opening-deal history.",
);
assert.match(
  runner,
  /PHASE7C_SEMI_ADOPTION_RUNNER/,
  "Runner must expose bounded operational observability.",
);

assert.doesNotMatch(
  runner,
  /\.placeOrder\s*\(/,
  "SEMI adoption runner must never place a new order.",
);
assert.doesNotMatch(
  runner,
  /\.closePosition\s*\(/,
  "SEMI adoption runner must never close a position.",
);
assert.doesNotMatch(
  runner,
  /\.cancelOrder\s*\(/,
  "SEMI adoption runner must never cancel an order.",
);

console.log("PHASE7C_SEMI_PRODUCTION_ADOPTION_WIRING_SOURCE_TEST=PASS");
