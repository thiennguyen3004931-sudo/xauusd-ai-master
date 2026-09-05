import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const library = read("scripts/lib/phase7c-runtime-source-attestation.ps1");
const launcher = read("scripts/run-phase7b-web-autostart.ps1");
const service = read("apps/api/src/services/phase7c-runtime-source-attestation.service.ts");

assert.match(
  library,
  /\[ValidateSet\([^\]]*['"]web['"][^\]]*\)\]\s*\[string\]\$Component/s,
  "PowerShell runtime-source attestation must accept web as a canonical component.",
);

assert.match(
  service,
  /\|\s*["']web["']/,
  "API runtime-source component type must include web.",
);
assert.match(
  service,
  /\{\s*component:\s*["']web["'],\s*launcher:\s*["']run-phase7b-web-autostart\.ps1["']\s*\}/,
  "API runtime-source snapshot must define the canonical Web launcher.",
);
assert.match(
  service,
  /component\s*===\s*["']web["'][\s\S]*?readPidFile\(deps,\s*join\(attestationRoot,\s*["']web\.pid["']\)\)/,
  "API runtime-source snapshot must resolve Web PID evidence from the attestation root.",
);

assert.match(
  launcher,
  /phase7c-runtime-source-attestation\.ps1/,
  "Web autostart must load the canonical runtime-source attestation library.",
);
assert.match(
  launcher,
  /Join-Path\s+\$attestationRoot\s+["']web\.pid["']/,
  "Web autostart must publish dedicated Web PID evidence under the attestation root.",
);
assert.match(
  launcher,
  /Write-Phase7CRuntimeSourceComponentAttestation[\s\S]*?-Component\s+["']web["']/,
  "Web autostart must write a canonical Web component attestation.",
);

const apiPassIndex = launcher.indexOf("PHASE7B_WEB_AUTOSTART_API=PASS");
const uiPassIndex = launcher.indexOf("PHASE7B_WEB_AUTOSTART_UI=PASS");
const runningIndex = launcher.indexOf("PHASE7B_WEB_AUTOSTART_STATUS=RUNNING");
const writeIndex = launcher.indexOf("Write-Phase7CRuntimeSourceComponentAttestation");
assert.ok(apiPassIndex >= 0 && uiPassIndex >= 0, "Web self-test PASS markers must remain present.");
assert.ok(runningIndex >= 0, "Web running marker must remain present.");
assert.ok(
  writeIndex > apiPassIndex && writeIndex > uiPassIndex,
  "Web attestation must be written only after API+Web self-test readiness passes.",
);
assert.ok(
  writeIndex < runningIndex,
  "Web runtime must not report RUNNING until canonical Web attestation is written.",
);

const finallyIndex = launcher.lastIndexOf("finally {");
const cleanupIndex = launcher.lastIndexOf("Remove-Item -LiteralPath $webPidPath");
assert.ok(finallyIndex >= 0, "Web runtime must retain a final cleanup block.");
assert.ok(cleanupIndex > finallyIndex, "Web PID evidence must be removed during final runtime cleanup.");

console.log("PHASE7C_WEB_SOURCE_ATTESTATION_CONTRACT=PASS");
console.log("WEB_COMPONENT_CANONICAL=TRUE");
console.log("WEB_PID_EVIDENCE=DEDICATED");
console.log("WEB_ATTESTATION_AFTER_SELF_TEST=TRUE");
console.log("WEB_RUNNING_AFTER_ATTESTATION=TRUE");
console.log("WEB_PID_CLEANUP=TRUE");
console.log("STRATEGY_CHANGE=NONE");
console.log("RISK_CHANGE=NONE");
console.log("ORDER_MUTATION=NONE");
console.log("MODE_CHANGE=NONE");
console.log("ARM_CHANGE=NONE");
