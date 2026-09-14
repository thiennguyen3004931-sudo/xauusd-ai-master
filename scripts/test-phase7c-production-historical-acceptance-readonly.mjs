import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const probePath = resolve(
  process.cwd(),
  "scripts",
  "probe-phase7c-production-historical-acceptance-readonly-local.ps1",
);

assert.ok(
  existsSync(probePath),
  "production historical acceptance read-only probe must exist",
);

const source = readFileSync(probePath, "utf8");

for (const invariant of [
  "READ_ONLY=TRUE",
  "HTTP_METHODS=GET_ONLY",
  "GIT_MUTATION=NONE",
  "TASK_MUTATION=NONE",
  "PROCESS_MUTATION=NONE",
  "MODE_MUTATION=NONE",
  "ARM_MUTATION=NONE",
  "ORDER_MUTATION=NONE",
  "POSITION_MUTATION=NONE",
  "LIVE_TEST_ORDER=NONE",
  "BRIDGE_RESTART=NONE",
]) {
  assert.ok(source.includes(invariant), `missing safety invariant ${invariant}`);
}

assert.ok(
  source.includes("preflight-phase7c-production-readonly-local.ps1"),
  "historical acceptance must reuse the canonical production read-only preflight",
);
assert.ok(source.includes("CANONICAL_PREFLIGHT_RESULT"), "probe must expose canonical preflight result");
assert.ok(source.includes("CANONICAL_PREFLIGHT_FAIL"), "canonical preflight failure must fail acceptance closed");

for (const endpoint of [
  "/v1/candles/XAUUSD",
  "/v1/history/candles/XAUUSD",
  "/v1/positions?symbol=XAUUSD",
  "/v1/orders?symbol=XAUUSD",
]) {
  assert.ok(source.includes(endpoint), `missing canonical bridge GET endpoint ${endpoint}`);
}

for (const marker of [
  "TIMEFRAME=M5",
  "SAMPLE_COUNT=3",
  "MODE=PAUSE",
  "ARM=DISARMED",
  "XAUUSD_POSITIONS=0",
  "XAUUSD_PENDING_ORDERS=0",
  "OPEN_TIME=EXACT",
  "CLOSE_TIME=EXACT",
  "OPEN=EXACT",
  "HIGH=EXACT",
  "LOW=EXACT",
  "CLOSE=EXACT",
  "PHASE7C_PRODUCTION_HISTORICAL_ACCEPTANCE=$verdict",
]) {
  assert.ok(source.includes(marker), `missing historical acceptance marker ${marker}`);
}

for (const field of ["openTime", "closeTime", "open", "high", "low", "close"]) {
  assert.ok(source.includes(field), `historical parity must compare ${field}`);
}

assert.ok(source.includes("$verdict = 'PASS'"), "probe must define an explicit PASS verdict branch");
assert.ok(source.includes("$verdict = 'FAIL'"), "probe must define explicit FAIL verdict branches");

assert.doesNotMatch(
  source,
  /Invoke-(?:RestMethod|WebRequest)[^\n]*-Method\s+(?:Post|Put|Patch|Delete)/i,
  "probe must never issue mutating HTTP methods",
);
assert.doesNotMatch(
  source,
  /\b(?:Stop-Process|Start-Process|Stop-ScheduledTask|Start-ScheduledTask|Set-Content|Add-Content|Remove-Item|Move-Item|Copy-Item)\b/i,
  "probe must not mutate process/task/filesystem state",
);
assert.doesNotMatch(
  source,
  /(?:10800|10_?800|3\s*\*\s*60\s*\*\s*60|AddHours\s*\(\s*3\s*\))/i,
  "probe must not hard-code a GMT+3 broker offset",
);
assert.doesNotMatch(
  source,
  /20\d{2}[-\/]\d{1,2}[-\/]\d{1,2}/,
  "probe must not depend on a fixed historical date",
);

console.log("PHASE7C_PRODUCTION_HISTORICAL_ACCEPTANCE_READONLY_CONTRACT=PASS");
