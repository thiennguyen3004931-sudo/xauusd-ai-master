import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePhase7CRuntimeSourceComponent,
  fingerprintPhase7CRuntimeSourceConfig,
  type Phase7CRuntimeSourceComponentEvaluationInput,
  type Phase7CRuntimeSourceDeploymentManifest,
} from "./phase7c-runtime-source-attestation.service";

const deployment: Phase7CRuntimeSourceDeploymentManifest = {
  version: 1,
  deploymentId: "0123456789abcdef0123456789abcdef",
  sourceCommit: "4f156ef1b019ef676cc23ed978c9487eb41f2fe6",
  sourceTree: "0ab41605d0ccdf0b17210826081ce4bd9e3a5620",
  branch: "main",
  worktreeClean: true,
  createdAt: 1_788_475_565_000,
  configFingerprint: fingerprintPhase7CRuntimeSourceConfig({
    version: 1,
    accountMode: "LIVE",
    liveExecutionEnabled: true,
    runtimeRoot: "F:\\Project\\XAUUSD_AI_MASTER\\xauusd-ai-master\\.runtime",
    controlApiUrl: "http://127.0.0.1:3711",
  }),
};

function stalePreviousDeploymentInput(): Phase7CRuntimeSourceComponentEvaluationInput {
  return {
    component: "regime-notifier",
    deployment,
    attestation: {
      version: 1,
      component: "regime-notifier",
      deploymentId: "f374073bbf1941abaae450d17fb238b0",
      sourceCommit: "5b02788b67439e2ab28c1ce8f787d73afb2854fe",
      sourceTree: "40fb6ae22879ea3a796acb3e6d4f341ebca66833",
      pid: 38044,
      startedAt: 1_788_660_940_029,
      launcherSha256: "sha256:d2e0624f70dea0aa9c68cdc0998d3aef5b258d17f61cc304fa8e7e7237dd873b",
      configFingerprint: deployment.configFingerprint,
    },
    currentPid: null,
    currentPidAlive: null,
    attestedPidAlive: true,
    expectedLauncherSha256: "sha256:d2e0624f70dea0aa9c68cdc0998d3aef5b258d17f61cc304fa8e7e7237dd873b",
    evidenceErrors: ["CURRENT_PID_MISSING"],
  };
}

test("reused attested pid is stale/dead when live OS pid is not the attested component", () => {
  const input = stalePreviousDeploymentInput() as Phase7CRuntimeSourceComponentEvaluationInput & {
    currentPidIdentityMatches?: boolean | null;
    attestedPidIdentityMatches?: boolean | null;
  };
  input.attestedPidIdentityMatches = false;

  const result = evaluatePhase7CRuntimeSourceComponent(input);

  assert.equal(result.verdict, "STALE");
  assert.equal(result.alive, false);
  assert.ok(result.reasonCodes.includes("ATTESTED_PID_IDENTITY_MISMATCH"));
});

test("real previous-deployment orphan remains live mismatch when process identity matches", () => {
  const input = stalePreviousDeploymentInput() as Phase7CRuntimeSourceComponentEvaluationInput & {
    currentPidIdentityMatches?: boolean | null;
    attestedPidIdentityMatches?: boolean | null;
  };
  input.attestedPidIdentityMatches = true;

  const result = evaluatePhase7CRuntimeSourceComponent(input);

  assert.equal(result.verdict, "MISMATCH");
  assert.equal(result.alive, true);
  assert.ok(result.reasonCodes.includes("SOURCE_COMMIT_MISMATCH"));
  assert.ok(result.reasonCodes.includes("SOURCE_TREE_MISMATCH"));
  assert.ok(result.reasonCodes.includes("DEPLOYMENT_ID_MISMATCH"));
});
