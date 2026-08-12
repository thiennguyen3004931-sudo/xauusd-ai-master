import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const required = [
  "frozenM15",
  "frozenM5",
  "freshM15",
  "freshM5",
  "freshMeta",
  "outM15",
  "outM5",
  "outMeta",
  "cutoff",
];
for (const key of required) {
  if (!args[key]) throw new Error(`Missing required argument --${key}`);
}

const cutoff = Date.parse(args.cutoff);
if (!Number.isFinite(cutoff)) throw new Error(`Invalid cutoff: ${args.cutoff}`);

const frozenM15 = readArray(args.frozenM15);
const frozenM5 = readArray(args.frozenM5);
const freshM15 = readArray(args.freshM15);
const freshM5 = readArray(args.freshM5);
const freshMeta = JSON.parse(fs.readFileSync(path.resolve(args.freshMeta), "utf8"));

const mergedM15 = mergeBars(frozenM15, freshM15, cutoff, 15 * 60_000, "M15");
const mergedM5 = mergeBars(frozenM5, freshM5, cutoff, 5 * 60_000, "M5");

writeJson(args.outM15, mergedM15.bars);
writeJson(args.outM5, mergedM5.bars);

const outMeta = {
  ...freshMeta,
  m15Count: mergedM15.bars.length,
  m5Count: mergedM5.bars.length,
  phase5ForwardMerge: {
    cutoffUtc: new Date(cutoff).toISOString(),
    frozenM15Kept: mergedM15.frozenKept,
    frozenM5Kept: mergedM5.frozenKept,
    freshM15Appended: mergedM15.freshAppended,
    freshM5Appended: mergedM5.freshAppended,
    latestM15CloseUtc: isoOrNone(mergedM15.latestClose),
    latestM5CloseUtc: isoOrNone(mergedM5.latestClose),
  },
};
writeJson(args.outMeta, outMeta);

console.log(`PHASE5_MERGE_CUTOFF=${new Date(cutoff).toISOString()}`);
console.log(`PHASE5_MERGE_FROZEN_M15_KEPT=${mergedM15.frozenKept}`);
console.log(`PHASE5_MERGE_FROZEN_M5_KEPT=${mergedM5.frozenKept}`);
console.log(`PHASE5_MERGE_FRESH_M15_APPENDED=${mergedM15.freshAppended}`);
console.log(`PHASE5_MERGE_FRESH_M5_APPENDED=${mergedM5.freshAppended}`);
console.log(`PHASE5_MERGE_LATEST_M15_CLOSE=${isoOrNone(mergedM15.latestClose)}`);
console.log(`PHASE5_MERGE_LATEST_M5_CLOSE=${isoOrNone(mergedM5.latestClose)}`);

if (mergedM5.freshAppended === 0 || mergedM5.latestClose <= cutoff) {
  console.log("PHASE5_MERGE_FRESHNESS=FAIL");
  throw new Error(
    "No M5 bar strictly after the Phase 5 cutoff. MT5 forward data is not fresh enough yet.",
  );
}

console.log("PHASE5_MERGE_FRESHNESS=PASS");
console.log("PHASE5_MERGE_STATUS=PASS");

function mergeBars(frozen, fresh, cutoffMs, timeframeMs, label) {
  const frozenBefore = frozen.filter(
    (bar) => barCloseTime(bar, timeframeMs) <= cutoffMs,
  );
  const freshAfter = fresh.filter(
    (bar) => barCloseTime(bar, timeframeMs) > cutoffMs,
  );

  const byOpen = new Map();
  for (const bar of frozenBefore) {
    byOpen.set(barOpenTime(bar), bar);
  }
  for (const bar of freshAfter) {
    byOpen.set(barOpenTime(bar), bar);
  }

  const bars = [...byOpen.values()].sort(
    (a, b) => barOpenTime(a) - barOpenTime(b),
  );
  if (bars.length === 0) throw new Error(`${label} merge produced no bars.`);

  const latestClose = Math.max(...bars.map((bar) => barCloseTime(bar, timeframeMs)));
  return {
    bars,
    frozenKept: frozenBefore.length,
    freshAppended: freshAfter.length,
    latestClose,
  };
}

function barOpenTime(bar) {
  const raw = firstDefined(
    bar.openTime,
    bar.open_time,
    bar.openTimeMs,
    bar.time,
    bar.timestamp,
  );
  return normalizeTimestamp(raw, "bar open time");
}

function barCloseTime(bar, timeframeMs) {
  const explicit = firstDefined(
    bar.closeTime,
    bar.close_time,
    bar.closeTimeMs,
  );
  if (explicit !== undefined && explicit !== null) {
    return normalizeTimestamp(explicit, "bar close time");
  }
  return barOpenTime(bar) + timeframeMs;
}

function normalizeTimestamp(value, label) {
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return normalizeTimestamp(numeric, label);
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  throw new Error(`Unable to parse ${label}: ${String(value)}`);
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function readArray(file) {
  const resolved = path.resolve(file);
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`Expected JSON array: ${resolved}`);
  return parsed;
}

function writeJson(file, value) {
  const resolved = path.resolve(file);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function isoOrNone(value) {
  return Number.isFinite(value) ? new Date(value).toISOString() : "NONE";
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      result[key] = "true";
    } else {
      result[key] = value;
      index += 1;
    }
  }
  return result;
}
