import fs from "node:fs";

const file = "scripts/run-phase7b-demo-controller.ts";
let source = fs.readFileSync(file, "utf8");

function replaceOnce(oldText, newText, label) {
  const first = source.indexOf(oldText);
  if (first < 0) throw new Error(`PATCH_TARGET_MISSING:${label}`);
  if (source.indexOf(oldText, first + oldText.length) >= 0) throw new Error(`PATCH_TARGET_NOT_UNIQUE:${label}`);
  source = source.slice(0, first) + newText + source.slice(first + oldText.length);
}

replaceOnce(
  'import { canonicalHoldReason } from "./phase7c-hold-observability.mjs";\n',
  'import { canonicalHoldReason } from "./phase7c-hold-observability.mjs";\nimport { buildFixedTpSnapshot } from "./phase7c-fixed-tp.mjs";\n',
  "fixed-tp-import",
);

replaceOnce(
  '  stopDistance: number;\n  breakEvenApplied: boolean;',
  '  stopDistance: number;\n  fixedTpEnabled: boolean;\n  fixedTpDistance: number;\n  fixedTpPrice: number | null;\n  breakEvenApplied: boolean;',
  "managed-type",
);

replaceOnce(
  '  stopLoss: number;\n  takeProfit: number;\n  createdAt: number;',
  '  stopLoss: number;\n  takeProfit: number;\n  fixedTpEnabled: boolean;\n  fixedTpDistance: number;\n  fixedTpPrice: number | null;\n  createdAt: number;',
  "pending-type",
);

replaceOnce(
  'const fixedVolume = Number(process.env.ZIQ_FIXED_VOLUME ?? "0.03");\n',
  'const fixedVolume = Number(process.env.ZIQ_FIXED_VOLUME ?? "0.03");\nconst trendFixedTpEnabled = /^(1|true|yes|on)$/i.test(process.env.ZIQ_PHASE7C_TREND_FIXED_TP_ENABLED ?? "false");\nconst trendFixedTpDistance = Number(process.env.ZIQ_PHASE7C_TREND_FIXED_TP_DISTANCE ?? "0");\n',
  "runtime-config",
);

replaceOnce(
  'if (fixedVolume < 0.03 - 1e-9 || fixedVolume > MAX_TREND_FIXED_VOLUME + 1e-9) {\n  throw new Error(`Phase 7B DEMO fixed volume must be between 0.03 and ${MAX_TREND_FIXED_VOLUME}.`);\n}\n',
  'if (fixedVolume < 0.03 - 1e-9 || fixedVolume > MAX_TREND_FIXED_VOLUME + 1e-9) {\n  throw new Error(`Phase 7B DEMO fixed volume must be between 0.03 and ${MAX_TREND_FIXED_VOLUME}.`);\n}\nif (!Number.isFinite(trendFixedTpDistance) || trendFixedTpDistance < 0 || (trendFixedTpEnabled && trendFixedTpDistance <= 0)) {\n  throw new Error("Phase 7B Trend Fixed TP distance must be finite and positive when enabled.");\n}\n',
  "runtime-validation",
);

replaceOnce(
  'console.log("PHASE7B_DEMO_FIXED_TP=OFF_IN_TREND");',
  'console.log(`PHASE7B_DEMO_FIXED_TP=${trendFixedTpEnabled ? `ON|DISTANCE=${trendFixedTpDistance}` : "OFF"}`);',
  "runtime-log",
);

replaceOnce(
  '  const pendingEntry: PendingTrendEntry = {\n',
  '  const fixedTpSnapshot = buildFixedTpSnapshot({\n    enabled: trendFixedTpEnabled,\n    distance: trendFixedTpDistance,\n    side: signal.side,\n    entry: marketEntry,\n  });\n\n  const pendingEntry: PendingTrendEntry = {\n',
  "pending-snapshot-build",
);

replaceOnce(
  '    stopLoss,\n    takeProfit,\n    createdAt: Date.now(),',
  '    stopLoss,\n    takeProfit,\n    fixedTpEnabled: fixedTpSnapshot.enabled,\n    fixedTpDistance: fixedTpSnapshot.distance,\n    fixedTpPrice: fixedTpSnapshot.targetPrice,\n    createdAt: Date.now(),',
  "pending-snapshot-fields",
);

