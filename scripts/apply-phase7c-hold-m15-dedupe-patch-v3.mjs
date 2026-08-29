import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const originalPath = path.resolve("scripts/apply-phase7c-hold-m15-dedupe-patch.mjs");
let source = fs.readFileSync(originalPath, "utf8");

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  source = source.replace(before, after);
}

replaceOnce(
  '    "notifier state normalization",\n  );',
  '    "notifier state normalization",\n    3,\n  );',
  "notifier normalization harness",
);
replaceOnce(
  '    "trend HOLD key",\n    2,',
  '    "trend HOLD key",\n    1,',
  "trend HOLD key harness",
);
replaceOnce(
  '    "sideway HOLD key",\n    2,',
  '    "sideway HOLD key",\n    1,',
  "sideway HOLD key harness",
);

const tempPath = path.join(os.tmpdir(), `phase7c-hold-m15-patch-${process.pid}.mjs`);
fs.writeFileSync(tempPath, source, "utf8");
try {
  await import(pathToFileURL(tempPath).href);
} finally {
  fs.rmSync(tempPath, { force: true });
}

for (const controller of [
  "scripts/run-phase7b-demo-controller.ts",
  "scripts/run-phase7c-sideway-controller.mjs",
]) {
  const file = path.resolve(controller);
  const text = fs.readFileSync(file, "utf8");
  const legacy = '`${managed.ticket}|${hold.reasonCode}`';
  const replacement = '`${managed.ticket}|${hold.reasonCode}|${holdM15CloseTime}`';
  const count = text.split(legacy).length - 1;
  if (count !== 1) {
    throw new Error(`${controller}: expected one remaining indentation-variant HOLD key, found ${count}`);
  }
  fs.writeFileSync(file, text.replace(legacy, replacement), "utf8");
}

console.log("PHASE7C_HOLD_M15_PATCH_V3=APPLIED");
