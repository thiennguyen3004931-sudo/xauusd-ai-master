import fs from "node:fs";
import path from "node:path";

const target = path.resolve("scripts/apply-phase7c-broker-clock-fix-local.mjs");
const source = fs.readFileSync(target, "utf8");
const before = String.raw`const pattern = /import\s*\{([\s\S]*?)\}\s*from\s*(["'])\.\/phase7c-sideway-execution-guards\.mjs\2\s*;/g;`;
const after = String.raw`const pattern = /import\s*\{([^}]*)\}\s*from\s*(["'])\.\/phase7c-sideway-execution-guards\.mjs\2\s*;/g;`;

const count = source.split(before).length - 1;
if (count !== 1) {
  throw new Error(`BROKER_CLOCK_IMPORT_MATCHER_ANCHOR_COUNT=${count}`);
}

fs.writeFileSync(target, source.replace(before, after), "utf8");
console.log("BROKER_CLOCK_IMPORT_MATCHER_FIX=APPLIED");
console.log("RUNTIME_MUTATION=NONE");
console.log("ARM_CHANGE=NONE");
console.log("MODE_CHANGE=NONE");
console.log("ORDER_MUTATION=NONE");
console.log("BRIDGE_RESTART=NONE");
