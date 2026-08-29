import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sourcePath = path.resolve("scripts/apply-phase7c-hold-m15-dedupe-patch.mjs");
const source = fs.readFileSync(sourcePath, "utf8");
const before = '    "notifier state normalization",\n  );';
const after = '    "notifier state normalization",\n    3,\n  );';

const count = source.split(before).length - 1;
if (count !== 1) {
  throw new Error(`Expected one notifier normalization assertion, found ${count}`);
}

const tempPath = path.join(os.tmpdir(), `phase7c-hold-m15-patch-${process.pid}.mjs`);
fs.writeFileSync(tempPath, source.replace(before, after), "utf8");
try {
  await import(pathToFileURL(tempPath).href);
} finally {
  fs.rmSync(tempPath, { force: true });
}
