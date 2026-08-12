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
  console.log("PHASE4E_HOOK_STATUS=PASS");
  process.exit(0);
}

if (!fs.existsSync(backup)) {
  fs.copyFileSync(file, backup);
  console.log(`Backup created: ${backup}`);
}

if (!content.includes("Phase4WalkForwardService")) {
  const importRegex = /(\s+Phase4ManagementSweepService,\r?\n)(\s+RiskPipeline,)/;
  if (!importRegex.test(content)) {
    throw new Error("Phase 4D import marker not found. Apply Phase 4D hook first.");
  }
  content = content.replace(
    importRegex,
    `$1  Phase4WalkForwardService,\n$2`,
  );
}

if (!content.includes("const phase4WalkForwardService = new Phase4WalkForwardService();")) {
  const logRegex = /console\.log\(["']PHASE4D_RESEARCH_ONLY=PASS["']\);/;
  if (!logRegex.test(content)) {
    throw new Error("Phase 4D log marker not found.");
  }

  const block = `const phase4WalkForwardService = new Phase4WalkForwardService();\nconst phase4WalkForwardResult = phase4WalkForwardService.run(phase4Research.shadowCases());\n\nfor (const line of phase4WalkForwardService.format(phase4WalkForwardResult)) {\n  console.log(line);\n}\n\nconsole.log("PHASE4E_PRODUCTION_MUTATION=false");\nconsole.log("PHASE4D_RESEARCH_ONLY=PASS");`;

  content = content.replace(logRegex, block);
}

fs.writeFileSync(file, content, "utf8");

const verify = fs.readFileSync(file, "utf8");
const checks = [
  verify.includes("Phase4WalkForwardService"),
  verify.includes("const phase4WalkForwardService = new Phase4WalkForwardService();"),
  verify.includes("phase4WalkForwardService.format"),
  verify.includes("PHASE4E_PRODUCTION_MUTATION=false"),
];

if (!checks.every(Boolean)) {
  throw new Error("Phase 4E hook verification failed after write.");
}

console.log(`Phase 4E walk-forward hook applied: ${file}`);
console.log("Research-only: production execution and sizing remain unchanged.");
console.log("PHASE4E_HOOK_STATUS=PASS");
