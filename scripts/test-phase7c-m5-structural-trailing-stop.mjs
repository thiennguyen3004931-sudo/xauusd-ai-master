import assert from "node:assert/strict";
import fs from "node:fs";
import {
  findLatestConfirmedM5Structure,
  planM5StructuralTrailingStop,
} from "./phase7c-m5-structural-trailing-stop.mjs";
import {
  transformPhase7CTrendCanonicalDailyRecoverySource,
  transformPhase7CSidewayCanonicalDailyRecoverySource,
} from "./phase7c-canonical-daily-recovery-source-adapter.mjs";
import {
  transformPhase7CTrendM5StructuralTrailingSource,
  transformPhase7CSidewayM5StructuralTrailingSource,
} from "./phase7c-m5-structural-trailing-source-adapter.mjs";
import {
  transformPhase7CTrendLegacySource,
  transformPhase7CSidewaySource,
} from "./phase7c-live-source-adapters.mjs";

function bar(closeTime, { open, high, low, close }) {
  return { closeTime, open, high, low, close };
}

const BUY_HL_BARS = [
  bar(100, { open: 110, high: 114, low: 108, close: 112 }),
  bar(200, { open: 112, high: 113, low: 100, close: 105 }),
  bar(300, { open: 105, high: 112, low: 108, close: 111 }),
  bar(400, { open: 111, high: 118, low: 109, close: 116 }),
  bar(500, { open: 116, high: 117, low: 105, close: 108 }),
  bar(600, { open: 108, high: 119, low: 113, close: 118 }),
];

const SELL_LH_BARS = [
  bar(100, { open: 110, high: 112, low: 106, close: 108 }),
  bar(200, { open: 108, high: 120, low: 107, close: 116 }),
  bar(300, { open: 116, high: 112, low: 104, close: 106 }),
  bar(400, { open: 106, high: 110, low: 100, close: 102 }),
  bar(500, { open: 102, high: 115, low: 101, close: 111 }),
  bar(600, { open: 111, high: 110, low: 99, close: 101 }),
];

{
  const structure = findLatestConfirmedM5Structure({
    side: "BUY",
    bars: BUY_HL_BARS,
    afterTimestamp: 50,
    atOrBefore: 600,
  });
  assert.ok(structure, "BUY must resolve a confirmed M5 Higher Low");
  assert.equal(structure.kind, "HIGHER_LOW");
  assert.equal(structure.previousPrice, 100);
  assert.equal(structure.price, 105);
  assert.equal(structure.swingCloseTime, 500);
  assert.equal(structure.confirmationCloseTime, 600);
}

{
  const structure = findLatestConfirmedM5Structure({
    side: "SELL",
    bars: SELL_LH_BARS,
    afterTimestamp: 50,
    atOrBefore: 600,
  });
  assert.ok(structure, "SELL must resolve a confirmed M5 Lower High");
  assert.equal(structure.kind, "LOWER_HIGH");
  assert.equal(structure.previousPrice, 120);
  assert.equal(structure.price, 115);
  assert.equal(structure.swingCloseTime, 500);
  assert.equal(structure.confirmationCloseTime, 600);
}

{
  const structure = findLatestConfirmedM5Structure({
    side: "BUY",
    bars: BUY_HL_BARS,
    afterTimestamp: 50,
    atOrBefore: 599,
  });
  assert.equal(structure, null, "An M5 swing must not be used before its right-hand confirmation candle has closed");
}

{
  const lowerLowBars = BUY_HL_BARS.map((row) => ({ ...row }));
  lowerLowBars[4] = { ...lowerLowBars[4], low: 95 };
  const structure = findLatestConfirmedM5Structure({
    side: "BUY",
    bars: lowerLowBars,
    afterTimestamp: 50,
    atOrBefore: 600,
  });
  assert.equal(structure, null, "BUY must not trail from a Lower Low");
}

{
  const decision = planM5StructuralTrailingStop({
    active: false,
    side: "BUY",
    bars: BUY_HL_BARS,
    afterTimestamp: 50,
    atOrBefore: 600,
    currentStop: 100,
    lastStructuralStop: 100,
    bid: 120,
    ask: 120.1,
    point: 0.01,
    stopsLevelTicks: 0,
    freezeLevelTicks: 0,
    digits: 2,
  });
  assert.deepEqual(decision, { action: "HOLD", reason: "PARTIAL_REQUIRED" });
}

{
  const decision = planM5StructuralTrailingStop({
    active: true,
    side: "BUY",
    bars: BUY_HL_BARS,
    afterTimestamp: 50,
    atOrBefore: 600,
    currentStop: 100,
    lastStructuralStop: 100,
    bid: 120,
    ask: 120.1,
    point: 0.01,
    stopsLevelTicks: 0,
    freezeLevelTicks: 0,
    digits: 2,
  });
  assert.equal(decision.action, "TIGHTEN");
  assert.equal(decision.stopLoss, 104, "Project structural buffer must remain exactly 1.0 price unit outside the M5 swing");
  assert.equal(decision.structure.kind, "HIGHER_LOW");
}

