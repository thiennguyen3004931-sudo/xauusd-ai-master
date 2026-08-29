import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { oneThirdPartialVolume } from "./phase7c-sideway-logic.mjs";
import {
  stopIsAtLeastAsTight,
  stopStrictlyTightens,
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

// Trend structural trailing must compare the rounded broker-facing candidate against current broker SL.
assert.match(
  trendSource,
  /stopStrictlyTightens\(managed\.side,\s*Number\(position\.stopLoss\),\s*candidate\)/,
  "RED_TARGET: Trend structural trailing must only PATCH a rounded candidate that strictly tightens broker SL.",
);

console.log("STRUCTURAL_SL_MONOTONICITY_CONTRACT=PASS");
console.log("BUY_SL_ONLY_INCREASES=PASS");
console.log("SELL_SL_ONLY_DECREASES=PASS");
console.log("SIDEWAY_PLUS6_BE_MONOTONIC=PASS");
console.log("SIDEWAY_PLUS10_EXACT_ONE_THIRD=PASS");
console.log("TREND_STRUCTURAL_TRAILING_ONLY_TIGHTENS=PASS");
