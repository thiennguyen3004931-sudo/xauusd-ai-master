// Scoped-marker rerun for Task 6 source-only gate.
import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve("scripts", "run-phase7c-sideway-controller.mjs");
let source = fs.readFileSync(sourcePath, "utf8");

if (source.includes("function normalizePendingEntry(") || source.includes("ZIQ_PHASE7C_SIDEWAY_FIXED_TP_ENABLED")) {
  console.log("SIDEWAY_FIXED_TP_SNAPSHOT_PATCH=ALREADY_APPLIED");
  process.exit(0);
}

function replaceOnce(input, from, to, label) {
  const first = input.indexOf(from);
  if (first < 0) throw new Error(`Missing patch marker: ${label}`);
  if (input.indexOf(from, first + from.length) >= 0) {
    throw new Error(`Patch marker is not unique: ${label}`);
  }
  return input.slice(0, first) + to + input.slice(first + from.length);
}

source = replaceOnce(
  source,
  'import { createPhase7CDecisionAudit } from "./phase7c-decision-audit.mjs";\nimport { canonicalHoldReason } from "./phase7c-hold-observability.mjs";',
  'import { createPhase7CDecisionAudit } from "./phase7c-decision-audit.mjs";\nimport { buildFixedTpSnapshot } from "./phase7c-fixed-tp.mjs";\nimport { canonicalHoldReason } from "./phase7c-hold-observability.mjs";',
  "Fixed TP pure helper import",
);

source = replaceOnce(
  source,
  'const maxLot = rawMaxLot;\nconst minRegimeConfidence = clampNumber(process.env.ZIQ_PHASE7C_SIDEWAY_MIN_REGIME_CONFIDENCE, 60, 0, 100);',
  `const maxLot = rawMaxLot;\nconst sidewayFixedTpEnabled = truthy(process.env.ZIQ_PHASE7C_SIDEWAY_FIXED_TP_ENABLED);\nconst sidewayFixedTpDistance = Number(process.env.ZIQ_PHASE7C_SIDEWAY_FIXED_TP_DISTANCE ?? "0");\nif (\n  !Number.isFinite(sidewayFixedTpDistance) ||\n  sidewayFixedTpDistance < 0 ||\n  (sidewayFixedTpEnabled && sidewayFixedTpDistance <= 0)\n) {\n  throw new Error("Phase 7C Sideway Fixed TP distance must be finite and positive when enabled.");\n}\nconst minRegimeConfidence = clampNumber(process.env.ZIQ_PHASE7C_SIDEWAY_MIN_REGIME_CONFIDENCE, 60, 0, 100);`,
  "Sideway Fixed TP runtime configuration",
);

const versionGuardIndex = source.indexOf("const versionGuard = compareStrategyEntryConfigVersion(");
if (versionGuardIndex < 0) throw new Error("Missing patch marker: strategy entry version guard");
let pendingIndex = source.indexOf("state.pendingEntry = {", versionGuardIndex);
if (pendingIndex < 0) throw new Error("Missing patch marker: durable pending entry after version guard");
const snapshotBlock = `const fixedTpSnapshot = buildFixedTpSnapshot({\n    enabled: sidewayFixedTpEnabled,\n    distance: sidewayFixedTpDistance,\n    side,\n    entry: Number(finalPlan.entry),\n  });\n  journal("FIXED_TP_CONFIG_SNAPSHOT", {\n    strategy: "SIDEWAY",\n    orderId,\n    side,\n    entry: Number(finalPlan.entry),\n    fixedTpEnabled: fixedTpSnapshot.enabled,\n    fixedTpDistance: fixedTpSnapshot.distance,\n    fixedTpPrice: fixedTpSnapshot.targetPrice,\n  });\n\n  `;
source = source.slice(0, pendingIndex) + snapshotBlock + source.slice(pendingIndex);

