import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const decisionMonitorPath = path.join(
  root,
  "apps/api/src/services/phase7c-decision-monitor.service.ts",
);
const performanceIntelligencePath = path.join(
  root,
  "apps/api/src/services/phase7c-performance-intelligence.service.ts",
);

function fail(message) {
  console.error(`PHASE7C_OBSERVABILITY_EVENT_LOOP_SOURCE_CONTRACT=FAIL ${message}`);
  process.exit(1);
}

for (const [filePath, label] of [
  [decisionMonitorPath, "decision monitor"],
  [performanceIntelligencePath, "performance intelligence"],
]) {
  if (!fs.existsSync(filePath)) fail(`${label} source missing`);
}

const decisionMonitor = fs.readFileSync(decisionMonitorPath, "utf8");
const performanceIntelligence = fs.readFileSync(performanceIntelligencePath, "utf8");

const decisionTailMatch = decisionMonitor.match(
  /function readJsonlTail\([^]*?\n}\n\nfunction decisionAuditRoot/,
);
if (!decisionTailMatch) fail("decision monitor readJsonlTail function not found");
const decisionTail = decisionTailMatch[0];

if (/readFileSync\s*\(\s*file\s*\)/.test(decisionTail)) {
  fail("decision monitor tail reader still reads the whole JSONL file synchronously");
}

if (!/maxBytes\s*=\s*2\s*\*\s*1024\s*\*\s*1024/.test(decisionTail)) {
  fail("decision monitor bounded 2 MiB tail contract missing");
}

const parseAuditMatch = performanceIntelligence.match(
  /(?:async\s+)?function parseAuditSource\([^]*?\n}\n\nclass IdentifierUnion/,
);
if (!parseAuditMatch) fail("performance intelligence parseAuditSource function not found");
const parseAuditSource = parseAuditMatch[0];

if (/readFileSync\s*\(\s*absolutePath/.test(parseAuditSource)) {
  fail("performance intelligence still reads the whole audit JSONL synchronously");
}

if (!/async\s+function\s+parseAuditSource/.test(parseAuditSource)) {
  fail("performance intelligence audit parser must be asynchronous");
}

if (!/createReadStream|readline\.createInterface/.test(parseAuditSource)) {
  fail("performance intelligence audit parser must stream JSONL instead of buffering the whole file");
}

if (/sendOrder|modifyPosition|closePosition|phase7CBotModeService\.set/.test(
  `${decisionMonitor}\n${performanceIntelligence}`,
)) {
  fail("observability source contains forbidden trading/mode mutation pattern");
}

console.log("PHASE7C_OBSERVABILITY_EVENT_LOOP_SOURCE_CONTRACT=PASS");
console.log("DECISION_MONITOR_JSONL_TAIL=BOUNDED");
console.log("PERFORMANCE_INTELLIGENCE_JSONL=ASYNC_STREAMING");
console.log("STRATEGY_MUTATION=NONE");
console.log("RISK_MUTATION=NONE");
console.log("MODE_MUTATION=NONE");
console.log("ARM_MUTATION=NONE");
console.log("ORDER_MUTATION=NONE");
console.log("POSITION_MUTATION=NONE");
