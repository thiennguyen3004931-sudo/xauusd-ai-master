import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const lifecyclePath = path.join(root, "apps/api/src/services/phase7c-lifecycle.service.ts");
const lifecycle = fs.readFileSync(lifecyclePath, "utf8");

function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}

const startMarker = "export async function startPhase7CFromWeb";
const stopMarker = "export async function stopPhase7CFromWeb";
const startIndex = lifecycle.indexOf(startMarker);
const stopIndex = lifecycle.indexOf(stopMarker);
if (startIndex < 0 || stopIndex <= startIndex) {
  throw new Error("Cannot isolate startPhase7CFromWeb source");
}

const startSource = lifecycle.slice(startIndex, stopIndex);
const pauseNeedle = 'phase7CBotModeService.set("PAUSE", "web-control-center-preflight")';
const accountDecisionNeedle = "resolvePhase7CWebStartAccount";
const readyNeedle = "if (current.ready)";
const pauseIndex = startSource.indexOf(pauseNeedle);
const accountDecisionIndex = startSource.indexOf(accountDecisionNeedle);
const readyIndex = startSource.indexOf(readyNeedle);

if (!(pauseIndex >= 0 && accountDecisionIndex > pauseIndex && readyIndex > accountDecisionIndex)) {
  throw new Error(
    `Web Start must enter PAUSE before guarded account selection and ready handling: pause=${pauseIndex}, account=${accountDecisionIndex}, ready=${readyIndex}`,
  );
}

requireText(
  startSource,
  'accountDecision.reason === "LIVE_NOT_PREAUTHORIZED"',
  "LIVE Web Start must fail closed without prior authorization",
);
requireText(
  startSource,
  "Web không tự ARM LIVE lần đầu",
  "LIVE Web Start first-time ARM boundary",
);
requireText(
  lifecycle,
  "liveAuthorization?.valid !== true",
  "LIVE launcher must revalidate prior authorization",
);
requireText(
  startSource,
  'phase7CBotModeService.set("PAUSE", "web-control-center-ready-pause")',
  "ready runtime must remain PAUSE",
);

if (/phase7CBotModeService\.set\(\s*["']AUTO["']/.test(startSource)) {
  throw new Error("Web lifecycle Start must not activate AUTO; AUTO is a separate manual Web action");
}

for (const forbidden of ["/v1/orders", "order_send", "phase7c-live-arm.json"]) {
  if (startSource.includes(forbidden)) {
    throw new Error(`Web lifecycle Start must not add broker/LIVE ARM mutation path: ${forbidden}`);
  }
}

console.log("PHASE7C_WEB_LIVE_START_GUARD_SOURCE_TEST=PASS");