pendingIndex = source.indexOf("state.pendingEntry = {", versionGuardIndex);
const pendingEnd = source.indexOf("\n  };", pendingIndex);
if (pendingEnd < 0) throw new Error("Missing patch marker: durable pending entry end");
let pendingBlock = source.slice(pendingIndex, pendingEnd);
pendingBlock = replaceOnce(
  pendingBlock,
  '    tp2: executionPlan.takeProfit,\n    dailyMode: dailyRecovery.mode,',
  '    tp2: executionPlan.takeProfit,\n    fixedTpEnabled: fixedTpSnapshot.enabled,\n    fixedTpDistance: fixedTpSnapshot.distance,\n    fixedTpPrice: fixedTpSnapshot.targetPrice,\n    dailyMode: dailyRecovery.mode,',
  "durable pending Fixed TP snapshot fields",
);
source = source.slice(0, pendingIndex) + pendingBlock + source.slice(pendingEnd);

source = replaceOnce(
  source,
  '  const openedAt = Number.isFinite(normalizedOpenedAt) ? normalizedOpenedAt : Date.now();\n  return {',
  `  const openedAt = Number.isFinite(normalizedOpenedAt) ? normalizedOpenedAt : Date.now();\n  const fixedTpSnapshot = buildFixedTpSnapshot({\n    enabled: pending.fixedTpEnabled,\n    distance: pending.fixedTpDistance,\n    side: pending.side,\n    entry: Number(opened.entry),\n  });\n  return {`,
  "managed Fixed TP actual-fill snapshot",
);

source = replaceOnce(
  source,
  '    tp2: Number(pending.tp2),\n    dailyMode: pending.dailyMode ?? "SIDEWAY_NATIVE",',
  '    tp2: Number(pending.tp2),\n    fixedTpEnabled: fixedTpSnapshot.enabled,\n    fixedTpDistance: fixedTpSnapshot.distance,\n    fixedTpPrice: fixedTpSnapshot.targetPrice,\n    dailyMode: pending.dailyMode ?? "SIDEWAY_NATIVE",',
  "managed Fixed TP snapshot fields",
);

const normalizers = `function normalizePendingEntry(raw) {\n  if (!raw || typeof raw !== "object") return null;\n  const distance = Number(raw.fixedTpDistance);\n  const price = Number(raw.fixedTpPrice);\n  const fixedTpEnabled =\n    raw.fixedTpEnabled === true &&\n    Number.isFinite(distance) &&\n    distance > 0 &&\n    Number.isFinite(price);\n  return {\n    ...raw,\n    fixedTpEnabled: fixedTpEnabled ? true : false,\n    fixedTpDistance: fixedTpEnabled ? distance : 0,\n    fixedTpPrice: fixedTpEnabled ? price : null,\n  };\n}\n\nfunction normalizeManagedState(raw) {\n  if (!raw || typeof raw !== "object") return null;\n  const distance = Number(raw.fixedTpDistance);\n  const price = Number(raw.fixedTpPrice);\n  const fixedTpEnabled =\n    raw.fixedTpEnabled === true &&\n    Number.isFinite(distance) &&\n    distance > 0 &&\n    Number.isFinite(price);\n  return {\n    ...raw,\n    fixedTpEnabled: fixedTpEnabled ? true : false,\n    fixedTpDistance: fixedTpEnabled ? distance : 0,\n    fixedTpPrice: fixedTpEnabled ? price : null,\n  };\n}\n\n`;
source = replaceOnce(
  source,
  "function loadState() {",
  normalizers + "function loadState() {",
  "legacy-safe Fixed TP state normalizers",
);

source = replaceOnce(
  source,
  '      pendingEntry: parsed.pendingEntry ?? null,\n      managed: parsed.managed ?? null,',
  '      pendingEntry: normalizePendingEntry(parsed.pendingEntry),\n      managed: normalizeManagedState(parsed.managed),',
  "loadState Fixed TP normalization",
);

fs.writeFileSync(sourcePath, source, "utf8");
console.log("SIDEWAY_FIXED_TP_SNAPSHOT_PATCH=APPLIED");
