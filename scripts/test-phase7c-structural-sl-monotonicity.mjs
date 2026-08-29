import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { oneThirdPartialVolume } from "./phase7c-sideway-logic.mjs";
import {
  stopIsAtLeastAsTight,
  stopStrictlyTightens,
  tightestKnownStop,
} from "./phase7c-stop-monotonicity.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const trendSource = fs.readFileSync(path.join(here, "run-phase7b-demo-controller.ts"), "utf8");
const sidewaySource = fs.readFileSync(path.join(here, "run-phase7c-sideway-controller.mjs"), "utf8");

// Canonical SL monotonicity: BUY SL may only increase; SELL SL may only decrease.
assert.equal(stopStrictlyTightens("BUY", 2300, 2301), true);
assert.equal(stopStrictlyTightens("BUY", 2300, 2299), false);
assert.equal(stopStrictlyTightens("BUY", 2300, 2300), false);
assert.equal(stopStrictlyTightens("SELL", 2300, 2299), true);
assert.equal(stopStrictlyTightens("SELL", 2300, 2301), false);
assert.equal(stopStrictlyTightens("SELL", 2300, 2300), false);
assert.equal(stopStrictlyTightens("BUY", 2300, 2300 + 1e-10), false);
assert.equal(stopStrictlyTightens("SELL", 2300, 2300 - 1e-10), false);
assert.equal(stopStrictlyTightens("HOLD", 2300, 2301), false);

// A missing/zero broker SL may be tightened to a valid positive candidate.
assert.equal(stopStrictlyTightens("BUY", 0, 2299), true);
assert.equal(stopStrictlyTightens("SELL", 0, 2301), true);

// Durable monotonic floor: a transient broker SL=0 must not erase the last tighter stop we persisted.
assert.equal(tightestKnownStop("BUY", 0, 2305), 2305);
assert.equal(tightestKnownStop("BUY", 2307, 2305), 2307);
assert.equal(tightestKnownStop("BUY", 2303, 2305), 2305);
assert.equal(tightestKnownStop("SELL", 0, 2295), 2295);
assert.equal(tightestKnownStop("SELL", 2293, 2295), 2293);
assert.equal(tightestKnownStop("SELL", 2297, 2295), 2295);
assert.equal(stopStrictlyTightens("BUY", tightestKnownStop("BUY", 0, 2305), 2303), false);
assert.equal(stopStrictlyTightens("BUY", tightestKnownStop("BUY", 0, 2305), 2306), true);
assert.equal(stopStrictlyTightens("SELL", tightestKnownStop("SELL", 0, 2295), 2297), false);
assert.equal(stopStrictlyTightens("SELL", tightestKnownStop("SELL", 0, 2295), 2294), true);

// +6 BE is already satisfied when the broker SL is equal to or tighter than entry.
assert.equal(stopIsAtLeastAsTight("BUY", 2301, 2300), true);
assert.equal(stopIsAtLeastAsTight("BUY", 2300, 2300), true);
assert.equal(stopIsAtLeastAsTight("BUY", 2299, 2300), false);
assert.equal(stopIsAtLeastAsTight("SELL", 2299, 2300), true);
assert.equal(stopIsAtLeastAsTight("SELL", 2300, 2300), true);
assert.equal(stopIsAtLeastAsTight("SELL", 2301, 2300), false);
assert.equal(stopIsAtLeastAsTight("HOLD", 2301, 2300), false);

// Sideway +10 must close exactly one third of INITIAL volume, never a rounded approximation.
assert.equal(oneThirdPartialVolume(0.09, 0.09, 0.01, 0.01), 0.03);
assert.equal(oneThirdPartialVolume(0.12, 0.12, 0.01, 0.01), 0.04);
assert.equal(
  oneThirdPartialVolume(0.10, 0.10, 0.01, 0.01),
  0,
  "Sideway partial must fail closed when exactly one-third cannot be represented by broker volumeStep.",
);

// Wiring contract: both +6 paths must recognize an already-tighter broker SL before PATCHing BE.
assert.match(
  trendSource,
  /stopIsAtLeastAsTight\(managed\.side,\s*Number\(position\.stopLoss\),\s*beStop\)/,
  "RED_TARGET: Trend +6 BE must not loosen an already-tighter broker SL.",
);
assert.match(
  sidewaySource,
  /stopIsAtLeastAsTight\(managed\.side,\s*Number\(position\.stopLoss\),\s*beStop\)/,
  "RED_TARGET: Sideway +6 BE must not loosen an already-tighter broker SL.",
);

// Trend structural trailing must compare against the tightest broker/durable stop, not broker SL alone.
assert.match(
  trendSource,
  /tightestKnownStop\(\s*managed\.side,\s*Number\(position\.stopLoss\),\s*Number\(managed\.lastStructuralStop\)\s*\)/,
  "RED_TARGET: Trend trailing must preserve durable lastStructuralStop when broker SL is missing or looser.",
);
assert.match(
  trendSource,
  /stopStrictlyTightens\(managed\.side,\s*structuralBaseline,\s*candidate\)/,
  "RED_TARGET: Trend trailing candidate must strictly tighten the durable structural baseline.",
);

console.log("STRUCTURAL_SL_MONOTONICITY_CONTRACT=PASS");
console.log("BUY_SL_ONLY_INCREASES=PASS");
console.log("SELL_SL_ONLY_DECREASES=PASS");
console.log("DURABLE_STRUCTURAL_SL_FLOOR=PASS");
console.log("SIDEWAY_PLUS6_BE_MONOTONIC=PASS");
console.log("SIDEWAY_PLUS10_EXACT_ONE_THIRD=PASS");
console.log("TREND_STRUCTURAL_TRAILING_ONLY_TIGHTENS=PASS");
