import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const probePath = resolve(process.cwd(), "scripts", "probe-phase7c-pr322-production-acceptance-readonly-local.ps1");
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
  assert.match(source, new RegExp(invariant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing safety invariant ${invariant}`);
}

for (const endpoint of [
  "/api/v1/phase7c/bot-mode",
  "/api/v1/phase7c/decision-monitor?symbol=XAUUSD",
  "/api/v1/phase7c/lifecycle",
  "/api/v1/phase7c/runtime-source-attestation",
  "/api/v1/phase7c-live-arm-control/capability",
]) {
  assert.ok(source.includes(endpoint), `missing canonical GET endpoint ${endpoint}`);
}

assert.ok(source.includes("state.updatedAt"), "AUTO activation freshness must use bot-mode.state.updatedAt");
assert.ok(source.includes("engine.checkedAt"), "decision freshness must use decision-monitor.engine.checkedAt");
assert.ok(source.includes("lastCandleCloseTime"), "probe must expose M15 candle evidence");
assert.ok(source.includes("DECISION_AFTER_AUTO"), "probe must report decision-after-AUTO evidence");
assert.ok(source.includes("DECISION_FRESH"), "probe must report decision freshness");
assert.ok(source.includes("PENDING_FRESH_DECISION"), "probe must fail closed when no post-AUTO decision exists");
assert.ok(source.includes("PR322_PRODUCTION_ACCEPTANCE=PASS"), "probe must have an explicit PASS verdict");
assert.ok(source.includes("PR322_PRODUCTION_ACCEPTANCE=FAIL"), "probe must have an explicit FAIL verdict");

assert.doesNotMatch(source, /generatedAt\s*(?:-gt|-ge|>|>=)\s*\$?mode/i, "generatedAt must not establish decision freshness");
assert.doesNotMatch(source, /Invoke-(?:RestMethod|WebRequest)[^\n]*-Method\s+(?:Post|Put|Patch|Delete)/i, "probe must never issue mutating HTTP methods");
assert.doesNotMatch(source, /\b(?:Stop-Process|Start-Process|Stop-ScheduledTask|Start-ScheduledTask|Set-Content|Add-Content|Remove-Item|Move-Item|Copy-Item)\b/i, "probe must not mutate process/task/filesystem state");

console.log("PHASE7C_PR322_PRODUCTION_ACCEPTANCE_READONLY_CONTRACT=PASS");
