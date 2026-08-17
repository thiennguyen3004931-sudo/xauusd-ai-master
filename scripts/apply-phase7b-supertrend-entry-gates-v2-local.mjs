import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.env.PHASE7B_SUPERTREND_GATE_PATCH_ROOT
  ? path.resolve(process.env.PHASE7B_SUPERTREND_GATE_PATCH_ROOT)
  : process.cwd();
const basePatcher = path.join(root, "scripts", "apply-phase7b-supertrend-entry-gates-local.mjs");
if (!fs.existsSync(basePatcher)) throw new Error(`Base Supertrend patcher not found: ${basePatcher}`);

let source = fs.readFileSync(basePatcher, "utf8");
const ambiguous = `  patch(\n    files.controller,\n    "CONTROLLER_SIGNAL_CALL",\n    \`  const signal = latestSignal(m15, spec);\`,\n    \`  const signal = latestSignal(m15, m5, spec);\`,\n  ),`;
const precise = `  patch(\n    files.controller,\n    "CONTROLLER_SIGNAL_CALL",\n    \`  const signal = latestSignal(m15, spec);\\n  if (!signal || signal.signalTimestamp !== latest.closeTime) {\\n    journal("M15_NO_ENTRY_SIGNAL", {\`,\n    \`  const signal = latestSignal(m15, m5, spec);\\n  if (!signal || signal.signalTimestamp !== latest.closeTime) {\\n    journal("M15_NO_ENTRY_SIGNAL", {\`,\n  ),`;

const count = source.split(ambiguous).length - 1;
if (count !== 1) {
  throw new Error(`SUPER_TREND_V2_CONTROLLER_SIGNAL_ANCHOR: expected one base patcher anchor, found ${count}.`);
}
source = source.replace(ambiguous, precise);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase7b-supertrend-v2-"));
const tempPatcher = path.join(tempDir, "apply-phase7b-supertrend-entry-gates-v2-runtime.mjs");
fs.writeFileSync(tempPatcher, source, "utf8");

console.log("PHASE7B_SUPERTREND_GATE_V2=START");
console.log(`PHASE7B_SUPERTREND_GATE_V2_ROOT=${root}`);
console.log("PHASE7B_SUPERTREND_GATE_V2_BASE_PATCHER_MUTATION=False");
console.log("PHASE7B_SUPERTREND_GATE_V2_CONTROLLER_SIGNAL_ANCHOR=DISAMBIGUATED");

const child = spawnSync(process.execPath, [tempPatcher, ...process.argv.slice(2)], {
  cwd: root,
  env: {
    ...process.env,
    PHASE7B_SUPERTREND_GATE_PATCH_ROOT: root,
  },
  stdio: "inherit",
});

try {
  fs.rmSync(tempDir, { recursive: true, force: true });
} catch {
  // Best-effort cleanup only.
}

if (child.error) throw child.error;
if (child.status !== 0) process.exit(child.status ?? 1);
console.log("PHASE7B_SUPERTREND_GATE_V2_RESULT=PASS");
