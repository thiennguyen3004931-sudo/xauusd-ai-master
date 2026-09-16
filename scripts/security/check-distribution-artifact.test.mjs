import test from "node:test";
import assert from "node:assert/strict";
import { inspectTextArtifact } from "./check-distribution-artifact.mjs";
import {
  assertPublicAcceptance,
  evaluatePublicAcceptance,
} from "./accept-public-private-split.mjs";

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

test("M7 public acceptance fails closed when private source remains", () => {
  const verdicts = evaluatePublicAcceptance({
    buildPassed: true,
    privateSourcePaths: ["apps/api/src/index.ts"],
    privateImports: [],
    ciPrivateRepoReferences: [],
    distributionArtifactPrivateRef: false,
    p3Canonical: true,
    p3DuplicateImplementation: false,
  });

  assert.equal(verdicts.PRIVATE_SOURCE_PRESENT, "TRUE");
  assert.throws(
    () => assertPublicAcceptance(verdicts),
    /M7_PUBLIC_ACCEPTANCE_FAILED:PRIVATE_SOURCE_PRESENT=TRUE/,
  );
});

test("M7 public acceptance rejects private CI dependency and duplicate P3", () => {
  const verdicts = evaluatePublicAcceptance({
    buildPassed: true,
    privateSourcePaths: [],
    privateImports: [],
    ciPrivateRepoReferences: ["xauusd-ai-master-core"],
    distributionArtifactPrivateRef: false,
    p3Canonical: true,
    p3DuplicateImplementation: true,
  });

  assert.equal(verdicts.PUBLIC_CI_NEEDS_PRIVATE_REPO, "TRUE");
  assert.equal(verdicts.P3_DUPLICATE_IMPLEMENTATION, "TRUE");
  assert.throws(() => assertPublicAcceptance(verdicts), /M7_PUBLIC_ACCEPTANCE_FAILED/);
});

test("M7 public acceptance emits the exact required GREEN verdicts", () => {
  const verdicts = evaluatePublicAcceptance({
    buildPassed: true,
    privateSourcePaths: [],
    privateImports: [],
    ciPrivateRepoReferences: [],
    distributionArtifactPrivateRef: false,
    p3Canonical: true,
    p3DuplicateImplementation: false,
  });

  assert.deepEqual(verdicts, {
    PUBLIC_BUILD: "PASS",
    PRIVATE_SOURCE_PRESENT: "FALSE",
    PRIVATE_IMPORT_PRESENT: "FALSE",
    PUBLIC_CI_NEEDS_PRIVATE_REPO: "FALSE",
    DISTRIBUTION_ARTIFACT_PRIVATE_REF: "FALSE",
    P3_CANONICAL: "INSTALLATION_PROOF",
    P3_DUPLICATE_IMPLEMENTATION: "FALSE",
  });
  assert.doesNotThrow(() => assertPublicAcceptance(verdicts));
});
