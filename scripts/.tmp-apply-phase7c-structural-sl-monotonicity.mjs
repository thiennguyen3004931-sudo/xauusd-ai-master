import fs from "node:fs";

function replaceOnce(source, beforeLines, afterLines, label) {
  const before = beforeLines.join("\n");
  const after = afterLines.join("\n");
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected source block not found`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: source block is not unique`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

const helperPath = "scripts/phase7c-stop-monotonicity.mjs";
fs.writeFileSync(helperPath, [
  "const EPSILON = 1e-9;",
  "",
  "function normalizeSide(side) {",
  "  const normalized = String(side ?? \"\").trim().toUpperCase();",
  "  return normalized === \"BUY\" || normalized === \"SELL\" ? normalized : null;",
  "}",
  "",
  "export function stopStrictlyTightens(side, currentStop, candidateStop) {",
  "  const normalizedSide = normalizeSide(side);",
  "  const current = Number(currentStop);",
  "  const candidate = Number(candidateStop);",
  "  if (!normalizedSide || !(candidate > 0)) return false;",
  "  if (!(current > 0)) return true;",
  "  return normalizedSide === \"BUY\"",
  "    ? candidate > current + EPSILON",
  "    : candidate < current - EPSILON;",
  "}",
  "",
  "export function stopIsAtLeastAsTight(side, currentStop, requiredStop) {",
  "  const normalizedSide = normalizeSide(side);",
  "  const current = Number(currentStop);",
  "  const required = Number(requiredStop);",
  "  if (!normalizedSide || !(current > 0) || !(required > 0)) return false;",
  "  return normalizedSide === \"BUY\"",
  "    ? current >= required - EPSILON",
  "    : current <= required + EPSILON;",
  "}",
  "",
].join("\n"), "utf8");

const sidewayLogicPath = "scripts/phase7c-sideway-logic.mjs";
let sidewayLogic = fs.readFileSync(sidewayLogicPath, "utf8");
sidewayLogic = replaceOnce(sidewayLogic, [
  "export function oneThirdPartialVolume(initialVolume, currentVolume, minVolume, step) {",
  "  const desired = normalizeVolume(initialVolume / 3, step);",
  "  if (desired < minVolume - 1e-9) return 0;",
  "  const remaining = normalizeVolume(currentVolume - desired, step);",
  "  if (remaining < minVolume - 1e-9) return 0;",
  "  return desired;",
  "}",
], [
  "export function oneThirdPartialVolume(initialVolume, currentVolume, minVolume, step) {",
  "  if (!(initialVolume > 0) || !(currentVolume > 0) || !(minVolume > 0) || !(step > 0)) return 0;",
  "  const rawThird = initialVolume / 3;",
  "  const rawUnits = rawThird / step;",
  "  if (Math.abs(rawUnits - Math.round(rawUnits)) > 1e-8) return 0;",
  "  const desired = normalizeVolume(rawThird, step);",
  "  if (Math.abs(desired - rawThird) > 1e-8 || desired < minVolume - 1e-9) return 0;",
  "  const remaining = normalizeVolume(currentVolume - desired, step);",
  "  if (remaining < minVolume - 1e-9) return 0;",
  "  return desired;",
  "}",
], "sideway exact one-third");
fs.writeFileSync(sidewayLogicPath, sidewayLogic, "utf8");

const trendPath = "scripts/run-phase7b-demo-controller.ts";
let trend = fs.readFileSync(trendPath, "utf8");
trend = replaceOnce(trend, [
  "import { canonicalHoldReason } from \"./phase7c-hold-observability.mjs\";",
], [
  "import { canonicalHoldReason } from \"./phase7c-hold-observability.mjs\";",
  "import {",
  "  stopIsAtLeastAsTight,",
  "  stopStrictlyTightens,",
  "} from \"./phase7c-stop-monotonicity.mjs\";",
], "trend monotonic helper import");
trend = replaceOnce(trend, [
  "  if (!managed.breakEvenApplied && favorable >= 6) {",
  "    managed.beAttempt += 1;",
  "    saveState();",
  "    const beStop = roundPrice(position.entry, spec.digits);",
  "    const commandId = `p7b-be-${managed.ticket}-${managed.beAttempt}`;",
  "    const response = await patch<CommandResponse>(`/v1/positions/${encodeURIComponent(managed.ticket)}`, {",
  "      stopLoss: beStop,",
  "      commandId,",
  "    });",
  "    if (response.success) {",
  "      managed.breakEvenApplied = true;",
  "      managed.lastStructuralStop = beStop;",
  "      saveState();",
  "      journal(\"PLUS6_SL_TO_ENTRY\", { ticket: managed.ticket, favorable, stopLoss: beStop, response });",
  "    } else {",
  "      journal(\"PLUS6_SL_REJECTED\", { ticket: managed.ticket, favorable, response });",
  "    }",
  "  }",
], [
  "  if (!managed.breakEvenApplied && favorable >= 6) {",
  "    const beStop = roundPrice(position.entry, spec.digits);",
  "    if (stopIsAtLeastAsTight(managed.side, Number(position.stopLoss), beStop)) {",
  "      managed.breakEvenApplied = true;",
  "      managed.lastStructuralStop = Number(position.stopLoss);",
  "      saveState();",
  "      journal(\"PLUS6_SL_ALREADY_AT_OR_TIGHTER\", {",
  "        ticket: managed.ticket,",
  "        favorable,",
  "        entry: beStop,",
  "        stopLoss: Number(position.stopLoss),",
  "      });",
  "    } else {",
  "      managed.beAttempt += 1;",
  "      saveState();",
  "      const commandId = `p7b-be-${managed.ticket}-${managed.beAttempt}`;",
  "      const response = await patch<CommandResponse>(`/v1/positions/${encodeURIComponent(managed.ticket)}`, {",
  "        stopLoss: beStop,",
  "        commandId,",
  "      });",
  "      if (response.success) {",
  "        managed.breakEvenApplied = true;",
  "        managed.lastStructuralStop = beStop;",
  "        saveState();",
  "        journal(\"PLUS6_SL_TO_ENTRY\", { ticket: managed.ticket, favorable, stopLoss: beStop, response });",
  "      } else {",
  "        journal(\"PLUS6_SL_REJECTED\", { ticket: managed.ticket, favorable, response });",
  "      }",
  "    }",
  "  }",
], "trend +6 BE monotonicity");
trend = replaceOnce(trend, [
  "  if (managed.partialApplied) {",
  "    const structure = latestConfirmedStructureStop(managed.side, m15, managed.signalTimestamp, latest.closeTime);",
  "    if (structure !== null && improvesStop(managed.side, position.stopLoss, structure)) {",
  "      const minimumGap = Math.max(spec.stopsLevelTicks, spec.freezeLevelTicks) * spec.point;",
  "      const validAgainstMarket = managed.side === \"BUY\"",
  "        ? structure < quote.bid - minimumGap",
  "        : structure > quote.ask + minimumGap;",
  "      if (validAgainstMarket) {",
  "        managed.structureAttempt += 1;",
  "        saveState();",
  "        const candidate = roundPrice(structure, spec.digits);",
  "        const commandId = `p7b-struct-${managed.ticket}-${latest.closeTime}-${managed.structureAttempt}`;",
  "        const response = await patch<CommandResponse>(`/v1/positions/${encodeURIComponent(managed.ticket)}`, {",
  "          stopLoss: candidate,",
  "          commandId,",
  "        });",
  "        if (response.success) {",
  "          managed.lastStructuralStop = candidate;",
  "          saveState();",
  "          journal(\"STRUCTURAL_SL_TIGHTEN\", { ticket: managed.ticket, stopLoss: candidate, m15CloseTime: latest.closeTime, response });",
  "        } else {",
  "          journal(\"STRUCTURAL_SL_REJECTED\", { ticket: managed.ticket, stopLoss: candidate, response });",
  "        }",
  "      }",
  "    }",
], [
  "  if (managed.partialApplied) {",
  "    const structure = latestConfirmedStructureStop(managed.side, m15, managed.signalTimestamp, latest.closeTime);",
  "    if (structure !== null) {",
  "      const candidate = roundPrice(structure, spec.digits);",
  "      if (stopStrictlyTightens(managed.side, Number(position.stopLoss), candidate)) {",
  "        const minimumGap = Math.max(spec.stopsLevelTicks, spec.freezeLevelTicks) * spec.point;",
  "        const validAgainstMarket = managed.side === \"BUY\"",
  "          ? candidate < quote.bid - minimumGap",
  "          : candidate > quote.ask + minimumGap;",
  "        if (validAgainstMarket) {",
  "          managed.structureAttempt += 1;",
  "          saveState();",
  "          const commandId = `p7b-struct-${managed.ticket}-${latest.closeTime}-${managed.structureAttempt}`;",
  "          const response = await patch<CommandResponse>(`/v1/positions/${encodeURIComponent(managed.ticket)}`, {",
  "            stopLoss: candidate,",
  "            commandId,",
  "          });",
  "          if (response.success) {",
  "            managed.lastStructuralStop = candidate;",
  "            saveState();",
  "            journal(\"STRUCTURAL_SL_TIGHTEN\", { ticket: managed.ticket, stopLoss: candidate, m15CloseTime: latest.closeTime, response });",
  "          } else {",
  "            journal(\"STRUCTURAL_SL_REJECTED\", { ticket: managed.ticket, stopLoss: candidate, response });",
  "          }",
  "        }",
  "      }",
  "    }",
], "trend structural trailing monotonicity");
trend = replaceOnce(trend, [
  "function improvesStop(side: \"BUY\" | \"SELL\", current: number, candidate: number): boolean {",
  "  if (!(candidate > 0)) return false;",
  "  if (!(current > 0)) return true;",
  "  return side === \"BUY\" ? candidate > current + 1e-9 : candidate < current - 1e-9;",
  "}",
  "",
], [], "remove legacy improvesStop");
fs.writeFileSync(trendPath, trend, "utf8");

const sidewayPath = "scripts/run-phase7c-sideway-controller.mjs";
let sideway = fs.readFileSync(sidewayPath, "utf8");
sideway = replaceOnce(sideway, [
  "import { canonicalHoldReason } from \"./phase7c-hold-observability.mjs\";",
], [
  "import { canonicalHoldReason } from \"./phase7c-hold-observability.mjs\";",
  "import { stopIsAtLeastAsTight } from \"./phase7c-stop-monotonicity.mjs\";",
], "sideway monotonic helper import");
sideway = replaceOnce(sideway, [
  "  if (!managed.breakEvenApplied && favorable >= 6) {",
  "    const minimumGap = Math.max(Number(spec.stopsLevelTicks ?? 0), Number(spec.freezeLevelTicks ?? 0)) * Number(spec.point);",
  "    const valid = managed.side === \"BUY\"",
  "      ? managed.entry < Number(quote.bid) - minimumGap",
  "      : managed.entry > Number(quote.ask) + minimumGap;",
  "    if (valid) {",
  "      managed.breakEvenAttempt += 1;",
  "      saveState();",
  "      const response = await bridgeRequest(\"PATCH\", `/v1/positions/${encodeURIComponent(managed.ticket)}`, {",
  "        stopLoss: roundPrice(managed.entry, Number(spec.digits ?? 2)),",
  "        commandId: `p7c-sideway-plus6-be-${managed.ticket}-${managed.breakEvenAttempt}` ,",
  "      });",
  "      if (response.success) {",
  "        managed.breakEvenApplied = true;",
  "        saveState();",
  "        journal(\"PLUS6_SL_TO_ENTRY\", { ticket: managed.ticket, favorable, stopLoss: managed.entry });",
  "      } else {",
  "        journal(\"PLUS6_SL_REJECTED\", { ticket: managed.ticket, favorable, response });",
  "      }",
  "    }",
  "  }",
], [], "placeholder");

// Sideway block has no extra space before the commandId comma; use a second exact replacement from the untouched source when needed.
if (!sideway.includes("stopIsAtLeastAsTight(managed.side")) {
  sideway = fs.readFileSync(sidewayPath, "utf8");
  sideway = replaceOnce(sideway, [
    "import { canonicalHoldReason } from \"./phase7c-hold-observability.mjs\";",
  ], [
    "import { canonicalHoldReason } from \"./phase7c-hold-observability.mjs\";",
    "import { stopIsAtLeastAsTight } from \"./phase7c-stop-monotonicity.mjs\";",
  ], "sideway monotonic helper import retry");
  sideway = replaceOnce(sideway, [
    "  if (!managed.breakEvenApplied && favorable >= 6) {",
    "    const minimumGap = Math.max(Number(spec.stopsLevelTicks ?? 0), Number(spec.freezeLevelTicks ?? 0)) * Number(spec.point);",
    "    const valid = managed.side === \"BUY\"",
    "      ? managed.entry < Number(quote.bid) - minimumGap",
    "      : managed.entry > Number(quote.ask) + minimumGap;",
    "    if (valid) {",
    "      managed.breakEvenAttempt += 1;",
    "      saveState();",
    "      const response = await bridgeRequest(\"PATCH\", `/v1/positions/${encodeURIComponent(managed.ticket)}`, {",
    "        stopLoss: roundPrice(managed.entry, Number(spec.digits ?? 2)),",
    "        commandId: `p7c-sideway-plus6-be-${managed.ticket}-${managed.breakEvenAttempt}` ,",
    "      });",
    "      if (response.success) {",
    "        managed.breakEvenApplied = true;",
    "        saveState();",
    "        journal(\"PLUS6_SL_TO_ENTRY\", { ticket: managed.ticket, favorable, stopLoss: managed.entry });",
    "      } else {",
    "        journal(\"PLUS6_SL_REJECTED\", { ticket: managed.ticket, favorable, response });",
    "      }",
    "    }",
    "  }",
  ], [], "sideway placeholder retry");
}
