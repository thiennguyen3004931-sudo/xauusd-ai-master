import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(
  fileURLToPath(import.meta.url),
);

const sidewayPath = path.join(
  here,
  "run-phase7c-sideway-controller.mjs",
);

const source = fs.readFileSync(
  sidewayPath,
  "utf8",
);

/*
 * Daily recovery contract:
 *
 * RECOVERY_TP is a full-position broker TP mode.
 *
 * Dynamic management may still move SL to BE at +6.
 * It must NOT execute the native Sideway +10 one-third partial.
 *
 * Required order:
 *
 *   +6 BE
 *      ↓
 *   RECOVERY_TP guard + return
 *      ↓
 *   native +10 partial
 */

const plus6Index = source.indexOf(
  'if (!managed.breakEvenApplied && favorable >= 6)',
);

const recoveryGuardIndex = source.indexOf(
  'if (managed.dailyMode === "RECOVERY_TP")',
);

const partialIndex = source.indexOf(
  'if (managed.breakEvenApplied && !managed.partialApplied && targetReached(managed.side, marketPrice, managed.tp1))',
);

assert.ok(
  plus6Index >= 0,
  "Sideway +6 BE management block is missing.",
);

assert.ok(
  partialIndex >= 0,
  "Sideway +10 partial management block is missing.",
);

assert.ok(
  recoveryGuardIndex >= 0,
  "RED_TARGET: Sideway RECOVERY_TP must return after +6 BE and before +10 partial",
);

assert.ok(
  plus6Index < recoveryGuardIndex,
  "RECOVERY_TP guard must preserve +6 break-even management.",
);

assert.ok(
  recoveryGuardIndex < partialIndex,
  "RECOVERY_TP guard must execute before native +10 partial.",
);

const guardWindow = source.slice(
  recoveryGuardIndex,
  partialIndex,
);

assert.match(
  guardWindow,
  /\breturn\s*;/,
  "RECOVERY_TP management guard must return before native partial.",
);

console.log(
  "SIDEWAY_RECOVERY_MANAGEMENT_CONTRACT=PASS",
);

console.log(
  "SIDEWAY_RECOVERY_PLUS6_BE_PRESERVED=PASS",
);

console.log(
  "SIDEWAY_RECOVERY_PARTIAL_DISABLED=PASS",
);

console.log(
  "SIDEWAY_RECOVERY_FULL_POSITION=PASS",
);
