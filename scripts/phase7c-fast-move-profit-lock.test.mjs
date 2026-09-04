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
  givebackDistance: 10,
});
assert.equal(trendBuy.active, true);
assert.equal(trendBuy.peakPrice, 4315);
assert.equal(trendBuy.peakFavorable, 15);
assert.equal(trendBuy.candidateStop, 4305);

const trendSell = fastMoveProfitLockCandidate({
  side: "SELL",
  entry: 4300,
  marketPrice: 4285,
  previousPeakPrice: 4288,
  activationDistance: 10,
  givebackDistance: 10,
});
assert.equal(trendSell.active, true);
assert.equal(trendSell.peakPrice, 4285);
assert.equal(trendSell.peakFavorable, 15);
assert.equal(trendSell.candidateStop, 4295);

const belowActivation = fastMoveProfitLockCandidate({
  side: "BUY",
  entry: 4300,
  marketPrice: 4309.99,
  previousPeakPrice: 4309.99,
  activationDistance: 10,
  givebackDistance: 10,
});
assert.equal(belowActivation.active, false);
assert.equal(belowActivation.reason, "BELOW_ACTIVATION");
assert.equal(belowActivation.candidateStop, 0);

const exactlyAtActivation = fastMoveProfitLockCandidate({
  side: "BUY",
  entry: 4300,
  marketPrice: 4310,
  previousPeakPrice: 4310,
  activationDistance: 10,
  givebackDistance: 10,
});
assert.equal(exactlyAtActivation.active, false);
assert.equal(exactlyAtActivation.reason, "CANDIDATE_NOT_PROFIT_LOCK");
assert.equal(exactlyAtActivation.peakPrice, 4310);
assert.equal(exactlyAtActivation.candidateStop, 0);

const pullbackAfterPeak = fastMoveProfitLockCandidate({
  side: "BUY",
  entry: 4300,
  marketPrice: 4308,
  previousPeakPrice: 4315,
  activationDistance: 10,
  givebackDistance: 10,
});
assert.equal(pullbackAfterPeak.active, true);
assert.equal(pullbackAfterPeak.peakPrice, 4315);
assert.equal(pullbackAfterPeak.candidateStop, 4305);

const sidewaySamePeak = fastMoveProfitLockCandidate({
  side: "BUY",
  entry: 4300,
  marketPrice: 4315,
  previousPeakPrice: 4315,
  activationDistance: 10,
  givebackDistance: 10,
});
assert.equal(sidewaySamePeak.active, true);
assert.equal(sidewaySamePeak.candidateStop, 4305);

const invalidSide = fastMoveProfitLockCandidate({
  side: "HOLD",
  entry: 4300,
  marketPrice: 4315,
  previousPeakPrice: 4315,
  activationDistance: 10,
  givebackDistance: 10,
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
  stopStrictlyTightens("BUY", tightestKnownStop("BUY", 4300, 4305), 4304),
  false,
  "Structure or any later stop source must never loosen a tighter pre-structure BUY floor.",
);
assert.equal(
  stopStrictlyTightens("SELL", tightestKnownStop("SELL", 4300, 4295), 4296),
  false,
  "Structure or any later stop source must never loosen a tighter pre-structure SELL floor.",
);

assert.match(trendSource, /FAST_MOVE_PROFIT_LOCK_ACTIVATION_PRICE\s*=\s*10/);
assert.match(trendSource, /FAST_MOVE_PROFIT_LOCK_GIVEBACK_PRICE\s*=\s*10/);
assert.match(trendSource, /FAST_MOVE_PROFIT_LOCK_TIGHTEN/);
assert.match(
  trendSource,
  /const fastMoveEligible = stopIsAtLeastAsTight\(\s*managed\.side,\s*Number\(position\.stopLoss\),\s*Number\(position\.entry\),\s*\);[\s\S]*?if \(fastMove\.active && fastMoveEligible\)/,
  "Pre-structure Trend lock must only tighten after the broker stop is already at BE or better.",
);
assert.match(
  trendSource,
  /const fastMoveStructure = managed\.partialApplied && latestM15[\s\S]*?latestConfirmedStructureStop\([\s\S]*?if \(fastMoveStructure === null\) \{[\s\S]*?fastMoveProfitLockCandidate/,
  "Trend Fast-Move must hand off once a confirmed post-entry structure exists.",
);
assert.match(sidewaySource, /FAST_MOVE_PROFIT_LOCK_ACTIVATION_PRICE\s*=\s*10/);
assert.match(sidewaySource, /FAST_MOVE_PROFIT_LOCK_GIVEBACK_PRICE\s*=\s*10/);
assert.match(sidewaySource, /FAST_MOVE_PROFIT_LOCK_TIGHTEN/);
assert.match(
  sidewaySource,
  /const fastMoveEligible = stopIsAtLeastAsTight\(\s*managed\.side,\s*Number\(position\.stopLoss\),\s*Number\(managed\.entry\),\s*\);[\s\S]*?if \(fastMove\.active && fastMoveEligible\)/,
  "Pre-structure Sideway lock must only tighten after the broker stop is already at BE or better.",
);

console.log("M5_PRE_STRUCTURE_PROFIT_LOCK_CONTRACT=PASS");
console.log("M5_PRE_STRUCTURE_BUY_SELL_SYMMETRY=PASS");
console.log("M5_PRE_STRUCTURE_PEAK_PERSISTS_THROUGH_PULLBACK=PASS");
console.log("M5_PRE_STRUCTURE_GIVEBACK_10_BOTH_STRATEGIES=PASS");
console.log("M5_PRE_STRUCTURE_REQUIRES_BE_OR_BETTER=PASS");
console.log("M5_PRE_STRUCTURE_HANDOFF=PASS");
console.log("M5_PRE_STRUCTURE_NEVER_LOOSENS_STOP=PASS");
