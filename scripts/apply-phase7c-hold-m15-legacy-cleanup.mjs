import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function update(pathname, transform) {
  const file = path.join(root, pathname);
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (after === before) {
    throw new Error(`No legacy cleanup produced for ${pathname}`);
  }
  fs.writeFileSync(file, after, "utf8");
}

function removeExactCount(source, regex, expected, label) {
  const matches = source.match(regex) ?? [];
  if (matches.length !== expected) {
    throw new Error(`${label}: expected ${expected} matches, found ${matches.length}`);
  }
  return source.replace(regex, "");
}

update("scripts/run-phase7b-telegram-notifier.mjs", (input) => {
  let source = input;
  source = removeExactCount(
    source,
    /^\s*holdSentKeys:\s*\{\},\r?\n/gm,
    2,
    "notifier holdSentKeys state fields",
  );
  source = removeExactCount(
    source,
    /^state\.holdSentKeys \?\?= \{\};\r?\n/gm,
    1,
    "notifier holdSentKeys normalization",
  );
  if (/\bholdSentKeys\b/.test(source)) {
    throw new Error("notifier holdSentKeys legacy remains after cleanup");
  }
  return source;
});

for (const pathname of [
  "scripts/run-phase7b-demo-controller.ts",
  "scripts/run-phase7c-sideway-controller.mjs",
]) {
  update(pathname, (input) => {
    const source = removeExactCount(
      input,
      /^let lastHoldObservationKey = "";\r?\n/gm,
      1,
      `${pathname} lastHoldObservationKey declaration`,
    );
    if (/\blastHoldObservationKey\b/.test(source)) {
      throw new Error(`${pathname} lastHoldObservationKey legacy remains after cleanup`);
    }
    return source;
  });
}

console.log("PHASE7C_HOLD_M15_LEGACY_CLEANUP=APPLIED");
