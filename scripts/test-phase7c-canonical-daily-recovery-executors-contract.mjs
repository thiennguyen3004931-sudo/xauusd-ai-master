import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  transformPhase7CSidewayCanonicalDailyRecoverySource,
  transformPhase7CTrendCanonicalDailyRecoverySource,
} from "./phase7c-canonical-daily-recovery-source-adapter.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const trendAccountMode = read("scripts/run-phase7c-trend-account-mode.mjs");
const sidewayAccountMode = read("scripts/run-phase7c-sideway-account-mode.mjs");
const accountGuard = read("scripts/phase7c-account-runtime-guard.mjs");
const canonicalExecutor = read("scripts/phase7c-canonical-daily-recovery-executor.mjs");
const trendLegacy = read("scripts/run-phase7b-demo-controller.ts");
const sidewayLegacy = read("scripts/run-phase7c-sideway-controller.mjs");

assert.ok(
  trendAccountMode.includes("transformPhase7CTrendCanonicalDailyRecoverySource"),
  "Trend DEMO and LIVE runtime must canonicalize legacy Daily Recovery planning before execution.",
);
assert.ok(
  sidewayAccountMode.includes("transformPhase7CSidewayCanonicalDailyRecoverySource"),
  "Sideway DEMO and LIVE runtime must canonicalize Daily Recovery planning before execution.",
);

const transformedTrend = transformPhase7CTrendCanonicalDailyRecoverySource(trendLegacy);
const transformedSideway = transformPhase7CSidewayCanonicalDailyRecoverySource(sidewayLegacy);
for (const [strategy, transformed] of [["TREND", transformedTrend], ["SIDEWAY", transformedSideway]]) {
  assert.ok(
    transformed.includes("fetchPhase7CCanonicalDailyRecoveryPlan"),
    `${strategy} transformed planner must fetch canonical Daily Recovery.`,
  );
  assert.ok(
    transformed.includes("registerPhase7CCanonicalDailyRecoverySubmission"),
    `${strategy} transformed planner must register the canonical snapshot for final SEND verification.`,
  );
  assert.ok(
    !transformed.includes("/v1/history/deals?fromMs="),
    `${strategy} transformed runtime must not derive Daily Recovery from private broker deal-history math.`,
  );
}

assert.ok(
  canonicalExecutor.includes("/api/v1/phase7c/daily-recovery?symbol="),
  "Executor canonical Daily Recovery must use the existing canonical API view.",
);
assert.ok(
  canonicalExecutor.includes('const expectedDailyMode = dailyNetPnl < 0 ? "RECOVERY_TP" : "NORMAL"'),
  "Canonical positive/flat day must normalize only to NORMAL; negative day to RECOVERY_TP.",
);
assert.ok(
  canonicalExecutor.includes("submission snapshot is missing"),
  "Missing planner snapshot must fail closed at final SEND verification.",
);
assert.ok(
  canonicalExecutor.includes("changed before SEND"),
  "A canonical snapshot change between planning and SEND must fail closed.",
);

const verifyIndex = accountGuard.indexOf("verifyPhase7CCanonicalDailyRecoverySubmission");
const rawSendIndex = accountGuard.indexOf("return nativeFetch(input, init);", verifyIndex);
assert.ok(
  verifyIndex >= 0 && rawSendIndex > verifyIndex,
  "Common account-order transport guard must verify canonical Daily Recovery before raw broker SEND.",
);
assert.ok(
  accountGuard.includes("CANONICAL_DAILY_RECOVERY_FINAL_GATE_FAIL_CLOSED"),
  "Canonical Daily Recovery unavailable/malformed/mismatched at final gate must return a fail-closed block.",
);

console.log("PHASE7C_CANONICAL_DAILY_RECOVERY_EXECUTORS_CONTRACT=PASS");
console.log("TREND_DAILY_RECOVERY_SOURCE=CANONICAL");
console.log("SIDEWAY_DAILY_RECOVERY_SOURCE=CANONICAL");
console.log("CANONICAL_POSITIVE_DAY_RECOVERY=FORBIDDEN");
console.log("CANONICAL_UNVERIFIED_PRE_SEND=FAIL_CLOSED");
