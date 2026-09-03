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

test("Sideway Fixed TP exit reuses canonical executable trigger, deterministic command id, and shared execution lock", () => {
  assert.match(
    sidewaySource,
    /import\s*\{[\s\S]*?\bbuildFixedTpSnapshot\b[\s\S]*?\bisFixedTpTriggered\b[\s\S]*?\bfixedTpCommandId\b[\s\S]*?\}\s*from\s*["']\.\/phase7c-fixed-tp\.mjs["']/,
    "RED_TARGET: Sideway must reuse canonical Fixed TP snapshot, bid/ask trigger and deterministic command identity.",
  );
  assert.match(
    sidewaySource,
    /import\s*\{[\s\S]*?\bacquireExecutionLock\b[\s\S]*?\}\s*from\s*["']\.\/phase7c-execution-lock\.mjs["']/,
    "RED_TARGET: Sideway Fixed TP close must reuse the shared execution lock.",
  );
});

test("Sideway Fixed TP close re-reconciles managed identity and closes 100% of current remaining broker volume", () => {
  const helper = block("async function closeFixedTpIfTriggered(", "async function managePosition(");

  assert.match(helper, /bridgeGet\s*\(\s*`\/v1\/positions\?symbol=\$\{encodeURIComponent\(symbol\)\}`\s*,?\s*\)/,
    "RED_TARGET: Fixed TP helper must reconcile the current broker position again so a same-cycle +10 partial cannot leave stale volume.");
  assert.match(helper, /positions\.length\s*!==\s*1/,
    "RED_TARGET: ambiguous broker position state must fail closed.");
  assert.match(helper, /isFixedTpTriggered\s*\(\s*\{[\s\S]*?enabled\s*:\s*managed\.fixedTpEnabled[\s\S]*?side\s*:\s*managed\.side[\s\S]*?targetPrice\s*:\s*managed\.fixedTpPrice[\s\S]*?bid\s*:\s*quote\.bid[\s\S]*?ask\s*:\s*quote\.ask[\s\S]*?\}\s*\)/,
    "RED_TARGET: BUY must trigger from bid and SELL from ask using the immutable managed target.");
  assert.match(helper, /position\.ticket\s*!==\s*managed\.ticket/,
    "RED_TARGET: Fixed TP must revalidate the managed ticket before mutation.");
  assert.match(helper, /managed\.side\s*===\s*["']BUY["'][\s\S]*?["']LONG["'][\s\S]*?["']SHORT["']/,
    "RED_TARGET: Fixed TP must revalidate managed side against broker position side.");
  assert.match(helper, /Number\.isFinite\s*\(\s*Number\(position\.volume\)\s*\)[\s\S]*?Number\(position\.volume\)\s*>\s*0|Number\.isFinite\s*\(\s*position\.volume\s*\)[\s\S]*?position\.volume\s*>\s*0/,
    "RED_TARGET: Fixed TP must revalidate a positive current remaining volume.");
  assert.match(helper, /fixedTpCommandId\s*\(\s*["']sideway["']\s*,\s*managed\.ticket\s*\)/,
    "RED_TARGET: duplicate polling/restart must reuse exactly phase7c-fixed-tp-sideway-{ticket}.");
  assert.match(helper, /bridgeRequest\s*\(\s*["']POST["'][\s\S]*?\/close[\s\S]*?volume\s*:\s*Number\(position\.volume\)|bridgeRequest\s*\(\s*["']POST["'][\s\S]*?\/close[\s\S]*?volume\s*:\s*position\.volume/,
    "RED_TARGET: Fixed TP must close 100% of the broker-reconciled remaining volume.");
});

test("Sideway Fixed TP lock contention fails closed and confirmed/replay outcomes remain observable", () => {
  const helper = block("async function closeFixedTpIfTriggered(", "async function managePosition(");

  assert.match(helper, /acquireExecutionLock\s*\(/,
    "RED_TARGET: Fixed TP mutation must acquire the shared lock immediately around close execution.");
  assert.match(helper, /if\s*\(\s*!lock\.acquired\s*\)[\s\S]*?FIXED_TP_CLOSE_BLOCKED[\s\S]*?return\s+true/,
    "RED_TARGET: lock contention must fail closed with no fall-through broker mutation.");
  assert.match(helper, /finally\s*\{[\s\S]*?lock\.release\s*\(\s*\)/,
    "RED_TARGET: acquired execution lock must always release in finally.");

  for (const event of [
    "FIXED_TP_TRIGGERED",
    "FIXED_TP_CLOSE_ATTEMPT",
    "FIXED_TP_CLOSE_CONFIRMED",
    "FIXED_TP_CLOSE_REPLAY",
    "FIXED_TP_CLOSE_BLOCKED",
  ]) {
    assert.match(helper, new RegExp(`journal\\(["']${event}["']`),
      `RED_TARGET: Sideway Fixed TP must journal ${event}.`);
  }
  assert.match(helper, /response\.idempotentReplay[\s\S]*?FIXED_TP_CLOSE_REPLAY[\s\S]*?FIXED_TP_CLOSE_CONFIRMED|response\.idempotentReplay[\s\S]*?FIXED_TP_CLOSE_CONFIRMED[\s\S]*?FIXED_TP_CLOSE_REPLAY/,
    "RED_TARGET: first confirmation and deterministic replay must remain distinguishable.");
});

test("Sideway management preserves time/regime, +6/+10, Daily Recovery and TP2 precedence around Fixed TP", () => {
  const manage = block("async function managePosition(", "async function closeAll(");
  const timeIndex = manage.indexOf("if (Date.now() >= managed.timeStopAt)");
  const regimeExitIndex = manage.indexOf('await closeAll(position, "REGIME_LEFT_RANGE")');
  const beIndex = manage.indexOf("if (!managed.breakEvenApplied && favorable >= 6)");
  const recoveryIndex = manage.indexOf('if (managed.dailyMode === "RECOVERY_TP")');
  const partialIndex = manage.indexOf("if (managed.breakEvenApplied && !managed.partialApplied && targetReached(managed.side, marketPrice, managed.tp1))");
  const tp2Index = manage.indexOf("if (targetReached(managed.side, marketPrice, managed.tp2))");
  const fixedCalls = [...manage.matchAll(/await closeFixedTpIfTriggered\(position,\s*quote\)/g)].map((match) => match.index);
  const guardedCalls = [...manage.matchAll(/if\s*\(\s*await closeFixedTpIfTriggered\(position,\s*quote\)\s*\)\s*return\s*;/g)].map((match) => match.index);

  assert.ok(timeIndex >= 0 && regimeExitIndex > timeIndex,
    "existing time-stop and regime-invalidation exits must remain ahead of dynamic target management");
  assert.ok(beIndex > regimeExitIndex,
    "existing +6 break-even must remain after time/regime exits");
  assert.ok(recoveryIndex > beIndex && partialIndex > recoveryIndex && tp2Index > partialIndex,
    "existing Daily Recovery, +10 partial and TP2 ordering must remain structurally intact");
  assert.equal(fixedCalls.length, 2,
    "RED_TARGET: Sideway must monitor Fixed TP independently in Daily Recovery and normal management.");
  assert.equal(guardedCalls.length, fixedCalls.length,
    "RED_TARGET: every Fixed TP handled/blocked cycle must return before another close path can mutate.");

  const recoveryReturn = manage.indexOf("\n    return;", recoveryIndex);
  assert.ok(fixedCalls[0] > recoveryIndex && fixedCalls[0] < recoveryReturn,
    "RED_TARGET: Daily Recovery broker TP remains intact while executor Fixed TP can independently win before recovery hold returns.");
  assert.ok(fixedCalls[1] > partialIndex,
    "RED_TARGET: normal Fixed TP must run after the existing +10 one-third partial so later targets preserve native partial first.");
  assert.ok(fixedCalls[1] < tp2Index,
    "RED_TARGET: after native +10 management, a reached Fixed TP returns before the existing TP2 fallback.");
});

test("existing Sideway native close paths and command identity stay untouched", () => {
  const closeAll = block("async function closeAll(", "async function controlGet(");
  assert.match(closeAll, /managed\.exitAttempt\s*\+=\s*1/,
    "existing native Sideway full-close attempt tracking must remain unchanged.");
  assert.match(closeAll, /commandId\s*:\s*`p7c-sideway-exit-\$\{managed\.ticket\}-\$\{managed\.exitAttempt\}`/,
    "existing TP2/range/time/regime close identity must not be rewritten by Fixed TP.");
  assert.match(sidewaySource, /tp2\s*:\s*executionPlan\.takeProfit/,
    "existing durable Sideway TP2 metadata must remain unchanged by broker-native Fixed TP.");
  assert.match(sidewaySource, /const\s+brokerTakeProfit\s*=\s*dailyRecovery\.mode\s*===\s*["']RECOVERY_TP["'][\s\S]*?executionPlan\.takeProfit[\s\S]*?fixedTpSnapshot\.enabled[\s\S]*?fixedTpSnapshot\.targetPrice[\s\S]*?executionPlan\.takeProfit/,
    "Daily Recovery must keep broker TP precedence while non-Recovery Fixed TP may become the broker-native takeProfit.");
  assert.match(sidewaySource, /takeProfit\s*:\s*brokerTakeProfit/,
    "initial Sideway broker order must use the canonical brokerTakeProfit selector.");
});
