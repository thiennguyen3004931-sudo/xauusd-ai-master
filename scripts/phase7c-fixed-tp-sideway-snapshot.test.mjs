import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const sidewaySource = readFileSync(path.join(scriptsDir, "run-phase7c-sideway-controller.mjs"), "utf8");

function block(startMarker, endMarker) {
  const start = sidewaySource.indexOf(startMarker);
  assert.notEqual(start, -1, `source must contain ${startMarker}`);
  const end = sidewaySource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `source must contain ${endMarker} after ${startMarker}`);
  return sidewaySource.slice(start, end);
}

test("Sideway controller consumes only canonical Sideway Fixed TP runtime configuration", () => {
  assert.match(
    sidewaySource,
    /import\s*\{[\s\S]*?\bbuildFixedTpSnapshot\b[\s\S]*?\}\s*from\s*["']\.\/phase7c-fixed-tp\.mjs["']/,
    "RED_TARGET: Sideway must reuse the canonical pure Fixed TP snapshot helper.",
  );
  assert.match(sidewaySource, /ZIQ_PHASE7C_SIDEWAY_FIXED_TP_ENABLED/,
    "RED_TARGET: Sideway controller must read Sideway Fixed TP enable from the canonical launcher env.");
  assert.match(sidewaySource, /ZIQ_PHASE7C_SIDEWAY_FIXED_TP_DISTANCE/,
    "RED_TARGET: Sideway controller must read Sideway Fixed TP distance from the canonical launcher env.");
  assert.doesNotMatch(sidewaySource, /ZIQ_PHASE7C_TREND_FIXED_TP_/,
    "Sideway controller must never consume Trend Fixed TP configuration.");
});

test("Sideway durable pending entry snapshots Fixed TP before broker submission", () => {
  const entryFlow = block("const dailyRecovery = await resolveDailyRecoveryPlan(", "const order = await bridgeRequest(\"POST\", \"/v1/orders\"");
  const pendingIndex = entryFlow.indexOf("state.pendingEntry = {");
  const saveIndex = entryFlow.indexOf("saveState();", pendingIndex);
  const orderBoundary = entryFlow.length;

  assert.match(entryFlow, /buildFixedTpSnapshot\s*\(\s*\{[\s\S]*?enabled\s*:\s*sidewayFixedTpEnabled[\s\S]*?distance\s*:\s*sidewayFixedTpDistance[\s\S]*?side[\s\S]*?entry\s*:\s*Number\(finalPlan\.entry\)[\s\S]*?\}\s*\)/,
    "RED_TARGET: Fixed TP must be snapshotted from Sideway runtime settings and planned entry before durable pending state.");
  assert.ok(pendingIndex >= 0 && saveIndex > pendingIndex && saveIndex < orderBoundary,
    "existing pending state must remain durable before broker submission");

  const pendingBlock = entryFlow.slice(pendingIndex, saveIndex);
  assert.match(pendingBlock, /fixedTpEnabled\s*:\s*fixedTpSnapshot\.enabled/,
    "RED_TARGET: pending state must persist fixedTpEnabled.");
  assert.match(pendingBlock, /fixedTpDistance\s*:\s*fixedTpSnapshot\.distance/,
    "RED_TARGET: pending state must persist fixedTpDistance.");
  assert.match(pendingBlock, /fixedTpPrice\s*:\s*fixedTpSnapshot\.targetPrice/,
    "RED_TARGET: pending state must persist entry-derived fixedTpPrice.");
  assert.match(entryFlow, /journal\s*\(\s*["']FIXED_TP_CONFIG_SNAPSHOT["']/,
    "RED_TARGET: Sideway entry must journal the immutable Fixed TP snapshot.");
});

test("Sideway fill and pending recovery derive managed Fixed TP from actual broker entry", () => {
  const managedBuilder = block("function buildManagedState(", "async function managePosition(");

  assert.match(managedBuilder, /buildFixedTpSnapshot\s*\(\s*\{[\s\S]*?enabled\s*:\s*pending\.fixedTpEnabled[\s\S]*?distance\s*:\s*pending\.fixedTpDistance[\s\S]*?side\s*:\s*pending\.side[\s\S]*?entry\s*:\s*Number\(opened\.entry\)[\s\S]*?\}\s*\)/,
    "RED_TARGET: fill/recovery must rederive target from actual broker entry while keeping the pending configuration snapshot.");
  assert.match(managedBuilder, /fixedTpEnabled\s*:\s*fixedTpSnapshot\.enabled/,
    "RED_TARGET: managed state must persist fixedTpEnabled.");
  assert.match(managedBuilder, /fixedTpDistance\s*:\s*fixedTpSnapshot\.distance/,
    "RED_TARGET: managed state must persist fixedTpDistance.");
  assert.match(managedBuilder, /fixedTpPrice\s*:\s*fixedTpSnapshot\.targetPrice/,
    "RED_TARGET: managed state must persist the actual-entry-derived target across restart.");

  assert.match(sidewaySource, /state\.managed\s*=\s*buildManagedState\(recovery\.position,\s*pending,\s*brokerClockOffsetMs\)/,
    "pending-entry recovery must use the same managed-state builder as a normal fill.");
  assert.match(sidewaySource, /state\.managed\s*=\s*buildManagedState\(opened,\s*state\.pendingEntry,\s*brokerClockOffsetMs\)/,
    "normal fill must use the canonical managed-state builder.");
});

test("legacy Sideway persisted state restores Fixed TP disabled without changing saved v1 state contract", () => {
  const loadState = block("function loadState()", "function saveState()");

  assert.match(loadState, /normalizePendingEntry\s*\(\s*parsed\.pendingEntry\s*\)/,
    "RED_TARGET: persisted pending state must pass through a legacy-safe Fixed TP normalizer.");
  assert.match(loadState, /normalizeManagedState\s*\(\s*parsed\.managed\s*\)/,
    "RED_TARGET: persisted managed state must pass through a legacy-safe Fixed TP normalizer.");

  const pendingNormalizer = block("function normalizePendingEntry(", "function normalizeManagedState(");
  assert.match(pendingNormalizer, /fixedTpEnabled\s*:\s*fixedTpEnabled\s*\?\s*true\s*:\s*false/,
    "RED_TARGET: old pending state without valid Fixed TP fields must restore disabled.");
  assert.match(pendingNormalizer, /fixedTpDistance\s*:\s*fixedTpEnabled\s*\?\s*distance\s*:\s*0/,
    "RED_TARGET: old pending state must restore distance 0.");
  assert.match(pendingNormalizer, /fixedTpPrice\s*:\s*fixedTpEnabled\s*\?\s*price\s*:\s*null/,
    "RED_TARGET: old pending state must restore target null.");

  const managedNormalizer = block("function normalizeManagedState(", "function loadState()");
  assert.match(managedNormalizer, /fixedTpEnabled\s*:\s*fixedTpEnabled\s*\?\s*true\s*:\s*false/,
    "RED_TARGET: old managed state without valid Fixed TP fields must restore disabled.");
  assert.match(managedNormalizer, /fixedTpDistance\s*:\s*fixedTpEnabled\s*\?\s*distance\s*:\s*0/,
    "RED_TARGET: old managed state must restore distance 0.");
  assert.match(managedNormalizer, /fixedTpPrice\s*:\s*fixedTpEnabled\s*\?\s*price\s*:\s*null/,
    "RED_TARGET: old managed state must restore target null.");

  assert.match(loadState, /version\s*:\s*1/,
    "Sideway local state version must stay compatible; Task 6 is additive state normalization, not a state-format reset.");
});

test("Sideway Fixed TP snapshot never overwrites broker TP2 or Daily Recovery takeProfit", () => {
  const entryFlow = block("const recoveryTakeProfit =", "function readStrategyEntryConfigSnapshot()");
  const managedBuilder = block("function buildManagedState(", "async function managePosition(");

  assert.match(entryFlow, /takeProfit\s*:\s*executionPlan\.takeProfit/,
    "existing broker TP2/Daily Recovery takeProfit payload must remain authoritative.");
  assert.match(entryFlow, /tp2\s*:\s*executionPlan\.takeProfit/,
    "existing durable Sideway TP2 snapshot must remain unchanged.");
  assert.match(managedBuilder, /tp2\s*:\s*Number\(pending\.tp2\)/,
    "managed TP2 must still come from the existing pending TP2 field.");
  assert.match(managedBuilder, /recoveryTakeProfit\s*:\s*Number\(pending\.recoveryTakeProfit\s*\?\?\s*0\)/,
    "Daily Recovery takeProfit metadata must remain independent.");
  assert.doesNotMatch(entryFlow, /takeProfit\s*:\s*[^,\n]*fixedTp/i,
    "Fixed TP must never overwrite broker takeProfit.");
  assert.doesNotMatch(managedBuilder, /tp2\s*:\s*[^,\n]*fixedTp/i,
    "Fixed TP must never overwrite Sideway TP2.");
});
