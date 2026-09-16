import test from "node:test";
import assert from "node:assert/strict";
import { assertPublicBoundary } from "./check-public-boundary.mjs";

test("public boundary rejects any private-required tracked path", () => {
  assert.throws(
    () => assertPublicBoundary([
      "package.json",
      "packages/copy-protocol/src/index.ts",
      "apps/api/src/index.ts",
    ]),
    /PRIVATE_REQUIRED_PRESENT:apps\/api\/src\/index\.ts/,
  );
});

test("public boundary accepts only allowlisted public paths", () => {
  const report = assertPublicBoundary([
    "package.json",
    "packages/copy-protocol/src/index.ts",
    "packages/license-service/src/index.ts",
    "packages/installation-proof/src/index.ts",
  ]);

  assert.equal(report.PRIVATE_REQUIRED.length, 0);
  assert.equal(report.SAFE_PUBLIC.length, 4);
});