replaceOnce(
  '  state.managed = {\n    ticket: opened.ticket,',
  '  const filledFixedTpSnapshot = buildFixedTpSnapshot({\n    enabled: pendingEntry.fixedTpEnabled,\n    distance: pendingEntry.fixedTpDistance,\n    side: pendingEntry.side,\n    entry: opened.entry,\n  });\n\n  state.managed = {\n    ticket: opened.ticket,',
  "filled-snapshot-build",
);

replaceOnce(
  '    stopDistance,\n    breakEvenApplied: false,',
  '    stopDistance,\n    fixedTpEnabled: filledFixedTpSnapshot.enabled,\n    fixedTpDistance: filledFixedTpSnapshot.distance,\n    fixedTpPrice: filledFixedTpSnapshot.targetPrice,\n    breakEvenApplied: false,',
  "filled-managed-fields",
);

replaceOnce(
  'function managedFromPending(\n  pending: PendingTrendEntry,\n  position: Position,\n): ManagedState {\n  return {',
  'function managedFromPending(\n  pending: PendingTrendEntry,\n  position: Position,\n): ManagedState {\n  const fixedTpSnapshot = buildFixedTpSnapshot({\n    enabled: pending.fixedTpEnabled,\n    distance: pending.fixedTpDistance,\n    side: pending.side,\n    entry: position.entry,\n  });\n  return {',
  "recovery-snapshot-build",
);

replaceOnce(
  '    stopDistance: pending.stopDistance,\n    breakEvenApplied: false,',
  '    stopDistance: pending.stopDistance,\n    fixedTpEnabled: pending.fixedTpEnabled,\n    fixedTpDistance: pending.fixedTpDistance,\n    fixedTpPrice: fixedTpSnapshot.targetPrice,\n    breakEvenApplied: false,',
  "recovery-managed-fields",
);

replaceOnce(
  'function loadState(file: string): BotState {\n',
  'function loadState(file: string): BotState {\n  const normalizePendingEntry = (raw: PendingTrendEntry | null | undefined): PendingTrendEntry | null => {\n    if (!raw) return null;\n    const distance = Number(raw.fixedTpDistance);\n    const price = Number(raw.fixedTpPrice);\n    const fixedTpEnabled = raw.fixedTpEnabled === true && Number.isFinite(distance) && distance > 0 && Number.isFinite(price);\n    return {\n      ...raw,\n      fixedTpEnabled: fixedTpEnabled ? true : false,\n      fixedTpDistance: fixedTpEnabled ? distance : 0,\n      fixedTpPrice: fixedTpEnabled ? price : null,\n    };\n  };\n  const normalizeManagedState = (raw: ManagedState | null | undefined): ManagedState | null => {\n    if (!raw) return null;\n    const distance = Number(raw.fixedTpDistance);\n    const price = Number(raw.fixedTpPrice);\n    const fixedTpEnabled = raw.fixedTpEnabled === true && Number.isFinite(distance) && distance > 0 && Number.isFinite(price);\n    return {\n      ...raw,\n      fixedTpEnabled: fixedTpEnabled ? true : false,\n      fixedTpDistance: fixedTpEnabled ? distance : 0,\n      fixedTpPrice: fixedTpEnabled ? price : null,\n    };\n  };\n',
  "state-normalizers",
);

source = source.replace('managed: parsed.managed ?? null,', 'managed: normalizeManagedState(parsed.managed),');
source = source.replace('pendingEntry: parsed.pendingEntry ?? null,', 'pendingEntry: normalizePendingEntry(parsed.pendingEntry),');
if (!source.includes('managed: normalizeManagedState(parsed.managed),')) throw new Error('PATCH_TARGET_MISSING:managed-normalization');
if (!source.includes('pendingEntry: normalizePendingEntry(parsed.pendingEntry),')) throw new Error('PATCH_TARGET_MISSING:pending-normalization');

fs.writeFileSync(file, source, "utf8");
console.log("TREND_FIXED_TP_SNAPSHOT_PATCH=APPLIED");
