import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const targets = [
  path.join(root, "scripts", "apply-phase7b-pattern-rule-v2-local.mjs"),
  path.join(root, "scripts", "finalize-phase7b-pattern-rule-v2-local.mjs"),
];

const broken = `  const openBrace = source.indexOf("{", start);\n  if (openBrace < 0) throw new Error(\`Opening brace for \${functionName} not found`;
const fixed = `  const tail = source.slice(start);\n  const bodyMatch = /\\|\\s*null\\s*\\{/.exec(tail);\n  if (!bodyMatch) throw new Error(\`Function body for \${functionName} not found`;

let changed = 0;
for (const file of targets) {
  let source = fs.readFileSync(file, "utf8");

  // Match both existing error-message variants used by the two scripts.
  const regex = /  const openBrace = source\.indexOf\("\{", start\);\r?\n  if \(openBrace < 0\) throw new Error\(`Opening brace for \$\{functionName\} not found(?: in \$\{file\})?\.`?\);/;
  const match = source.match(regex);
  if (!match) {
    if (source.includes("const bodyMatch = /\\|\\s*null\\s*\\{/")) {
      console.log(`PHASE7B_PATTERN_V2_PARSER_TARGET=${path.basename(file)}|ALREADY_FIXED`);
      continue;
    }
    throw new Error(`Broken parser block not found in ${file}`);
  }

  const replacement = [
    "  const tail = source.slice(start);",
    "  const bodyMatch = /\\|\\s*null\\s*\\{/.exec(tail);",
    "  if (!bodyMatch) throw new Error(`Function body for ${functionName} not found.`);",
    "  const openBrace = start + bodyMatch.index + bodyMatch[0].lastIndexOf(\"{\");",
  ].join("\n");

  source = source.replace(regex, replacement);
  fs.writeFileSync(file, source, "utf8");
  changed += 1;
  console.log(`PHASE7B_PATTERN_V2_PARSER_TARGET=${path.basename(file)}|FIXED`);
}

console.log("PHASE7B_PATTERN_V2_PARSER_REPAIR=PASS");
console.log(`PHASE7B_PATTERN_V2_PARSER_FILES_CHANGED=${changed}`);
