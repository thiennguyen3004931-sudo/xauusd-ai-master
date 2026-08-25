import assert from "node:assert/strict";
import test from "node:test";

async function loadPolicy() {
  try {
    return await import("../apps/api/src/services/phase7b-entry-diagnostics-account-mode.ts");
  } catch (error) {
    return {
      shouldComputePhase7BEntryDiagnostics: () => false,
      __loadError: error,
    };
  }
}

test("reachable LIVE/real telemetry enables canonical entry diagnostics", async () => {
  const policy = await loadPolicy();
  const actual = policy.shouldComputePhase7BEntryDiagnostics({
    reachable: true,
    accountMode: "real",
  });

  assert.equal(
    actual,
    true,
    policy.__loadError
      ? `Expected LIVE diagnostics policy module to exist and allow real accounts: ${policy.__loadError}`
      : undefined,
  );
});

test("reachable DEMO telemetry keeps canonical entry diagnostics enabled", async () => {
  const policy = await loadPolicy();
  assert.equal(policy.shouldComputePhase7BEntryDiagnostics({ reachable: true, accountMode: "demo" }), true);
});

test("unsupported account modes stay fail-closed", async () => {
  const policy = await loadPolicy();
  assert.equal(policy.shouldComputePhase7BEntryDiagnostics({ reachable: true, accountMode: "contest" }), false);
  assert.equal(policy.shouldComputePhase7BEntryDiagnostics({ reachable: true, accountMode: null }), false);
});

test("unreachable telemetry never computes canonical entry diagnostics", async () => {
  const policy = await loadPolicy();
  assert.equal(policy.shouldComputePhase7BEntryDiagnostics({ reachable: false, accountMode: "real" }), false);
  assert.equal(policy.shouldComputePhase7BEntryDiagnostics({ reachable: false, accountMode: "demo" }), false);
});
