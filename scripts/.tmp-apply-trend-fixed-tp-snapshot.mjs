import fs from "node:fs";

const file = "scripts/run-phase7b-demo-controller.ts";
let source = fs.readFileSync(file, "utf8");
const oldText = "    managed: parsed.managed ?? null,\n";
const newText = "    managed: normalizeManagedState(parsed.managed),\n";
const first = source.indexOf(oldText);
if (first < 0) throw new Error("PATCH_TARGET_MISSING:v2-managed-normalization");
if (source.indexOf(oldText, first + oldText.length) >= 0) throw new Error("PATCH_TARGET_NOT_UNIQUE:v2-managed-normalization");
source = source.slice(0, first) + newText + source.slice(first + oldText.length);
fs.writeFileSync(file, source, "utf8");
console.log("TREND_FIXED_TP_V2_MANAGED_NORMALIZATION_PATCH=APPLIED");
