import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

async function loadContract() {
  const sourcePath = path.resolve("apps/api/src/services/phase7c-source-safety.service.ts");
  const source = await readFile(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    fileName: sourcePath,
  }).outputText;
  const tempFile = path.join(tmpdir(), `phase7c-source-safety-${process.pid}-${Date.now()}.mjs`);
  await writeFile(tempFile, transpiled, "utf8");
  try {
    return await import(`${pathToFileURL(tempFile).href}?v=${Date.now()}`);
  } finally {
    await rm(tempFile, { force: true });
  }
}

test("backend source-safety contract exposes only enforced Performance safeguards", async () => {
  const module = await loadContract();
  const snapshot = module.getPhase7CSourceSafetyContract(1234567890);
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.source, "PHASE7C_SOURCE_SAFETY_CONTRACT");
  assert.equal(snapshot.generatedAt, 1234567890);
  assert.deepEqual(snapshot.performanceAttribution.liveMagic, {
    status: "ENFORCED",
    trendMagicNumber: 270715,
    sidewayMagicNumber: 270714,
    policy: "FAIL_CLOSED_ON_DRIFT",
  });
  assert.deepEqual(snapshot.performanceAttribution.validationIsolation, {
    status: "ENFORCED",
    policy: "EXCLUDE_FROM_SYSTEM_SUMMARY",
  });
  assert.deepEqual(snapshot.performanceAttribution.mixedOpeningProvenance, {
    status: "ENFORCED",
    policy: "FAIL_CLOSED_TO_NON_SYSTEM",
  });
});

test("Phase7C API and Web consume the backend source-safety contract", async () => {
  const [route, api, types, page] = await Promise.all([
    readFile("apps/api/src/routes/phase7c.route.ts", "utf8"),
    readFile("apps/web/src/api.ts", "utf8"),
    readFile("apps/web/src/phase7c-types.ts", "utf8"),
    readFile("apps/web/src/pages/Phase7CControlCenterPage.tsx", "utf8"),
  ]);
  assert.match(route, /router\.get\("\/source-safety"/);
  assert.match(route, /getPhase7CSourceSafetyContract\(\)/);
  assert.match(api, /getPhase7CSourceSafety/);
  assert.match(api, /\/api\/v1\/phase7c\/source-safety/);
  assert.match(types, /Phase7CSourceSafetySnapshot/);
  assert.match(page, /queryKey:\s*\["phase7c-source-safety"\]/);
  assert.match(page, /sourceSafety\.data\?\.performanceAttribution/);
});
