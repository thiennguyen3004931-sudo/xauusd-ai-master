import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(repoRoot, relativePath), content, "utf8");
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected source anchor not found`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: expected exactly one source anchor`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function addImport(source, anchor, statement, label) {
  if (source.includes(statement.trim())) return source;
  return replaceOnce(source, anchor, `${anchor}${statement}`, `${label} import`);
}

function migrateDailyAccounting(source, magicExpression, label) {
  const pattern = /  const botDeals = deals\.filter\([\s\S]*?\n  const dailyNetPnl = botDeals\.reduce\([\s\S]*?\n  \);\n/;
  const matches = source.match(new RegExp(pattern.source, "g")) ?? [];
  if (matches.length !== 1) {
    throw new Error(`${label}: expected exactly one legacy filter/reduce block, found ${matches.length}`);
  }

  const replacement = [
    "  const { dealCount, dailyNetPnl } =",
    "    summarizeBrokerDayRealizedPnl(",
    "      deals,",
    `      ${magicExpression},`,
    "    );",
    "",
  ].join("\n");

  const migrated = source
    .replace(pattern, replacement)
    .replaceAll("botDeals.length", "dealCount");

  if (/const\s+botDeals\s*=\s*deals\.filter\s*\(/.test(migrated)) {
    throw new Error(`${label}: legacy owned-deal filter remains`);
  }
  if (/const\s+dailyNetPnl\s*=\s*botDeals\.reduce\s*\(/.test(migrated)) {
    throw new Error(`${label}: legacy local P&L reduce remains`);
  }

  return migrated;
}

write(
  "packages/mt5-broker/src/accounting/broker-day-realized-pnl.ts",
  `export interface BrokerDayAccountingDeal {\n  isTradingDeal?: boolean;\n  magic?: number | string | null;\n  netPnl?: number | string | null;\n}\n\nexport interface BrokerDayRealizedPnlSummary {\n  dealCount: number;\n  dailyNetPnl: number;\n}\n\nexport function summarizeBrokerDayRealizedPnl(\n  deals: readonly BrokerDayAccountingDeal[],\n  systemMagicNumbers: Iterable<number>,\n): BrokerDayRealizedPnlSummary {\n  const ownedMagics = new Set(\n    Array.from(systemMagicNumbers, (magic) => Number(magic)),\n  );\n\n  let dealCount = 0;\n  let dailyNetPnl = 0;\n\n  for (const deal of deals) {\n    if (\n      deal.isTradingDeal !== true ||\n      !ownedMagics.has(Number(deal.magic))\n    ) {\n      continue;\n    }\n\n    dealCount += 1;\n    dailyNetPnl += Number(deal.netPnl || 0);\n  }\n\n  return { dealCount, dailyNetPnl };\n}\n\nexport function computeBrokerDayRealizedPnl(\n  deals: readonly BrokerDayAccountingDeal[],\n  systemMagicNumbers: Iterable<number>,\n): number {\n  return summarizeBrokerDayRealizedPnl(\n    deals,\n    systemMagicNumbers,\n  ).dailyNetPnl;\n}\n`,
);

let trend = read("scripts/run-phase7b-demo-controller.ts");
trend = addImport(
  trend,
  'import path from "node:path";\n',
  'import { summarizeBrokerDayRealizedPnl } from "@xauusd/mt5-broker";\n',
  "Trend",
);
trend = migrateDailyAccounting(trend, "dailyBotMagicNumbers", "Trend");
write("scripts/run-phase7b-demo-controller.ts", trend);

let sideway = read("scripts/run-phase7c-sideway-controller.mjs");
sideway = addImport(
  sideway,
  'import path from "node:path";\n',
  'import { summarizeBrokerDayRealizedPnl } from "@xauusd/mt5-broker";\n',
  "Sideway",
);
sideway = migrateDailyAccounting(sideway, "dailyBotMagicNumbers", "Sideway");
write("scripts/run-phase7c-sideway-controller.mjs", sideway);

let api = read("apps/api/src/services/phase7c-daily-recovery-view.service.ts");
api = addImport(
  api,
  '',
  'import { summarizeBrokerDayRealizedPnl } from "@xauusd/mt5-broker";\n',
  "Daily Recovery API",
);
api = migrateDailyAccounting(api, "magicNumbers", "Daily Recovery API");
write("apps/api/src/services/phase7c-daily-recovery-view.service.ts", api);

let packageJson = read("package.json");
packageJson = replaceOnce(
  packageJson,
  '  "dependencies": {\n    "@xauusd/risk-engine": "workspace:*"\n  }',
  '  "dependencies": {\n    "@xauusd/mt5-broker": "workspace:*",\n    "@xauusd/risk-engine": "workspace:*"\n  }',
  "root package dependency",
);
write("package.json", packageJson);

let lockfile = read("pnpm-lock.yaml");
lockfile = replaceOnce(
  lockfile,
  "    dependencies:\n      '@xauusd/risk-engine':\n",
  "    dependencies:\n      '@xauusd/mt5-broker':\n        specifier: workspace:*\n        version: link:packages/mt5-broker\n      '@xauusd/risk-engine':\n",
  "root lockfile dependency",
);
write("pnpm-lock.yaml", lockfile);

console.log("PHASE7C_BROKER_DAY_ACCOUNTING_PATCH=APPLIED");
console.log("RUNTIME_MUTATION=NONE");
console.log("ARM_CHANGE=NONE");
console.log("MODE_CHANGE=NONE");
console.log("ORDER_MUTATION=NONE");
console.log("BRIDGE_RESTART=NONE");
