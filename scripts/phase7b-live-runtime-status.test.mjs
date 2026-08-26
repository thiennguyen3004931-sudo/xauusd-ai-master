import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

async function loadRuntimePolicy() {
  try {
    return await import("../apps/api/src/services/phase7b-status-runtime-account-mode.ts");
  } catch (error) {
    return {
      phase7BForwardRuntimeDirName: () => "phase7b-demo-forward",
      __loadError: error,
    };
  }
}

test("LIVE/real status resolves the Phase7B LIVE forward runtime", async () => {
  const policy = await loadRuntimePolicy();
  const actual = policy.phase7BForwardRuntimeDirName("real");

  assert.equal(
    actual,
    "phase7b-live-forward",
    policy.__loadError
      ? `Expected account-aware Phase7B runtime policy to exist: ${policy.__loadError}`
      : undefined,
  );
});

test("DEMO status keeps the Phase7B DEMO forward runtime", async () => {
  const policy = await loadRuntimePolicy();
  assert.equal(policy.phase7BForwardRuntimeDirName("demo"), "phase7b-demo-forward");
});

test("unknown broker account modes stay fail-closed on DEMO status runtime", async () => {
  const policy = await loadRuntimePolicy();
  assert.equal(policy.phase7BForwardRuntimeDirName("contest"), "phase7b-demo-forward");
  assert.equal(policy.phase7BForwardRuntimeDirName(""), "phase7b-demo-forward");
  assert.equal(policy.phase7BForwardRuntimeDirName(null), "phase7b-demo-forward");
  assert.equal(policy.phase7BForwardRuntimeDirName(undefined), "phase7b-demo-forward");
});

test("Phase7B status route selects runtime from broker account mode", () => {
  const source = readFileSync(
    new URL("../apps/api/src/routes/phase7b-demo.route.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /findLatestDemoDir\s*\(\s*telemetry\.health\?\.accountMode\s*\?\?\s*null\s*\)/,
  );
  assert.match(source, /phase7BForwardRuntimeDirName/);
});
