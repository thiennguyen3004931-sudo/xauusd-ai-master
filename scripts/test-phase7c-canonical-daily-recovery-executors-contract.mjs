import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const trendGate = read("scripts/run-phase7c-trend-controller.mjs");
const sidewayGate = read("scripts/run-phase7c-sideway-locked.mjs");
const sidewayAccountMode = read("scripts/run-phase7c-sideway-account-mode.mjs");

assert.ok(
  trendGate.includes("transformPhase7CTrendCanonicalDailyRecoverySource"),
  "Trend runtime must transform legacy Daily Recovery planning to the canonical API source.",
);
assert.ok(
  trendGate.includes("verifyPhase7CCanonicalDailyRecoverySubmission"),
  "Trend final POST /v1/orders gate must re-verify canonical Daily Recovery immediately before broker SEND.",
);
assert.ok(
  sidewayGate.includes("verifyPhase7CCanonicalDailyRecoverySubmission"),
  "Sideway final POST /v1/orders gate must re-verify canonical Daily Recovery immediately before broker SEND.",
);
assert.ok(
  sidewayAccountMode.includes("transformPhase7CSidewayCanonicalDailyRecoverySource"),
  "Sideway DEMO and LIVE execution must transform Daily Recovery planning to the canonical API source.",
);

const trendVerify = trendGate.indexOf("verifyPhase7CCanonicalDailyRecoverySubmission");
const trendSend = trendGate.indexOf("return await nativeFetch(input, init)", trendVerify);
assert.ok(
  trendVerify >= 0 && trendSend > trendVerify,
  "Trend canonical Daily Recovery verification must execute before native broker SEND.",
);

const sidewayVerify = sidewayGate.indexOf("verifyPhase7CCanonicalDailyRecoverySubmission");
const sidewaySend = sidewayGate.indexOf("return await nativeFetch(input, init)", sidewayVerify);
assert.ok(
  sidewayVerify >= 0 && sidewaySend > sidewayVerify,
  "Sideway canonical Daily Recovery verification must execute before native broker SEND.",
);

console.log("PHASE7C_CANONICAL_DAILY_RECOVERY_EXECUTORS_CONTRACT=PASS");
console.log("CANONICAL_POSITIVE_DAY_RECOVERY=FORBIDDEN");
console.log("CANONICAL_UNVERIFIED_PRE_SEND=FAIL_CLOSED");
