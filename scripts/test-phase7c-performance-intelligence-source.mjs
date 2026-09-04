import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const servicePath = path.join(root, "apps/api/src/services/phase7c-performance-intelligence.service.ts");
const schemaPath = path.join(root, "apps/api/src/contracts/phase7c-performance-correlation.schema.ts");
const routePath = path.join(root, "apps/api/src/routes/phase7c-performance-intelligence.route.ts");
const appPath = path.join(root, "apps/api/src/app.ts");
const webApiPath = path.join(root, "apps/web/src/phase7c-performance-intelligence-api.ts");
const webTypesPath = path.join(root, "apps/web/src/phase7c-performance-intelligence-types.ts");
const webCardPath = path.join(root, "apps/web/src/ui/Phase7CPerformanceIntelligenceCard.tsx");
const webShellPath = path.join(root, "apps/web/src/pages/Phase7CControlCenterShellPage.tsx");
const workflowPath = path.join(root, ".github/workflows/phase7c-performance-intelligence-ci.yml");

function fail(message) {
  console.error(`P2_PERFORMANCE_INTELLIGENCE_SOURCE_CONTRACT=FAIL ${message}`);
  process.exit(1);
}

function mustContain(text, needle, label) {
  if (!text.includes(needle)) fail(`${label} missing ${needle}`);
}

function mustNotContain(text, needle, label) {
  if (text.includes(needle)) fail(`${label} contains stale ${needle}`);
}

for (const [filePath, label] of [
  [servicePath, "service"],
  [schemaPath, "correlation schema"],
  [routePath, "route"],
  [appPath, "app"],
  [webApiPath, "web API"],
  [webTypesPath, "web types"],
  [webCardPath, "web card"],
  [webShellPath, "web shell"],
  [workflowPath, "workflow"],
]) {
  if (!fs.existsSync(filePath)) fail(`${label} file missing`);
}

const service = fs.readFileSync(servicePath, "utf8");
const schema = fs.readFileSync(schemaPath, "utf8");
const route = fs.readFileSync(routePath, "utf8");
const app = fs.readFileSync(appPath, "utf8");
const webApi = fs.readFileSync(webApiPath, "utf8");
const webTypes = fs.readFileSync(webTypesPath, "utf8");
const webCard = fs.readFileSync(webCardPath, "utf8");
const webShell = fs.readFileSync(webShellPath, "utf8");
const workflow = fs.readFileSync(workflowPath, "utf8");

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
mustContain(service, 'buildPhase7CPerformanceCorrelationBackfill', "service");
mustContain(service, 'PHASE7C_PERFORMANCE_CORRELATION_SCHEMA_VERSION', "service");

// Canonical decision audit path contract: executor decision streams are account-aware.
mustContain(service, 'decisionAuditRoot', "service");
mustContain(service, '"phase7c-executors", "decision-observability"', "service");
mustContain(service, 'accountMode.toLowerCase()', "service");
mustContain(service, '"trend-decisions.jsonl"', "service");
mustContain(service, '"sideway-decisions.jsonl"', "service");
mustNotContain(service, 'phase7b-live-forward-decision-audit.jsonl', "service");
mustNotContain(service, 'phase7c-sideway-decision-observability.jsonl', "service");

// Canonical normalized decision records persist entry mode and rule checks.
mustContain(service, '"entryState"', "service");
mustContain(service, 'record.conditions', "service");
mustContain(service, 'status === "PASS"', "service");
mustContain(service, 'status === "FAIL"', "service");

// Correlation is explicit-ID only; never infer by timestamp/price proximity.
mustContain(service, 'EXPLICIT_IDENTITY_GRAPH', "service");
mustContain(service, '"POSITION"', "service");
mustContain(service, '"ORDER"', "service");
mustContain(service, '"SIGNAL"', "service");
mustContain(service, 'no timestamp or price proximity matching is used', "service");

// Canonical versioned row schema is explicit and fail-closed.
mustContain(schema, 'phase7c-performance-correlation-v1', "schema");
mustContain(schema, 'Phase7CPerformanceCorrelationRow', "schema");
mustContain(schema, 'candidatePositionCount', "schema");
mustContain(schema, 'EXACT', "schema");
mustContain(schema, 'AMBIGUOUS', "schema");
mustContain(schema, 'UNMATCHED', "schema");
mustContain(schema, 'MT5_ACCOUNT_READ_ONLY', "schema");

mustContain(route, 'router.get("/"', "route");
mustContain(route, 'router.get("/correlations"', "route");
if (/router\.(post|put|patch|delete)\s*\(/i.test(route)) fail("route must be GET-only");
mustContain(route, 'getPhase7CPerformanceIntelligence', "route");
mustContain(route, 'buildPhase7CPerformanceCorrelationBackfill', "route");

mustContain(app, 'phase7c-performance-intelligence.route', "app");
mustContain(app, 'app.use("/api/v1/phase7c/performance-intelligence"', "app");

mustContain(webApi, '/api/v1/phase7c/performance-intelligence', "web API");
mustContain(webApi, 'cache: "no-store"', "web API");
mustNotContain(webApi.toLowerCase(), 'method: "post"', "web API");
mustNotContain(webApi.toLowerCase(), 'method: "put"', "web API");
mustNotContain(webApi.toLowerCase(), 'method: "patch"', "web API");
mustNotContain(webApi.toLowerCase(), 'method: "delete"', "web API");
mustContain(webTypes, 'Phase7CPerformanceIntelligenceSnapshot', "web types");
mustContain(webTypes, 'Phase7CPerformanceCorrelationRow', "web types");
mustContain(webCard, 'Performance Intelligence', "web card");
mustContain(webCard, 'READ ONLY', "web card");
mustContain(webCard, 'refetchInterval: 15000', "web card");
mustContain(webShell, 'Phase7CPerformanceIntelligenceCard', "web shell");

mustContain(workflow, 'apps/web/src/ui/Phase7CPerformanceIntelligenceCard.tsx', "workflow");
mustContain(workflow, 'scripts/phase7c-performance-correlation-schema.test.ts', "workflow");
mustContain(workflow, 'Build web dependency graph', "workflow");

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
console.log("P2_PERFORMANCE_INTELLIGENCE_AUDIT_PATH=CANONICAL_ACCOUNT_AWARE");
console.log("P2_PERFORMANCE_INTELLIGENCE_RULE_EVIDENCE=CANONICAL_ENTRY_CONDITIONS");
console.log("P2_PERFORMANCE_INTELLIGENCE_CORRELATION=EXPLICIT_IDENTITY_GRAPH_FAIL_CLOSED");
console.log("P2_PERFORMANCE_INTELLIGENCE_SCHEMA=VERSIONED_CANONICAL_V1");
console.log("P2_PERFORMANCE_INTELLIGENCE_UI=READ_ONLY");
console.log("P2_PERFORMANCE_INTELLIGENCE_RUNTIME_MUTATION=NONE");