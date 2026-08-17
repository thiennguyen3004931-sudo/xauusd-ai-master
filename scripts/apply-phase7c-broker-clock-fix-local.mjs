import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");
const root = process.cwd();
const sidewayPath = path.join(root, "scripts", "run-phase7c-sideway-controller.mjs");
const trendPath = path.join(root, "scripts", "run-phase7b-demo-controller.ts");

for (const target of [sidewayPath, trendPath]) {
  if (!fs.existsSync(target)) throw new Error(`Required controller not found: ${target}`);
}

const patches = [
  {
    file: sidewayPath,
    label: "SIDEWAY_IMPORT_CLOCK_HELPERS",
    before: `import {\n  evaluateTimestampFreshness,\n  validateAutoLotSnapshot,\n} from "./phase7c-sideway-execution-guards.mjs";`,
    after: `import {\n  evaluateTimestampFreshness,\n  inferBrokerClockOffset,\n  normalizeBrokerTimestamp,\n  validateAutoLotSnapshot,\n} from "./phase7c-sideway-execution-guards.mjs";`,
  },
  {
    file: sidewayPath,
    label: "SIDEWAY_CLOCK_INFERENCE",
    before: `  const [positions, quote, spec] = await Promise.all([\n    bridgeGet(\`/v1/positions?symbol=\${encodeURIComponent(symbol)}\`),\n    bridgeGet(\`/v1/quotes/\${encodeURIComponent(symbol)}\`),\n    bridgeGet(\`/v1/symbols/\${encodeURIComponent(symbol)}/spec\`),\n  ]);\n\n  if (!Array.isArray(positions)) {`,
    after: `  const [positions, quote, spec] = await Promise.all([\n    bridgeGet(\`/v1/positions?symbol=\${encodeURIComponent(symbol)}\`),\n    bridgeGet(\`/v1/quotes/\${encodeURIComponent(symbol)}\`),\n    bridgeGet(\`/v1/symbols/\${encodeURIComponent(symbol)}/spec\`),\n  ]);\n\n  const brokerClockOffsetMs = inferBrokerClockOffset(quote?.timestamp, {\n    systemTimestamp: health.timestamp,\n  });\n  if (brokerClockOffsetMs === null) {\n    journal("BROKER_CLOCK_OFFSET_BLOCK", {\n      healthTimestamp: health.timestamp ?? null,\n      quoteTimestamp: quote?.timestamp ?? null,\n      reason: "BROKER_CLOCK_NOT_PLAUSIBLE_WHOLE_HOUR_OFFSET",\n    });\n    return;\n  }\n\n  if (!Array.isArray(positions)) {`,
  },
  {
    file: sidewayPath,
    label: "SIDEWAY_PENDING_RECOVERY_CLOCK",
    before: `    const recovery = matchPendingEntryPosition(pending, positions, spec);`,
    after: `    const recovery = matchPendingEntryPosition(pending, positions, spec, Date.now(), brokerClockOffsetMs);`,
  },
  {
    file: sidewayPath,
    label: "SIDEWAY_RECOVERED_MANAGED_CLOCK",
    before: `      state.managed = buildManagedState(recovery.position, pending);`,
    after: `      state.managed = buildManagedState(recovery.position, pending, brokerClockOffsetMs);`,
  },
  {
    file: sidewayPath,
    label: "SIDEWAY_NEW_MANAGED_CLOCK",
    before: `  state.managed = buildManagedState(opened, state.pendingEntry);`,
    after: `  state.managed = buildManagedState(opened, state.pendingEntry, brokerClockOffsetMs);`,
  },
  {
    file: sidewayPath,
    label: "SIDEWAY_MANAGED_TIME_NORMALIZATION",
    before: `function buildManagedState(opened, pending) {\n  if (!pending) throw new Error("Cannot build Sideway management state without durable pending entry metadata.");\n  const openedAt = Number.isFinite(Number(opened.openedAt)) ? Number(opened.openedAt) : Date.now();`,
    after: `function buildManagedState(opened, pending, brokerClockOffsetMs = 0) {\n  if (!pending) throw new Error("Cannot build Sideway management state without durable pending entry metadata.");\n  const brokerOpenedAt = Number(opened.openedAt);\n  const normalizedOpenedAt = normalizeBrokerTimestamp(brokerOpenedAt, brokerClockOffsetMs);\n  const openedAt = Number.isFinite(normalizedOpenedAt) ? normalizedOpenedAt : Date.now();`,
  },
  {
    file: trendPath,
    label: "TREND_SIGNAL_EXPIRY_BROKER_CLOCK",
    before: `  const now = Date.now();\n  if (now > signal.signalTimestamp + 15 * 60_000) {`,
    after: `  const now = Number(quote.timestamp);\n  if (!Number.isFinite(now)) {\n    journal("QUOTE_TIMESTAMP_INVALID", { quoteTimestamp: quote.timestamp });\n    return;\n  }\n  if (now > signal.signalTimestamp + 15 * 60_000) {`,
  },
  {
    file: trendPath,
    label: "TREND_PARTIAL_ACTIVATION_BROKER_CLOCK",
    before: `        managed.partialActivatedAt = Date.now();`,
    after: `        managed.partialActivatedAt = Number(quote.timestamp);`,
  },
];

const byFile = new Map();
for (const patch of patches) {
  if (!byFile.has(patch.file)) byFile.set(patch.file, []);
  byFile.get(patch.file).push(patch);
}

let changesNeeded = 0;
for (const [file, filePatches] of byFile) {
  let source = fs.readFileSync(file, "utf8");
  const original = source;

  for (const patch of filePatches) {
    if (source.includes(patch.after)) {
      console.log(`PHASE7C_BROKER_CLOCK_PATCH=${patch.label}|ALREADY_APPLIED`);
      continue;
    }
    const count = countOccurrences(source, patch.before);
    if (count !== 1) {
      throw new Error(`${patch.label}: expected exactly one source anchor, found ${count}. Refusing to modify ${file}.`);
    }
    console.log(`PHASE7C_BROKER_CLOCK_PATCH=${patch.label}|${apply ? "APPLY" : "NEEDED"}`);
    source = source.replace(patch.before, patch.after);
    changesNeeded += 1;
  }

  if (apply && source !== original) {
    const backup = `${file}.broker-clock.bak`;
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, "utf8");
    fs.writeFileSync(file, source, "utf8");
    console.log(`PHASE7C_BROKER_CLOCK_FILE_UPDATED=${file}`);
    console.log(`PHASE7C_BROKER_CLOCK_BACKUP=${backup}`);
  }
}

console.log(`PHASE7C_BROKER_CLOCK_PATCH_MODE=${apply ? "APPLY" : "CHECK_ONLY"}`);
console.log(`PHASE7C_BROKER_CLOCK_CHANGES_NEEDED=${changesNeeded}`);
if (!apply && changesNeeded > 0) {
  console.log("PHASE7C_BROKER_CLOCK_NEXT=node scripts/apply-phase7c-broker-clock-fix-local.mjs --apply");
}
if (apply) {
  console.log("PHASE7C_BROKER_CLOCK_PATCH_RESULT=PASS");
}

function countOccurrences(source, needle) {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(needle, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + needle.length;
  }
}
