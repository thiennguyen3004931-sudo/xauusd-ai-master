import assert from "node:assert/strict";
import test from "node:test";
import {
  combinePhase7CRuntimeSourceVerdicts,
  evaluatePhase7CRuntimeSourceComponent,
  type Phase7CRuntimeSourceComponentEvaluationInput,
  type Phase7CRuntimeSourceDeploymentManifest,
} from "./phase7c-runtime-source-attestation.service";

const deployment: Phase7CRuntimeSourceDeploymentManifest = {
  version: 1,
  deploymentId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  sourceCommit: "1111111111111111111111111111111111111111",
  sourceTree: "2222222222222222222222222222222222222222",
  branch: "main",
  worktreeClean: true,
  createdAt: 1_788_500_000_000,
  configFingerprint: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
};

function previousDeploymentInput(): Phase7CRuntimeSourceComponentEvaluationInput {
  return {
    component: "trend",
    deployment,
    attestation: {
      version: 1,
      component: "trend",
      deploymentId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      sourceCommit: "4444444444444444444444444444444444444444",
      sourceTree: "5555555555555555555555555555555555555555",
      pid: 42004,
      startedAt: deployment.createdAt - 10_000,
      launcherSha256: "sha256:6666666666666666666666666666666666666666666666666666666666666666",
      configFingerprint: deployment.configFingerprint,
    },
    currentPid: null,
    currentPidAlive: null,
    attestedPidAlive: false,
    expectedLauncherSha256: "sha256:6666666666666666666666666666666666666666666666666666666666666666",
    evidenceErrors: [],
  };
}

test("dead previous-deployment attestation is stale, not an active mismatch", () => {
  const result = evaluatePhase7CRuntimeSourceComponent(previousDeploymentInput());

  assert.equal(result.verdict, "STALE");
  assert.equal(result.alive, false);
  assert.ok(result.reasonCodes.includes("ATTESTED_PID_DEAD"));
});

test("a live current process with previous-deployment attestation remains mismatch", () => {
  const input = previousDeploymentInput();
  input.currentPid = input.attestation!.pid;
  input.currentPidAlive = true;
  input.attestedPidAlive = true;

  const result = evaluatePhase7CRuntimeSourceComponent(input);

  assert.equal(result.verdict, "MISMATCH");
  assert.ok(result.reasonCodes.includes("SOURCE_COMMIT_MISMATCH"));
  assert.ok(result.reasonCodes.includes("SOURCE_TREE_MISMATCH"));
  assert.ok(result.reasonCodes.includes("DEPLOYMENT_ID_MISMATCH"));
});

test("strict whole-runtime precedence is unchanged", () => {
  assert.equal(
    combinePhase7CRuntimeSourceVerdicts(["EXACT_MATCH", "STALE"]),
    "STALE",
  );
  assert.equal(
    combinePhase7CRuntimeSourceVerdicts(["EXACT_MATCH", "STALE", "MISMATCH"]),
    "MISMATCH",
  );
});
