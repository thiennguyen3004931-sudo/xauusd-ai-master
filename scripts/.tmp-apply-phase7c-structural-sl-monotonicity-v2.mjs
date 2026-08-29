import fs from "node:fs";

function insertAfterOnce(source, anchor, insertion, label) {
  const first = source.indexOf(anchor);
  if (first < 0) throw new Error(`${label}: anchor not found`);
  if (source.indexOf(anchor, first + anchor.length) >= 0) throw new Error(`${label}: anchor not unique`);
  const at = first + anchor.length;
  return source.slice(0, at) + insertion + source.slice(at);
}

function replaceSection(source, startAnchor, endAnchor, replacement, label) {
  const start = source.indexOf(startAnchor);
  if (start < 0) throw new Error(`${label}: start anchor not found`);
  if (source.indexOf(startAnchor, start + startAnchor.length) >= 0) throw new Error(`${label}: start anchor not unique`);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  if (end < 0) throw new Error(`${label}: end anchor not found`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function replaceExactOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: block not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: block not unique`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

fs.writeFileSync("scripts/phase7c-stop-monotonicity.mjs", `const EPSILON = 1e-9;

function normalizeSide(side) {
  const normalized = String(side ?? "").trim().toUpperCase();
  return normalized === "BUY" || normalized === "SELL" ? normalized : null;
}

export function stopStrictlyTightens(side, currentStop, candidateStop) {
  const normalizedSide = normalizeSide(side);
  const current = Number(currentStop);
  const candidate = Number(candidateStop);
  if (!normalizedSide || !(candidate > 0)) return false;
  if (!(current > 0)) return true;
  return normalizedSide === "BUY"
    ? candidate > current + EPSILON
    : candidate < current - EPSILON;
}

export function stopIsAtLeastAsTight(side, currentStop, requiredStop) {
  const normalizedSide = normalizeSide(side);
  const current = Number(currentStop);
  const required = Number(requiredStop);
  if (!normalizedSide || !(current > 0) || !(required > 0)) return false;
  return normalizedSide === "BUY"
    ? current >= required - EPSILON
    : current <= required + EPSILON;
}
`, "utf8");

const sidewayLogicPath = "scripts/phase7c-sideway-logic.mjs";
let sidewayLogic = fs.readFileSync(sidewayLogicPath, "utf8");
sidewayLogic = replaceExactOnce(
  sidewayLogic,
  `export function oneThirdPartialVolume(initialVolume, currentVolume, minVolume, step) {
  const desired = normalizeVolume(initialVolume / 3, step);
  if (desired < minVolume - 1e-9) return 0;
  const remaining = normalizeVolume(currentVolume - desired, step);
  if (remaining < minVolume - 1e-9) return 0;
  return desired;
}`,
  `export function oneThirdPartialVolume(initialVolume, currentVolume, minVolume, step) {
  if (!(initialVolume > 0) || !(currentVolume > 0) || !(minVolume > 0) || !(step > 0)) return 0;
  const rawThird = initialVolume / 3;
  const rawUnits = rawThird / step;
  if (Math.abs(rawUnits - Math.round(rawUnits)) > 1e-8) return 0;
  const desired = normalizeVolume(rawThird, step);
  if (Math.abs(desired - rawThird) > 1e-8 || desired < minVolume - 1e-9) return 0;
  const remaining = normalizeVolume(currentVolume - desired, step);
  if (remaining < minVolume - 1e-9) return 0;
  return desired;
}`,
  "sideway exact one-third",
);
fs.writeFileSync(sidewayLogicPath, sidewayLogic, "utf8");

const trendPath = "scripts/run-phase7b-demo-controller.ts";
let trend = fs.readFileSync(trendPath, "utf8");
trend = insertAfterOnce(
  trend,
  'import { canonicalHoldReason } from "./phase7c-hold-observability.mjs";\n',
  `import {
  stopIsAtLeastAsTight,
  stopStrictlyTightens,
} from "./phase7c-stop-monotonicity.mjs";
`,
  "trend helper import",
);
trend = replaceSection(
  trend,
  "  if (!managed.breakEvenApplied && favorable >= 6) {",
  '\n\n  if (managed.dailyMode === "RECOVERY_TP") {',
  `  if (!managed.breakEvenApplied && favorable >= 6) {
    const beStop = roundPrice(position.entry, spec.digits);
    if (stopIsAtLeastAsTight(managed.side, Number(position.stopLoss), beStop)) {
      managed.breakEvenApplied = true;
      managed.lastStructuralStop = Number(position.stopLoss);
      saveState();
      journal("PLUS6_SL_ALREADY_AT_OR_TIGHTER", {
        ticket: managed.ticket,
        favorable,
        entry: beStop,
        stopLoss: Number(position.stopLoss),
      });
    } else {
      managed.beAttempt += 1;
      saveState();
      const commandId = \`p7b-be-\${managed.ticket}-\${managed.beAttempt}\`;
      const response = await patch<CommandResponse>(\`/v1/positions/\${encodeURIComponent(managed.ticket)}\`, {
        stopLoss: beStop,
        commandId,
      });
      if (response.success) {
        managed.breakEvenApplied = true;
        managed.lastStructuralStop = beStop;
        saveState();
        journal("PLUS6_SL_TO_ENTRY", { ticket: managed.ticket, favorable, stopLoss: beStop, response });
      } else {
        journal("PLUS6_SL_REJECTED", { ticket: managed.ticket, favorable, response });
      }
    }
  }`,
  "trend +6 BE",
);
trend = replaceSection(
  trend,
  "  if (managed.partialApplied) {\n    const structure = latestConfirmedStructureStop(managed.side, m15, managed.signalTimestamp, latest.closeTime);",
  "\n\n    if (\n      managed.partialActivatedAt !== null &&",
  `  if (managed.partialApplied) {
    const structure = latestConfirmedStructureStop(managed.side, m15, managed.signalTimestamp, latest.closeTime);
    if (structure !== null) {
      const candidate = roundPrice(structure, spec.digits);
      if (stopStrictlyTightens(managed.side, Number(position.stopLoss), candidate)) {
        const minimumGap = Math.max(spec.stopsLevelTicks, spec.freezeLevelTicks) * spec.point;
        const validAgainstMarket = managed.side === "BUY"
          ? candidate < quote.bid - minimumGap
          : candidate > quote.ask + minimumGap;
        if (validAgainstMarket) {
          managed.structureAttempt += 1;
          saveState();
          const commandId = \`p7b-struct-\${managed.ticket}-\${latest.closeTime}-\${managed.structureAttempt}\`;
          const response = await patch<CommandResponse>(\`/v1/positions/\${encodeURIComponent(managed.ticket)}\`, {
            stopLoss: candidate,
            commandId,
          });
          if (response.success) {
            managed.lastStructuralStop = candidate;
            saveState();
            journal("STRUCTURAL_SL_TIGHTEN", { ticket: managed.ticket, stopLoss: candidate, m15CloseTime: latest.closeTime, response });
          } else {
            journal("STRUCTURAL_SL_REJECTED", { ticket: managed.ticket, stopLoss: candidate, response });
          }
        }
      }
    }`,
  "trend structural trailing",
);
trend = replaceExactOnce(
  trend,
  `function improvesStop(side: "BUY" | "SELL", current: number, candidate: number): boolean {
  if (!(candidate > 0)) return false;
  if (!(current > 0)) return true;
  return side === "BUY" ? candidate > current + 1e-9 : candidate < current - 1e-9;
}

`,
  "",
  "legacy improvesStop cleanup",
);
fs.writeFileSync(trendPath, trend, "utf8");

const sidewayPath = "scripts/run-phase7c-sideway-controller.mjs";
let sideway = fs.readFileSync(sidewayPath, "utf8");
sideway = insertAfterOnce(
  sideway,
  'import { canonicalHoldReason } from "./phase7c-hold-observability.mjs";\n',
  'import { stopIsAtLeastAsTight } from "./phase7c-stop-monotonicity.mjs";\n',
  "sideway helper import",
);
sideway = replaceSection(
  sideway,
  "  if (!managed.breakEvenApplied && favorable >= 6) {",
  '\n\n  if (managed.dailyMode === "RECOVERY_TP") {',
  `  if (!managed.breakEvenApplied && favorable >= 6) {
    const beStop = roundPrice(managed.entry, Number(spec.digits ?? 2));
    if (stopIsAtLeastAsTight(managed.side, Number(position.stopLoss), beStop)) {
      managed.breakEvenApplied = true;
      saveState();
      journal("PLUS6_SL_ALREADY_AT_OR_TIGHTER", {
        ticket: managed.ticket,
        favorable,
        entry: beStop,
        stopLoss: Number(position.stopLoss),
      });
    } else {
      const minimumGap = Math.max(Number(spec.stopsLevelTicks ?? 0), Number(spec.freezeLevelTicks ?? 0)) * Number(spec.point);
      const valid = managed.side === "BUY"
        ? beStop < Number(quote.bid) - minimumGap
        : beStop > Number(quote.ask) + minimumGap;
      if (valid) {
        managed.breakEvenAttempt += 1;
        saveState();
        const response = await bridgeRequest("PATCH", \`/v1/positions/\${encodeURIComponent(managed.ticket)}\`, {
          stopLoss: beStop,
          commandId: \`p7c-sideway-plus6-be-\${managed.ticket}-\${managed.breakEvenAttempt}\`,
        });
        if (response.success) {
          managed.breakEvenApplied = true;
          saveState();
          journal("PLUS6_SL_TO_ENTRY", { ticket: managed.ticket, favorable, stopLoss: beStop });
        } else {
          journal("PLUS6_SL_REJECTED", { ticket: managed.ticket, favorable, response });
        }
      }
    }
  }`,
  "sideway +6 BE",
);
fs.writeFileSync(sidewayPath, sideway, "utf8");

console.log("ATOMIC_STRUCTURAL_SL_PATCH=READY");