{
  const decision = planM5StructuralTrailingStop({
    active: true,
    side: "SELL",
    bars: SELL_LH_BARS,
    afterTimestamp: 50,
    atOrBefore: 600,
    currentStop: 122,
    lastStructuralStop: 122,
    bid: 100,
    ask: 100.1,
    point: 0.01,
    stopsLevelTicks: 0,
    freezeLevelTicks: 0,
    digits: 2,
  });
  assert.equal(decision.action, "TIGHTEN");
  assert.equal(decision.stopLoss, 116);
  assert.equal(decision.structure.kind, "LOWER_HIGH");
}

{
  const decision = planM5StructuralTrailingStop({
    active: true,
    side: "BUY",
    bars: BUY_HL_BARS,
    afterTimestamp: 50,
    atOrBefore: 600,
    currentStop: 106,
    lastStructuralStop: 106,
    bid: 120,
    ask: 120.1,
    point: 0.01,
    stopsLevelTicks: 0,
    freezeLevelTicks: 0,
    digits: 2,
  });
  assert.equal(decision.action, "HOLD");
  assert.equal(decision.reason, "NOT_TIGHTER");
}

{
  const decision = planM5StructuralTrailingStop({
    active: true,
    side: "BUY",
    bars: BUY_HL_BARS,
    afterTimestamp: 50,
    atOrBefore: 600,
    currentStop: 100,
    lastStructuralStop: 100,
    bid: 104.05,
    ask: 104.15,
    point: 0.01,
    stopsLevelTicks: 10,
    freezeLevelTicks: 5,
    digits: 2,
  });
  assert.equal(decision.action, "HOLD");
  assert.equal(decision.reason, "BROKER_GAP_BLOCK");
}

const rawTrendSource = fs.readFileSync(new URL("./run-phase7b-demo-controller.ts", import.meta.url), "utf8");
const rawSidewaySource = fs.readFileSync(new URL("./run-phase7c-sideway-controller.mjs", import.meta.url), "utf8");
const trendCanonicalSource = transformPhase7CTrendCanonicalDailyRecoverySource(rawTrendSource);
const sidewayCanonicalSource = transformPhase7CSidewayCanonicalDailyRecoverySource(rawSidewaySource);
const trendRuntimeSource = transformPhase7CTrendM5StructuralTrailingSource(trendCanonicalSource);
const sidewayRuntimeSource = transformPhase7CSidewayM5StructuralTrailingSource(sidewayCanonicalSource);

