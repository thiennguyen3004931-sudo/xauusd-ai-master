import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const notifierPath = path.resolve("scripts/run-phase7b-telegram-notifier.mjs");
let source = fs.readFileSync(notifierPath, "utf8");

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function replaceOnce(label, before, after) {
  const matches = count(source, before);
  assert.equal(matches, 1, `${label}: expected exactly one source match, got ${matches}`);
  source = source.replace(before, after);
}

const entryStart = source.indexOf('  if (type === "ENTRY_FILLED") {');
const entryEnd = source.indexOf('  if (type === "PLUS6_SL_TO_ENTRY") {', entryStart);
assert.notEqual(entryStart, -1, "ENTRY_FILLED formatter block must exist");
assert.notEqual(entryEnd, -1, "PLUS6 formatter block must follow ENTRY_FILLED");
let entryBlock = source.slice(entryStart, entryEnd);

const nestedEntryLine = `          line(\n            "💵",\n            "Entry",`;
assert.equal(count(entryBlock, nestedEntryLine), 2, "Recovery and Sideway filled cards must expose Entry");
const nestedTicketLine = `          line(\n            "🎫",\n            "Ticket",\n            position.ticket ?? event.ticket,\n          ),\n`;
entryBlock = entryBlock.replaceAll(nestedEntryLine, `${nestedTicketLine}${nestedEntryLine}`);

const trendEntryLine = `        line(\n          "💵",\n          "Entry",`;
assert.equal(count(entryBlock, trendEntryLine), 1, "Trend filled card must expose Entry");
const trendTicketLine = `        line(\n          "🎫",\n          "Ticket",\n          position.ticket ?? event.ticket,\n        ),\n`;
entryBlock = entryBlock.replace(trendEntryLine, `${trendTicketLine}${trendEntryLine}`);

const sidewayHeader = `        \`\${side} SIDEWAY FILLED · \${symbol}\`,\n        [\n`;
assert.equal(count(entryBlock, sidewayHeader), 1, "Sideway filled card header must exist");
entryBlock = entryBlock.replace(
  sidewayHeader,
  `${sidewayHeader}          line("🤖", "Regime", "SIDEWAY"),\n`,
);

const trendHeader = `      \`\${side} FILLED · \${symbol}\`,\n      [\n`;
assert.equal(count(entryBlock, trendHeader), 1, "Trend filled card header must exist");
entryBlock = entryBlock.replace(
  trendHeader,
  `${trendHeader}        line("🤖", "Regime", "TREND"),\n`,
);

const nestedVolumeLabel = `            "Volume",`;
assert.equal(count(entryBlock, nestedVolumeLabel), 2, "Recovery and Sideway cards must use legacy Volume label before migration");
entryBlock = entryBlock.replaceAll(nestedVolumeLabel, `            "Lot",`);
const trendVolumeLabel = `          "Volume",`;
assert.equal(count(entryBlock, trendVolumeLabel), 1, "Trend card must use legacy Volume label before migration");
entryBlock = entryBlock.replace(trendVolumeLabel, `          "Lot",`);

const sidewayTp2 = `            event.management?.tp2,`;
assert.equal(count(entryBlock, sidewayTp2), 1, "Sideway TP2 formatter must exist");
entryBlock = entryBlock.replace(sidewayTp2, `            fmtPrice(event.management?.tp2),`);

const trendFvg = `        line(\n          "🧩",\n          "FVG",`;
assert.equal(count(entryBlock, trendFvg), 1, "Trend FVG line must exist");
entryBlock = entryBlock.replace(
  trendFvg,
  `        line("🎯", "TP", "RUNNER M15"),\n${trendFvg}`,
);

source = source.slice(0, entryStart) + entryBlock + source.slice(entryEnd);

replaceOnce(
  "persist Sideway TP2 in notifier trade state",
  `      stopLoss:\n        numberOrNull(\n          position.stopLoss,\n        ),\n\n      openedAt:`,
  `      stopLoss:\n        numberOrNull(\n          position.stopLoss,\n        ),\n\n      takeProfit:\n        recovery.active\n          ? recovery.takeProfit\n          : event.journalSource === "SIDEWAY"\n            ? numberOrNull(\n                event.management?.tp2 ??\n                position.takeProfit,\n              )\n            : null,\n\n      openedAt:`,
);

