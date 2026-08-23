import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  evaluatePhase7CAccountHealth,
  resolvePhase7CAccountRuntime,
} from "./phase7c-account-runtime-guard.mjs";
import {
  transformPhase7CSidewaySource,
  transformPhase7CTrendLegacySource,
} from "./phase7c-live-source-adapters.mjs";

const scriptsDir = fileURLToPath(new URL("./", import.meta.url));

function runtimeEnv(accountMode) {
  if (accountMode === "LIVE") {
    return {
      ZIQ_PHASE7C_ACCOUNT_MODE: "LIVE",
      ZIQ_PHASE7C_LIVE_EXECUTION_ENABLED: "true",
      MT5_ALLOW_REAL_ACCOUNT: "true",
      MT5_TRADING_ENABLED: "true",
      MT5_ALLOWED_LOGINS: "123456",
    };
  }
  return {
    ZIQ_PHASE7C_ACCOUNT_MODE: "DEMO",
    ZIQ_PHASE7C_LIVE_EXECUTION_ENABLED: "false",
    MT5_ALLOW_REAL_ACCOUNT: "false",
    MT5_TRADING_ENABLED: "true",
    MT5_ALLOWED_LOGINS: "123456",
  };
}

function health(accountMode, login = 123456) {
  return {
    status: "ok",
    connected: true,
    accountMode,
    accountLogin: login,
    tradingEnabled: true,
    terminalTradeAllowed: true,
    expertTradeAllowed: true,
  };
}

const demo = resolvePhase7CAccountRuntime(runtimeEnv("DEMO"));
assert.equal(demo.accountMode, "DEMO");
assert.equal(demo.expectedBrokerMode, "demo");
assert.equal(evaluatePhase7CAccountHealth(health("demo"), demo).allowed, true);
assert.equal(evaluatePhase7CAccountHealth(health("real"), demo).allowed, false);

const live = resolvePhase7CAccountRuntime(runtimeEnv("LIVE"));
assert.equal(live.accountMode, "LIVE");
assert.equal(live.expectedBrokerMode, "real");
assert.equal(evaluatePhase7CAccountHealth(health("real"), live).allowed, true);
assert.equal(evaluatePhase7CAccountHealth(health("demo"), live).allowed, false);
assert.equal(evaluatePhase7CAccountHealth(health("real", 999999), live).reason, "ACCOUNT_LOGIN_NOT_ALLOWLISTED");

assert.throws(
  () => resolvePhase7CAccountRuntime({ ...runtimeEnv("LIVE"), ZIQ_PHASE7C_LIVE_EXECUTION_ENABLED: "false" }),
  /LIVE runtime requires ZIQ_PHASE7C_LIVE_EXECUTION_ENABLED=true/,
);
assert.throws(
  () => resolvePhase7CAccountRuntime({ ...runtimeEnv("LIVE"), MT5_ALLOW_REAL_ACCOUNT: "false" }),
  /LIVE runtime requires MT5_ALLOW_REAL_ACCOUNT=true/,
);
assert.throws(
  () => resolvePhase7CAccountRuntime({ ...runtimeEnv("DEMO"), MT5_ALLOW_REAL_ACCOUNT: "true" }),
  /DEMO runtime requires MT5_ALLOW_REAL_ACCOUNT=false/,
);

const trendSource = fs.readFileSync(`${scriptsDir}run-phase7b-demo-controller.ts`, "utf8");
const trendLive = transformPhase7CTrendLegacySource(trendSource);
assert.match(trendLive, /health\.accountMode !== "real"/);
assert.doesNotMatch(trendLive, /Phase 7B DEMO refuses MT5_ALLOW_REAL_ACCOUNT=true/);
for (const marker of [
  "MIN_INITIAL_SL_PRICE = 6",
  "MAX_INITIAL_SL_PRICE = 10",
  "PHASE7B_DEMO_PLUS6=SL_TO_ENTRY",
  "PHASE7B_DEMO_PLUS10=PARTIAL_ONE_THIRD",
  "PHASE7B_DEMO_DAILY_RECOVERY_LOT_ESCALATION=OFF",
]) {
  assert.ok(trendSource.includes(marker), `Trend canonical source missing strategy marker: ${marker}`);
  assert.ok(trendLive.includes(marker), `Trend LIVE adapter mutated strategy marker: ${marker}`);
}

const sidewaySource = fs.readFileSync(`${scriptsDir}run-phase7c-sideway-controller.mjs`, "utf8");
const sidewayLive = transformPhase7CSidewaySource(sidewaySource);
assert.match(sidewayLive, /health\.accountMode !== "real"/);
for (const marker of [
  "PHASE7C_SIDEWAY_PLUS6=SL_TO_ENTRY",
  "PHASE7C_SIDEWAY_PLUS10=PARTIAL_ONE_THIRD",
  "PHASE7C_SIDEWAY_DAILY_RECOVERY_LOT_ESCALATION=OFF",
  "WAIT_PULLBACK_STOP_GT_10",
]) {
  assert.ok(sidewaySource.includes(marker), `Sideway canonical source missing strategy marker: ${marker}`);
  assert.ok(sidewayLive.includes(marker), `Sideway LIVE adapter mutated strategy marker: ${marker}`);
}

assert.throws(
  () => transformPhase7CTrendLegacySource(trendSource.replace("health.accountMode !== \"demo\"", "health.accountMode !== \"paper\"")),
  /adapter marker no longer matches source/,
);
assert.throws(
  () => transformPhase7CSidewaySource(sidewaySource.replace("health.accountMode !== \"demo\"", "health.accountMode !== \"paper\"")),
  /adapter marker no longer matches source/,
);

const sidewayLock = fs.readFileSync(`${scriptsDir}run-phase7c-sideway-locked.mjs`, "utf8");
assert.match(sidewayLock, /evaluatePhase7CAccountHealth/);
assert.match(sidewayLock, /fetchHealthUnderLock/);
assert.match(sidewayLock, /POSITION_PRESENT_UNDER_LOCK/);

const trendWrapper = fs.readFileSync(`${scriptsDir}run-phase7c-trend-account-mode.mjs`, "utf8");
assert.match(trendWrapper, /installPhase7CAccountOrderFetchGuard/);
assert.match(trendWrapper, /transformPhase7CTrendLegacySource/);

console.log("PHASE7C_DUAL_ACCOUNT_NODE_TEST=PASS");
