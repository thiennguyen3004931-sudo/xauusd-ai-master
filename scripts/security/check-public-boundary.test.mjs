import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePublicBoundary } from "./check-public-boundary.mjs";

test("public boundary accepts only explicitly safe public paths", () => {
  const report = evaluatePublicBoundary([
    "packages/copy-protocol/src/index.ts",
    "packages/license-service/src/index.ts",
    "packages/installation-proof/src/challenge.ts",
    "README.md",
  ]);

  assert.equal(report.PRIVATE_REQUIRED.length, 0);
  assert.equal(report.SAFE_PUBLIC.length, 4);
});

test("public boundary fails closed when any private-required path remains", () => {
  assert.throws(
    () =>
      evaluatePublicBoundary([
        "packages/copy-protocol/src/index.ts",
        "packages/strategy-engine/src/index.ts",
      ]),
    /PRIVATE_REQUIRED_PRESENT:packages\/strategy-engine\/src\/index\.ts/,
  );
});
