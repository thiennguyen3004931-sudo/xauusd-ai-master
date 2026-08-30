import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

const lifecycle = read("apps/api/src/services/phase7c-lifecycle.service.ts");
const route = read("apps/api/src/routes/phase7c.route.ts");
const webApi = read("apps/web/src/api.ts");

// Lifecycle STOP provenance must be an internal canonical union, never a free-form request value.
assert.match(
  lifecycle,
  /export type Phase7CLifecycleStopProvenance\s*=\s*[\s\S]*?["']web-control-center-stop["'][\s\S]*?["']local-lifecycle-api-stop["'][\s\S]*?;/,
  "lifecycle service must define the two canonical STOP provenance values",
);
assert.match(
  lifecycle,
  /phase7CBotModeService\.set\(\s*["']PAUSE["']\s*,\s*provenance\s*\)/,
  "lifecycle STOP must persist the caller provenance supplied by the trusted server route",
);

// Generic localhost lifecycle API remains the maintenance/automation surface.
const genericStopStart = route.indexOf('router.post("/lifecycle/stop"');
assert.ok(genericStopStart >= 0, "generic lifecycle STOP route must remain available");
const genericStopEnd = route.indexOf("router.", genericStopStart + 12);
assert.ok(genericStopEnd > genericStopStart, "cannot isolate generic lifecycle STOP route");
const genericStop = route.slice(genericStopStart, genericStopEnd);
assert.match(
  genericStop,
  /["']local-lifecycle-api-stop["']/,
  "direct localhost lifecycle STOP must be attributed to local-lifecycle-api-stop",
);
assert.doesNotMatch(
  genericStop,
  /req\.body[\s\S]{0,120}source|source[\s\S]{0,120}req\.body/,
  "generic STOP must not accept arbitrary caller provenance from the request body",
);

// Web UI uses a dedicated server route so maintenance callers cannot accidentally inherit Web provenance.
const webStopStart = route.indexOf('router.post("/lifecycle/stop/web"');
assert.ok(webStopStart >= 0, "dedicated Web lifecycle STOP route is required");
const webStopEnd = route.indexOf("router.", webStopStart + 12);
assert.ok(webStopEnd > webStopStart, "cannot isolate Web lifecycle STOP route");
const webStop = route.slice(webStopStart, webStopEnd);
assert.match(webStop, /["']web-control-center-stop["']/);
assert.doesNotMatch(
  webStop,
  /req\.body[\s\S]{0,120}source|source[\s\S]{0,120}req\.body/,
  "Web provenance must be selected by the dedicated route, not client-supplied free text",
);

// The browser must call the dedicated Web STOP endpoint while START stays on the existing lifecycle endpoint.
assert.match(
  webApi,
  /action\s*===\s*["']stop["'][\s\S]*?\/api\/v1\/phase7c\/lifecycle\/stop\/web/,
  "Web STOP must use the dedicated provenance-preserving endpoint",
);
assert.match(
  webApi,
  /\/api\/v1\/phase7c\/lifecycle\/\$\{action\}/,
  "existing lifecycle START endpoint behavior must remain available",
);

console.log("PHASE7C_LIFECYCLE_CALLER_PROVENANCE_TEST=PASS");
