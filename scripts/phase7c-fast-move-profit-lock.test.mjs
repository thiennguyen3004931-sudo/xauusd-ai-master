import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fastMoveProfitLockCandidate } from "./phase7c-fast-move-profit-lock.mjs";
import {
  stopStrictlyTightens,
  tightestKnownStop,
} from "./phase7c-stop-monotonicity.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const trendSource = fs.readFileSync(path.join(here, "run-phase7b-demo-controller.ts"), "utf8");
const sidewaySource = fs.readFileSync(path.join(here, "run-phase7c-sideway-controller.mjs"), "utf8");

const trendBuy = fastMoveProfitLockCandidate({
  side: "BUY",
  entry: 4300,
  marketPrice: 4315,
  previousPeakPrice: 4312,
  activationDistance: 10,
  givebackDistance: 6,
});
assert.equal(trendBuy.active, true);
assert.equal(trendBuy.peakPrice, 4315);
assert.equal(trendBuy.peakFavorable, 15);
assert.equal(trendBuy.candidateStop, 4309);

const trendSell = fastMoveProfitLockCandidate({
  side: "SELL",
  entry: 4300,
  marketPrice: 4285,
  previousPeakPrice: 4288,
  activationDistance: 10,
  givebackDistance: 6,
});
assert.equal(trendSell.active, true);
assert.equal(trendSell.peakPrice, 4285);
assert.equal(trendSell.peakFavorable, 15);
assert.equal(trendSell.candidateStop, 4291);

const belowActivation = fastMoveProfitLockCandidate({
  side: "BUY",
  entry: 4300,
  marketPrice: 4309.99,
  previousPeakPrice: 4309.99,
  activationDistance: 10,
  givebackDistance: 6,
});
assert.equal(belowActivation.active, false);
assert.equal(belowActivation.reason, "BELOW_ACTIVATION");
assert.equal(belowActivation.candidateStop, 0);

const pullbackAfterPeak = fastMoveProfitLockCandidate({
  side: "BUY",
  entry: 4300,
  marketPrice: 4308,
  previousPeakPrice: 4315,
  activationDistance: 10,
  givebackDistance: 6,
});
assert.equal(pullbackAfterPeak.active, true);
assert.equal(pullbackAfterPeak.peakPrice, 4315);
assert.equal(pullbackAfterPeak.candidateStop, 4309);

const trendSamePeak = fastMoveProfitLockCandidate({
  side: "BUY",
  entry: 4300,
  marketPrice: 4315,
  previousPeakPrice: 4315,
  activationDistance: 10,
  givebackDistance: 6,
});
const sidewaySamePeak = fastMoveProfitLockCandidate({
  side: "BUY",
  entry: 4300,
  marketPrice: 4315,
  previousPeakPrice: 4315,
  activationDistance: 10,
  givebackDistance: 4,
});
assert.equal(trendSamePeak.candidateStop, 4309);
assert.equal(sidewaySamePeak.candidateStop, 4311);
assert.equal(sidewaySamePeak.candidateStop > trendSamePeak.candidateStop, true);

const invalidSide = fastMoveProfitLockCandidate({
  side: "HOLD",
  entry: 4300,
  marketPrice: 4315,
  previousPeakPrice: 4315,
  activationDistance: 10,
  givebackDistance: 6,
});
assert.equal(invalidSide.active, false);
assert.equal(invalidSide.reason, "INVALID_INPUT");

const invalidConfig = fastMoveProfitLockCandidate({
  side: "BUY",
  entry: 4300,
  marketPrice: 4315,
  previousPeakPrice: 4315,
  activationDistance: 4,
  givebackDistance: 6,
});
assert.equal(invalidConfig.active, false);
assert.equal(invalidConfig.reason, "INVALID_INPUT");

assert.equal(
  stopStrictlyTightens("BUY", tightestKnownStop("BUY", 4300, 4309), 4308),
  false,
  "Structure or any later stop source must never loosen a tighter Fast-Move BUY floor.",
);
assert.equal(
  stopStrictlyTightens("SELL", tightestKnownStop("SELL", 4300, 4291), 4292),
  false,
  "Structure or any later stop source must never loosen a tighter Fast-Move SELL floor.",
);

assert.match(trendSource, /FAST_MOVE_PROFIT_LOCK_ACTIVATION_PRICE\s*=\s*10/);
assert.match(trendSource, /FAST_MOVE_PROFIT_LOCK_GIVEBACK_PRICE\s*=\s*6/);
assert.match(trendSource, /FAST_MOVE_PROFIT_LOCK_TIGHTEN/);
assert.match(
  trendSource,
  /const fastMoveStructure = managed\.partialApplied && latestM15[\s\S]*?latestConfirmedStructureStop\([\s\S]*?if \(fastMoveStructure === null\) \{[\s\S]*?fastMoveProfitLockCandidate/,
  "RED_TARGET: Trend Fast-Move must hand off once a confirmed post-entry structure exists.",
);
assert.match(sidewaySource, /FAST_MOVE_PROFIT_LOCK_ACTIVATION_PRICE\s*=\s*10/);
assert.match(sidewaySource, /FAST_MOVE_PROFIT_LOCK_GIVEBACK_PRICE\s*=\s*4/);
assert.match(sidewaySource, /FAST_MOVE_PROFIT_LOCK_TIGHTEN/);

console.log("FAST_MOVE_PROFIT_LOCK_CONTRACT=PASS");
console.log("FAST_MOVE_BUY_SELL_SYMMETRY=PASS");
console.log("FAST_MOVE_PEAK_PERSISTS_THROUGH_PULLBACK=PASS");
console.log("FAST_MOVE_TREND_GIVEBACK_6=PASS");
console.log("FAST_MOVE_SIDEWAY_GIVEBACK_4=PASS");
console.log("FAST_MOVE_TREND_STRUCTURE_HANDOFF=PASS");
console.log("FAST_MOVE_NEVER_LOOSENS_STOP=PASS");
