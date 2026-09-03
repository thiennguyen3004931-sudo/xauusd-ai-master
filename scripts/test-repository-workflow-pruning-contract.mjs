import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const workflowsDir = path.join(root, ".github", "workflows");

const retiredWorkflows = [
  "phase7b-live-runtime-status-ci.yml",
  "phase7b-pattern-rule-v2-apply.yml",
  "phase7b-pattern-rule-v2-recovery-ci.yml",
  "phase7c-demo-target-live-env-disabled-ci.yml",
  "phase7c-switch-position-array-ci.yml",
  "phase7c-stale-port-ownership-ci.yml",
  "phase7c-scheduled-task-ownership-ci.yml",
  "phase7c-live-capability-ci.yml",
  "phase7c-live-readonly-probe-ci.yml",
  "phase7c-live-activation-preflight-ci.yml",
  "phase7c-live-arm-guard-ci.yml",
  "phase7c-live-risk-profile-ci.yml",
  "phase7c-dual-account-mode-ci.yml",
];

test("canonical PR gate remains present after workflow pruning", () => {
  assert.equal(
    fs.existsSync(path.join(workflowsDir, "phase7c-canonical-pr-gate.yml")),
    true,
    "canonical PR gate must never be removed by workflow pruning",
  );
});

test("proven-dead workflows stay retired", () => {
  for (const workflow of retiredWorkflows) {
    assert.equal(
      fs.existsSync(path.join(workflowsDir, workflow)),
      false,
      `RED_TARGET: retired workflow must be absent: ${workflow}`,
    );
  }
});
