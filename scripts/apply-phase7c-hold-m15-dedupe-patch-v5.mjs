import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const v4Path = path.resolve("scripts/apply-phase7c-hold-m15-dedupe-patch-v4.mjs");
let source = fs.readFileSync(v4Path, "utf8");

const before = `  source = replaceExact(\n    source,\n    \"  const quoteFreshness = evaluateTimestampFreshness(quote?.timestamp, { maxAgeMs: maxQuoteAgeMs, clockOffsetMs: brokerClockOffsetMs });\",\n    \"  const holdM15CloseTime = Number(managed.lastRegimeCloseChecked ?? 0);\\n\\n  const quoteFreshness = evaluateTimestampFreshness(quote?.timestamp, { maxAgeMs: maxQuoteAgeMs, clockOffsetMs: brokerClockOffsetMs });\",\n    \"sideway M15 identity\",\n  );`;

const after = `  source = replaceExact(\n    source,\n    \"    journal(\\\"MANAGEMENT_REGIME_CHECK_ERROR\\\", { ticket: managed.ticket, message: errorMessage(error) });\\n  }\\n\\n  const quoteFreshness = evaluateTimestampFreshness(quote?.timestamp, { maxAgeMs: maxQuoteAgeMs, clockOffsetMs: brokerClockOffsetMs });\",\n    \"    journal(\\\"MANAGEMENT_REGIME_CHECK_ERROR\\\", { ticket: managed.ticket, message: errorMessage(error) });\\n  }\\n\\n  const holdM15CloseTime = Number(managed.lastRegimeCloseChecked ?? 0);\\n\\n  const quoteFreshness = evaluateTimestampFreshness(quote?.timestamp, { maxAgeMs: maxQuoteAgeMs, clockOffsetMs: brokerClockOffsetMs });\",\n    \"sideway M15 identity\",\n  );`;

const count = source.split(before).length - 1;
if (count !== 1) {
  throw new Error(`sideway management scope harness: expected 1 match, found ${count}`);
}
source = source.replace(before, after);

const tempPath = path.join(os.tmpdir(), `phase7c-hold-m15-patch-v5-${process.pid}.mjs`);
fs.writeFileSync(tempPath, source, "utf8");
try {
  await import(pathToFileURL(tempPath).href);
} finally {
  fs.rmSync(tempPath, { force: true });
}

console.log("PHASE7C_HOLD_M15_PATCH_V5=APPLIED");
