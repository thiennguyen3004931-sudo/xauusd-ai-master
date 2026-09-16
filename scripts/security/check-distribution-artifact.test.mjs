import test from "node:test";
import assert from "node:assert/strict";
import { inspectTextArtifact } from "./check-distribution-artifact.mjs";

test("private module reference is rejected", () => {
  assert.throws(
    () => inspectTextArtifact('import "@xauusd/strategy-engine"'),
    /FORBIDDEN_PRIVATE_REFERENCE/,
  );
});

test("private source path is rejected", () => {
  assert.throws(
    () => inspectTextArtifact('{"sources":["../../apps/api/src/index.ts"]}'),
    /FORBIDDEN_PRIVATE_PATH/,
  );
});

test("private key material is rejected", () => {
  assert.throws(
    () => inspectTextArtifact("-----BEGIN PRIVATE KEY-----"),
    /FORBIDDEN_SECRET_MATERIAL/,
  );
});

test("public protocol artifact is accepted", () => {
  assert.doesNotThrow(() =>
    inspectTextArtifact('export { canonicalizeCommand } from "@xauusd/copy-protocol";'),
  );
});