const compactStatsMarker = `function compactStats(metrics) {`;
replaceOnce(
  "canonical lifecycle context helper",
  compactStatsMarker,
  `function lifecycleRegime(event) {\n  return String(\n    state.trade?.source ??\n    event?.journalSource ??\n    "TREND",\n  ).toUpperCase() === "SIDEWAY"\n    ? "SIDEWAY"\n    : "TREND";\n}\n\nfunction lifecycleTakeProfit(event) {\n  const recovery = recoveryMetadata(event);\n  if (recovery.active) {\n    return fmtPrice(recovery.takeProfit);\n  }\n\n  if (lifecycleRegime(event) === "SIDEWAY") {\n    return fmtPrice(\n      event?.management?.tp2 ??\n      event?.lastKnownState?.tp2 ??\n      state.trade?.takeProfit ??\n      event?.position?.takeProfit,\n    );\n  }\n\n  return "RUNNER M15";\n}\n\nfunction lifecycleContextLines(event, enrichment) {\n  const position = event?.position ?? {};\n  const metrics = enrichment?.metrics ?? {};\n  const ticket = String(\n    event?.ticket ??\n    position?.ticket ??\n    state.trade?.ticket ??\n    "—",\n  );\n  const entry = numberOrNull(\n    position?.entry ??\n    event?.fillPrice ??\n    metrics?.entry ??\n    state.trade?.entry,\n  );\n  const stopLoss = numberOrNull(\n    event?.stopLoss ??\n    position?.stopLoss ??\n    metrics?.stopLoss ??\n    state.trade?.stopLoss,\n  );\n  const lot = numberOrNull(\n    event?.remainingVolume ??\n    position?.volume ??\n    metrics?.volume ??\n    state.trade?.remainingVolume ??\n    state.trade?.initialVolume,\n  );\n\n  return [\n    line("🤖", "Regime", lifecycleRegime(event)),\n    line("🎫", "Ticket", ticket),\n    line("💵", "Entry", fmtPrice(entry)),\n    line("🛡", "SL", fmtPrice(stopLoss)),\n    line("🎯", "TP", lifecycleTakeProfit(event)),\n    line("📦", "Lot", \`\${value(lot)} lot\`),\n  ];\n}\n\n${compactStatsMarker}`,
);

const contextTargets = [
  [
    "BE context",
    `      "+6 → BE",\n      [\n`,
    `      "+6 → BE",\n      [\n        ...lifecycleContextLines(event, enrichment),\n`,
  ],
  [
    "partial context",
    `      "CHỐT 1/3",\n      [\n`,
    `      "CHỐT 1/3",\n      [\n        ...lifecycleContextLines(event, enrichment),\n`,
  ],
  [
    "legacy Sideway partial context",
    `      "SIDEWAY TP1 · CHỐT 1/3",\n      [\n`,
    `      "SIDEWAY TP1 · CHỐT 1/3",\n      [\n        ...lifecycleContextLines(event, enrichment),\n`,
  ],
  [
    "legacy Sideway BE context",
    `      "SIDEWAY · BREAK EVEN",\n      [\n`,
    `      "SIDEWAY · BREAK EVEN",\n      [\n        ...lifecycleContextLines(event, enrichment),\n`,
  ],
  [
    "HOLD context",
    `      "HOLD CONFIRMED",\n      [\n`,
    `      "HOLD CONFIRMED",\n      [\n        ...lifecycleContextLines(event, enrichment),\n`,
  ],
  [
    "structural SL context",
    `      "TRAIL SL",\n      [\n`,
    `      "TRAIL SL",\n      [\n        ...lifecycleContextLines(event, enrichment),\n`,
  ],
  [
    "Recovery EXIT context",
    `          : "RECOVERY TRADE CLOSED",\n        [\n`,
    `          : "RECOVERY TRADE CLOSED",\n        [\n          ...lifecycleContextLines(event, enrichment),\n`,
  ],
  [
    "native EXIT context",
    `        : "CHỐT LỆNH",\n      [\n`,
    `        : "CHỐT LỆNH",\n      [\n        ...lifecycleContextLines(event, enrichment),\n`,
  ],
];

for (const [label, before, after] of contextTargets) {
  replaceOnce(label, before, after);
}

fs.writeFileSync(notifierPath, source, "utf8");
console.log("PHASE7C_TELEGRAM_LIFECYCLE_APPLY=PASS");
console.log("RUNTIME_MUTATION=NONE");
console.log("ORDER_MUTATION=NONE");
