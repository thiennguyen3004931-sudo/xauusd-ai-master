import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const lifecyclePath = path.join(root, "apps/api/src/services/phase7c-lifecycle.service.ts");
const lifecycle = fs.readFileSync(lifecyclePath, "utf8");

function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}

function countText(source, needle) {
  let count = 0;
  let from = 0;
  while (true) {
    const index = source.indexOf(needle, from);
    if (index < 0) return count;
    count += 1;
    from = index + needle.length;
  }
}

const startMarker = "export async function startPhase7CFromWeb";
const stopMarker = "export async function stopPhase7CFromWeb";
const startIndex = lifecycle.indexOf(startMarker);
const stopIndex = lifecycle.indexOf(stopMarker);
if (startIndex < 0 || stopIndex <= startIndex) {
  throw new Error("Cannot isolate startPhase7CFromWeb source");
}

const startSource = lifecycle.slice(startIndex, stopIndex);
const accountStateNeedle = "const accountModeState = getPhase7CAccountModeState();";
const liveGuardNeedle = 'if (accountModeState.accountMode === "LIVE")';
const readyNeedle = "if (current.ready)";
const accountStateIndex = startSource.indexOf(accountStateNeedle);
const liveGuardIndex = startSource.indexOf(liveGuardNeedle);
const readyIndex = startSource.indexOf(readyNeedle);

if (!(accountStateIndex >= 0 && liveGuardIndex > accountStateIndex && readyIndex > liveGuardIndex)) {
  throw new Error(
    `LIVE Web Start guard must execute before ready-runtime AUTO handling: account=${accountStateIndex}, live=${liveGuardIndex}, ready=${readyIndex}`,
  );
}

requireText(
  startSource,
  'phase7CBotModeService.set("PAUSE", "web-control-center-live-start-blocked")',
  "LIVE Web Start PAUSE guard",
);
requireText(
  startSource,
  "Web không được chuyển LIVE sang mode hoạt động.",
  "LIVE Web Start operator boundary",
);

const autoNeedle = 'phase7CBotModeService.set("AUTO", "web-control-center-start")';
const autoCount = countText(startSource, autoNeedle);
if (autoCount !== 2) {
  throw new Error(`DEMO Web Start AUTO behavior must remain at exactly 2 existing writes; found ${autoCount}`);
}

const beforeLiveGuard = startSource.slice(0, liveGuardIndex);
if (beforeLiveGuard.includes('phase7CBotModeService.set("AUTO"')) {
  throw new Error("LIVE guard is not fail-closed: an AUTO write exists before the LIVE guard");
}

for (const forbidden of ["/v1/orders", "order_send", "phase7c-live-arm.json"]) {
  if (startSource.includes(forbidden)) {
    throw new Error(`Web lifecycle Start must not add broker/LIVE ARM mutation path: ${forbidden}`);
  }
}

console.log("PHASE7C_WEB_LIVE_START_GUARD_SOURCE_TEST=PASS");