assert.match(trendRuntimeSource, /managePosition\(managedPosition, quote, spec, m15, m5\)/, "Trend management must receive M5 candles after source adaptation");
assert.match(trendRuntimeSource, /M5_CONFIRMED_HIGHER_LOW_LOWER_HIGH_PLUS_1_BUFFER_ONLY_TIGHTEN/, "Trend runtime contract must advertise M5 structural trailing");
assert.doesNotMatch(trendRuntimeSource, /PHASE7B_DEMO_RUNNER_SL=M15_CONFIRMED_STRUCTURE_TRAILING/, "Trend transformed runtime must not advertise M15 runner trailing");
assert.match(trendRuntimeSource, /planM5StructuralTrailingStop\(\{/, "Trend transformed runtime must execute the shared M5 planner");
assert.match(trendRuntimeSource, /afterTimestamp: Number\(managed\.partialActivatedAt \?\? 0\)/, "Trend must ignore M5 structure formed before partial activation");
assert.ok(
  trendRuntimeSource.indexOf('managed.dailyMode === "RECOVERY_TP"') < trendRuntimeSource.indexOf("planM5StructuralTrailingStop({"),
  "Trend Recovery TP guard must remain before native M5 trailing",
);

assert.match(sidewayRuntimeSource, /M5_CONFIRMED_HIGHER_LOW_LOWER_HIGH_PLUS_1_BUFFER_ONLY_TIGHTEN/, "Sideway runtime contract must advertise M5 structural trailing");
assert.doesNotMatch(sidewayRuntimeSource, /PLUS6_BREAK_EVEN_PLUS10_ONE_THIRD_NO_TRAILING/, "Sideway transformed runtime must not advertise NO_TRAILING");
assert.match(sidewayRuntimeSource, /partialActivatedAt: null/, "Sideway managed state must persist M5 trailing activation");
assert.match(sidewayRuntimeSource, /lastStructuralStop:/, "Sideway managed state must persist monotonic trailing baseline");
assert.match(sidewayRuntimeSource, /structureAttempt: 0/, "Sideway managed state must persist trailing attempts");
assert.match(sidewayRuntimeSource, /timeframe=M5&count=\$\{m5CandleCount\}/, "Sideway management must fetch M5 candles only for trailing");
assert.match(sidewayRuntimeSource, /planM5StructuralTrailingStop\(\{/, "Sideway transformed runtime must execute the shared M5 planner");
assert.match(sidewayRuntimeSource, /afterTimestamp: Number\(managed\.partialActivatedAt \?\? 0\)/, "Sideway must ignore M5 structure formed before partial activation");
assert.ok(
  sidewayRuntimeSource.indexOf('managed.dailyMode === "RECOVERY_TP"') < sidewayRuntimeSource.indexOf("planM5StructuralTrailingStop({"),
  "Sideway Recovery TP guard must remain before native M5 trailing",
);

const liveTrendRuntimeSource = transformPhase7CTrendM5StructuralTrailingSource(
  transformPhase7CTrendCanonicalDailyRecoverySource(
    transformPhase7CTrendLegacySource(rawTrendSource),
  ),
);
const liveSidewayRuntimeSource = transformPhase7CSidewayM5StructuralTrailingSource(
  transformPhase7CSidewayCanonicalDailyRecoverySource(
    transformPhase7CSidewaySource(rawSidewaySource),
  ),
);
assert.match(liveTrendRuntimeSource, /fetchPhase7CCanonicalDailyRecoveryPlan/, "LIVE Trend must preserve canonical Daily Recovery planning after M5 adaptation");
assert.match(liveTrendRuntimeSource, /registerPhase7CCanonicalDailyRecoverySubmission/, "LIVE Trend must preserve canonical Daily Recovery final SEND gate after M5 adaptation");
assert.match(liveTrendRuntimeSource, /M5_CONFIRMED_HIGHER_LOW_LOWER_HIGH_PLUS_1_BUFFER_ONLY_TIGHTEN/, "LIVE Trend must compose M5 structural trailing after LIVE + canonical adapters");
assert.match(liveSidewayRuntimeSource, /fetchPhase7CCanonicalDailyRecoveryPlan/, "LIVE Sideway must preserve canonical Daily Recovery planning after M5 adaptation");
assert.match(liveSidewayRuntimeSource, /registerPhase7CCanonicalDailyRecoverySubmission/, "LIVE Sideway must preserve canonical Daily Recovery final SEND gate after M5 adaptation");
assert.match(liveSidewayRuntimeSource, /M5_CONFIRMED_HIGHER_LOW_LOWER_HIGH_PLUS_1_BUFFER_ONLY_TIGHTEN/, "LIVE Sideway must compose M5 structural trailing after LIVE + canonical adapters");

assert.throws(
  () => transformPhase7CTrendM5StructuralTrailingSource("console.log('unrelated trend source');"),
  /marker no longer matches/,
  "Trend source adaptation must fail closed when expected management markers drift",
);
assert.throws(
  () => transformPhase7CSidewayM5StructuralTrailingSource("console.log('unrelated sideway source');"),
  /marker no longer matches/,
  "Sideway source adaptation must fail closed when expected management markers drift",
);

const trendAccountWrapper = fs.readFileSync(new URL("./run-phase7c-trend-account-mode.mjs", import.meta.url), "utf8");
const sidewayAccountWrapper = fs.readFileSync(new URL("./run-phase7c-sideway-account-mode.mjs", import.meta.url), "utf8");
assert.match(trendAccountWrapper, /transformPhase7CTrendM5StructuralTrailingSource/, "Trend account runtime must apply the M5 structural trailing adapter");
assert.match(sidewayAccountWrapper, /transformPhase7CSidewayM5StructuralTrailingSource/, "Sideway account runtime must apply the M5 structural trailing adapter");

console.log("PHASE7C_M5_STRUCTURAL_TRAILING_STOP_CONTRACT=PASS");
console.log("PHASE7C_M5_STRUCTURAL_TRAILING_ACTIVATION=POST_PLUS10_PARTIAL_ONLY");
console.log("PHASE7C_M5_STRUCTURAL_TRAILING_BUY=CONFIRMED_HIGHER_LOW_MINUS_1");
console.log("PHASE7C_M5_STRUCTURAL_TRAILING_SELL=CONFIRMED_LOWER_HIGH_PLUS_1");
console.log("PHASE7C_M5_STRUCTURAL_TRAILING_MONOTONIC=PASS");
console.log("PHASE7C_M5_STRUCTURAL_TRAILING_INTRABAR=FORBIDDEN");
console.log("PHASE7C_M5_STRUCTURAL_TRAILING_RECOVERY_TP=UNCHANGED");
console.log("PHASE7C_M5_STRUCTURAL_TRAILING_LIVE_COMPOSITION=PASS");
