import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRoute = readFileSync(path.join(root, "apps/api/src/routes/phase7c.route.ts"), "utf8");
const webTypes = readFileSync(path.join(root, "apps/web/src/phase7c-types.ts"), "utf8");
const webApi = readFileSync(path.join(root, "apps/web/src/api.ts"), "utf8");
const page = readFileSync(path.join(root, "apps/web/src/pages/Phase7CControlCenterPage.tsx"), "utf8");

function block(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `source must contain ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `source must contain ${endMarker} after ${startMarker}`);
  return source.slice(start, end);
}

test("API lot-settings mutation round-trips all four Fixed TP fields through canonical v2 validation", () => {
  const route = block(apiRoute, 'router.post("/lot-settings"', 'router.get("/strategy-entry-conditions"');
  const validation = block(route, "const input = validatePhase7CLotSettings({", "});");

  assert.match(validation, /trendFixedTpEnabled\s*:\s*req\.body\?\.trendFixedTpEnabled\s*===\s*true/,
    "RED_TARGET: API must pass Trend Fixed TP enabled state through the existing canonical validator.");
  assert.match(validation, /trendFixedTpDistance\s*:\s*Number\(req\.body\?\.trendFixedTpDistance\)/,
    "RED_TARGET: API must pass Trend Fixed TP distance through canonical validation.");
  assert.match(validation, /sidewayFixedTpEnabled\s*:\s*req\.body\?\.sidewayFixedTpEnabled\s*===\s*true/,
    "RED_TARGET: API must pass Sideway Fixed TP enabled state independently.");
  assert.match(validation, /sidewayFixedTpDistance\s*:\s*Number\(req\.body\?\.sidewayFixedTpDistance\)/,
    "RED_TARGET: API must pass Sideway Fixed TP distance independently.");

  assert.match(route, /phase7CLotSettingsService\.set\(input,\s*source\)/,
    "Fixed TP must use the existing single lot/settings persistence path.");
  assert.match(route, /res\.status\(400\)\.json/,
    "canonical validation failures, including invalid enabled Fixed TP distances, must remain HTTP 400.");
});

test("API save safety guard remains PAUSE + valid configured account + matching healthy bridge + zero XAUUSD positions", () => {
  const route = block(apiRoute, 'router.post("/lot-settings"', 'router.get("/strategy-entry-conditions"');

  for (const contract of [
    /currentMode\.mode\s*!==\s*["']PAUSE["']/,
    /!accountModeState\.valid/,
    /!telemetry\.reachable/,
    /!accountModeAllowsBroker\(telemetry\.health\?\.accountMode,\s*accountModeState\)/,
    /!telemetry\.spec/,
    /telemetry\.positions\.length\s*>\s*0/,
  ]) {
    assert.match(route, contract, `save guard missing: ${contract}`);
  }

  assert.doesNotMatch(route, /fixedTp[\s\S]{0,120}stopsLevel|stopsLevel[\s\S]{0,120}fixedTp/i,
    "executor-owned Fixed TP distance must not be rejected through broker stops-level TP validation.");
});

test("Web lot-settings types expose schema v2 configured and active Fixed TP state", () => {
  const configured = block(webTypes, "export interface Phase7CLotSettingsState {", "export interface Phase7CActiveLotSettings {");
  const active = block(webTypes, "export interface Phase7CActiveLotSettings {", "export interface Phase7CLotSettingsSnapshot {");
  const snapshot = block(webTypes, "export interface Phase7CLotSettingsSnapshot {", "export interface Phase7CDecisionAuditRow {");

  assert.match(configured, /version\s*:\s*2\s*;/, "RED_TARGET: configured Web type must use schema v2.");
  assert.match(active, /version\s*:\s*2\s*;/, "RED_TARGET: active Web type must use schema v2.");
  for (const field of [
    "trendFixedTpEnabled",
    "trendFixedTpDistance",
    "sidewayFixedTpEnabled",
    "sidewayFixedTpDistance",
  ]) {
    assert.match(configured, new RegExp(`${field}\\s*:`), `RED_TARGET: configured type missing ${field}.`);
    assert.match(active, new RegExp(`${field}\\s*:`), `RED_TARGET: active type missing ${field}.`);
  }
  assert.match(active, /accountMode\s*:\s*["']DEMO["']\s*\|\s*["']LIVE["']/,
    "active runtime type must expose the account-bound materialization returned by the backend.");
  assert.match(snapshot, /restartRequired\s*:\s*boolean/,
    "restart-required visibility remains part of the canonical response.");
  assert.match(snapshot, /appliesTo\s*:\s*["']NEW_POSITIONS_ONLY["']/,
    "NEW_POSITIONS_ONLY must remain explicit in the Web contract.");
});

test("Web API sends Trend and Sideway Fixed TP through the existing single settings mutation", () => {
  const setter = block(webApi, "export async function setPhase7CLotSettings(", "export async function getPhase7CAutoLotPreview(");

  for (const field of [
    "trendFixedLot",
    "sidewayRiskPercent",
    "sidewayMaxLot",
    "trendFixedTpEnabled",
    "trendFixedTpDistance",
    "sidewayFixedTpEnabled",
    "sidewayFixedTpDistance",
  ]) {
    assert.match(setter, new RegExp(`${field}\\s*:`), `RED_TARGET: settings mutation input missing ${field}.`);
  }
  assert.match(setter, /\/api\/v1\/phase7c\/lot-settings/,
    "Fixed TP must reuse the existing settings endpoint, not a parallel transport.");
  assert.match(setter, /body\s*:\s*JSON\.stringify\(\{\s*\.\.\.input,\s*source\s*:\s*["']web-control-center["']\s*\}\)/,
    "all seven settings values must travel in one canonical mutation body.");
});

test("Control Center edits and saves independent Fixed TP controls with LIVE/DEMO-safe configuration gating", () => {
  for (const field of [
    "configuredTrendFixedTpEnabled",
    "configuredTrendFixedTpDistance",
    "configuredSidewayFixedTpEnabled",
    "configuredSidewayFixedTpDistance",
    "activeTrendFixedTpEnabled",
    "activeTrendFixedTpDistance",
    "activeSidewayFixedTpEnabled",
    "activeSidewayFixedTpDistance",
  ]) {
    assert.match(page, new RegExp(`const\\s+${field}\\s*=`), `RED_TARGET: Control Center visibility missing ${field}.`);
  }

  const draft = block(page, "const [lotDraft, setLotDraft] = useState<", "const lifecycleAction = useMutation({");
  for (const field of [
    "trendFixedTpEnabled",
    "trendFixedTpDistance",
    "sidewayFixedTpEnabled",
    "sidewayFixedTpDistance",
  ]) {
    assert.match(draft, new RegExp(`${field}\\s*:`), `RED_TARGET: Control Center draft missing ${field}.`);
  }

  for (const label of [
    "Trend Fixed TP",
    "Trend Fixed TP distance",
    "Sideway Fixed TP",
    "Sideway Fixed TP distance",
    "NEW_POSITIONS_ONLY",
    "Configured Trend TP",
    "Active Trend TP",
    "Configured Sideway TP",
    "Active Sideway TP",
  ]) {
    assert.ok(page.includes(label), `RED_TARGET: Control Center must visibly render ${label}.`);
  }

  assert.match(page, /saveLotSettings\.mutate\(\{[\s\S]*?trendFixedLot[\s\S]*?sidewayRiskPercent[\s\S]*?sidewayMaxLot[\s\S]*?trendFixedTpEnabled[\s\S]*?trendFixedTpDistance[\s\S]*?sidewayFixedTpEnabled[\s\S]*?sidewayFixedTpDistance[\s\S]*?\}\)/,
    "RED_TARGET: one Save action must submit lot/risk and both Fixed TP controls together.");

  const canChange = block(page, "const canChangeLot =", "const canPause =");
  assert.match(canChange, /mode\s*===\s*["']PAUSE["']/,
    "settings UI must remain PAUSE-gated.");
  assert.match(canChange, /bridgeReady/,
    "settings UI must require a healthy bridge.");
  assert.match(canChange, /brokerModeSupported/,
    "settings UI must recognize the configured DEMO/LIVE broker modes that the canonical backend can validate.");
  assert.match(canChange, /openXauusdPositions[\s\S]*?===\s*0/,
    "settings UI must remain zero-XAUUSD-position gated.");
  assert.doesNotMatch(canChange, /accountMode\s*===\s*["']demo["']/,
    "settings UI must not silently add a stricter DEMO-only gate than the canonical account-mode-aware backend contract.");
});

test("Fixed TP settings panel remains configuration-only with no direct broker order/position mutation", () => {
  assert.doesNotMatch(page, /\/v1\/orders|\/v1\/positions|bridgeRequest\s*\(/,
    "Control Center settings UI must not contain direct broker order/position mutation paths.");
  assert.doesNotMatch(webApi, /setPhase7CFixedTp|closePhase7CPosition|submitPhase7COrder/,
    "Fixed TP controls must not introduce a direct execution API helper.");
});
