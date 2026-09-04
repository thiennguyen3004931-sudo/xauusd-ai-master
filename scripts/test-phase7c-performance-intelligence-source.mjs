import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const servicePath = path.join(root, "apps/api/src/services/phase7c-performance-intelligence.service.ts");
const routePath = path.join(root, "apps/api/src/routes/phase7c-performance-intelligence.route.ts");
const appPath = path.join(root, "apps/api/src/app.ts");

function fail(message) {
  console.error(`P2_PERFORMANCE_INTELLIGENCE_SOURCE_CONTRACT=FAIL ${message}`);
  process.exit(1);
}

function mustContain(text, needle, label) {
  if (!text.includes(needle)) fail(`${label} missing ${needle}`);
}

if (!fs.existsSync(servicePath)) fail("service file missing");
if (!fs.existsSync(routePath)) fail("route file missing");
if (!fs.existsSync(appPath)) fail("app file missing");

const service = fs.readFileSync(servicePath, "utf8");
const route = fs.readFileSync(routePath, "utf8");
const app = fs.readFileSync(appPath, "utf8");

mustContain(service, 'getMt5PerformanceSnapshot', "service");
mustContain(service, 'EXACT', "service");
mustContain(service, 'AMBIGUOUS', "service");
mustContain(service, 'UNMATCHED', "service");
mustContain(service, 'correlationCoverage', "service");
mustContain(service, 'readOnly: true', "service");
mustContain(service, 'strategyMutation: false', "service");
mustContain(service, 'riskMutation: false', "service");
mustContain(service, 'orderMutation: false', "service");
mustContain(service, 'positionMutation: false', "service");
mustContain(service, 'autoRetune: false', "service");
mustContain(service, 'phase7b-live-forward-decision-audit.jsonl', "service");
mustContain(service, 'phase7c-sideway-decision-observability.jsonl', "service");

mustContain(route, 'router.get("/"', "route");
if (/router\.(post|put|patch|delete)\s*\(/i.test(route)) fail("route must be GET-only");
mustContain(route, 'getPhase7CPerformanceIntelligence', "route");

mustContain(app, 'phase7c-performance-intelligence.route', "app");
mustContain(app, 'app.use("/api/v1/phase7c/performance-intelligence"', "app");

const forbiddenServicePatterns = [
  /sendOrder/i,
  /modifyPosition/i,
  /closePosition/i,
  /phase7CBotModeService\.set/,
  /Write-Phase7CLiveArmState/,
];
for (const pattern of forbiddenServicePatterns) {
  if (pattern.test(service)) fail(`service contains forbidden mutation pattern ${pattern}`);
}

console.log("P2_PERFORMANCE_INTELLIGENCE_SOURCE_CONTRACT=PASS");
console.log("P2_PERFORMANCE_INTELLIGENCE_ROUTE=GET_ONLY");
console.log("P2_PERFORMANCE_INTELLIGENCE_ACCOUNTING=REUSES_MT5_PERFORMANCE");
console.log("P2_PERFORMANCE_INTELLIGENCE_CORRELATION=FAIL_CLOSED");
console.log("P2_PERFORMANCE_INTELLIGENCE_RUNTIME_MUTATION=NONE");
