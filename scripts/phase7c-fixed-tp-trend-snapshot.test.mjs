import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const trendSource = readFileSync(path.join(scriptsDir, "run-phase7b-demo-controller.ts"), "utf8");

function block(startMarker, endMarker) {
  const start = trendSource.indexOf(startMarker);
  assert.notEqual(start, -1, `source must contain ${startMarker}`);
  const end = trendSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `source must contain ${endMarker} after ${startMarker}`);
  return trendSource.slice(start, end);
}

test("Trend controller reads only immutable Trend Fixed TP runtime configuration", () => {
  assert.match(trendSource, /ZIQ_PHASE7C_TREND_FIXED_TP_ENABLED/,
    "RED_TARGET: Trend controller must read Trend Fixed TP enable from canonical launcher env.");
  assert.match(trendSource, /ZIQ_PHASE7C_TREND_FIXED_TP_DISTANCE/,
    "RED_TARGET: Trend controller must read Trend Fixed TP distance from canonical launcher env.");
  assert.doesNotMatch(trendSource, /ZIQ_PHASE7C_SIDEWAY_FIXED_TP_/,
    "Trend controller must never consume Sideway Fixed TP configuration.");
});

test("pending and managed Trend state schemas carry the immutable Fixed TP snapshot", () => {
  const pendingType = block("type PendingTrendEntry = {", "type BotState = {");
  for (const field of ["fixedTpEnabled", "fixedTpDistance", "fixedTpPrice"]) {
    assert.match(pendingType, new RegExp(`${field}\\??:`),
      `RED_TARGET: PendingTrendEntry must persist ${field}.`);
  }

  const managedType = block("type ManagedState = {", "type StrategyEntryConfigSnapshot = {");
  for (const field of ["fixedTpEnabled", "fixedTpDistance", "fixedTpPrice"]) {
    assert.match(managedType, new RegExp(`${field}\\??:`),
      `RED_TARGET: ManagedState must persist ${field}.`);
  }
});

test("Trend snapshots Fixed TP before durable pending entry is saved", () => {
  const pendingCreation = block("const pendingEntry: PendingTrendEntry = {", "state.pendingEntry = pendingEntry;");
  assert.match(pendingCreation, /fixedTpEnabled\s*:/,
    "RED_TARGET: pending entry must snapshot fixedTpEnabled before save/order submission.");
  assert.match(pendingCreation, /fixedTpDistance\s*:/,
    "RED_TARGET: pending entry must snapshot fixedTpDistance before save/order submission.");
  assert.match(pendingCreation, /fixedTpPrice\s*:/,
    "RED_TARGET: pending entry must snapshot entry-derived fixedTpPrice before save/order submission.");
});

test("Trend recovery copies the pending Fixed TP snapshot into managed state", () => {
  const managedFromPending = block("function managedFromPending(", "async function");
  assert.match(managedFromPending, /fixedTpEnabled\s*:\s*pending\.fixedTpEnabled/,
    "RED_TARGET: recovery must preserve pending fixedTpEnabled.");
  assert.match(managedFromPending, /fixedTpDistance\s*:\s*pending\.fixedTpDistance/,
    "RED_TARGET: recovery must preserve pending fixedTpDistance.");
  assert.match(managedFromPending, /fixedTpPrice\s*:/,
    "RED_TARGET: recovery must preserve/rederive immutable fixedTpPrice from the managed entry.");
});

test("legacy persisted Trend state restores Fixed TP disabled", () => {
  const loadState = block("function loadState(file: string): BotState", "function saveState");
  assert.match(loadState, /const fixedTpEnabled\s*=\s*raw\.fixedTpEnabled\s*===\s*true\s*&&\s*Number\.isFinite\(distance\)\s*&&\s*distance\s*>\s*0\s*&&\s*Number\.isFinite\(price\)/,
    "RED_TARGET: legacy/malformed state may enable Fixed TP only when all persisted Fixed TP fields are explicitly valid.");
  assert.match(loadState, /fixedTpEnabled\s*:\s*fixedTpEnabled\s*\?\s*true\s*:\s*false/,
    "RED_TARGET: old pending/managed state without valid Fixed TP fields must restore disabled.");
  assert.match(loadState, /fixedTpDistance\s*:\s*fixedTpEnabled\s*\?\s*distance\s*:\s*0/,
    "RED_TARGET: old state must restore Fixed TP distance 0.");
  assert.match(loadState, /fixedTpPrice\s*:\s*fixedTpEnabled\s*\?\s*price\s*:\s*null/,
    "RED_TARGET: old state must restore Fixed TP price null.");
  assert.match(loadState, /pendingEntry\s*:\s*normalizePendingEntry\(parsed\.pendingEntry\)/,
    "RED_TARGET: v2 pending state must pass through the legacy-safe Fixed TP normalizer.");
  assert.match(loadState, /managed\s*:\s*normalizeManagedState\(parsed\.managed\)/,
    "RED_TARGET: persisted managed state must pass through the legacy-safe Fixed TP normalizer.");
});

test("Daily Recovery broker takeProfit remains independent from Fixed TP snapshot", () => {
  assert.match(trendSource, /recoveryTakeProfit\s*:\s*takeProfit/,
    "Daily Recovery state must keep its existing recoveryTakeProfit source.");
  assert.doesNotMatch(trendSource, /takeProfit\s*:\s*[^,\n]*fixedTp/i,
    "Fixed TP must never overwrite the broker/native takeProfit payload.");
});

// GREEN rerun marker: production snapshot implementation must satisfy this unchanged contract.
