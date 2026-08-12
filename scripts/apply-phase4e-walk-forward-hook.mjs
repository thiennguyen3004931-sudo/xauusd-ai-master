import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/apply-phase4e-walk-forward-hook.mjs <canonical_replay.ts>");
  process.exit(1);
}

const file = path.resolve(target);
const backup = `${file}.phase4e.bak`;
let content = fs.readFileSync(file, "utf8");

if (content.includes("PHASE4E_TOTAL_CASES=")) {
  console.log(`Phase 4E hook already present: ${file}`);
  process.exit(0);
}

if (!fs.existsSync(backup)) {
  fs.copyFileSync(file, backup);
  console.log(`Backup created: ${backup}`);
}

const importMarker = `  Phase4ManagementSweepService,\n  RiskPipeline,`;
const importReplacement = `  Phase4ManagementSweepService,\n  Phase4WalkForwardService,\n  RiskPipeline,`;
if (!content.includes(importMarker)) {
  throw new Error("Phase 4D import marker not found. Apply Phase 4D hook first.");
}
content = content.replace(importMarker, importReplacement);

const logMarker = `console.log("PHASE4D_RESEARCH_ONLY=PASS");`;
const block = `const phase4WalkForwardService = new Phase4WalkForwardService();\nconst phase4WalkForwardResult = phase4WalkForwardService.run(phase4Research.shadowCases());\n\nfor (const line of phase4WalkForwardService.format(phase4WalkForwardResult)) {\n  console.log(line);\n}\n\n${logMarker}`;
if (!content.includes(logMarker)) {
  throw new Error("Phase 4D log marker not found.");
}
content = content.replace(logMarker, block);

fs.writeFileSync(file, content, "utf8");
console.log(`Phase 4E walk-forward hook applied: ${file}`);
console.log("Research-only: production execution and sizing remain unchanged.");
