import fs from "node:fs";

const file = "scripts/run-phase7b-demo-controller.ts";
const source = fs.readFileSync(file, "utf8");
const startMarker = "  const fastMove = fastMoveProfitLockCandidate({";
const endMarker = "\n\n  const hold =\n    canonicalHoldReason(";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0 || source.indexOf(startMarker, start + 1) >= 0) {
  throw new Error("Trend Fast-Move block anchor is not unique");
}
const block = source.slice(start, end);
if (block.includes("fastMoveStructure")) {
  throw new Error("Trend Fast-Move structure handoff is already present");
}
const gate = `  const fastMoveStructure = managed.partialApplied && latestM15\n    ? latestConfirmedStructureStop(managed.side, m15, managed.signalTimestamp, latestM15.closeTime)\n    : null;\n  if (fastMoveStructure === null) {\n`;
const replacement = `${gate}${block}\n  }`;
fs.writeFileSync(file, `${source.slice(0, start)}${replacement}${source.slice(end)}`, "utf8");
console.log("FAST_MOVE_TREND_STRUCTURE_HANDOFF_PATCH=APPLIED");
