import fs from "node:fs";

const file = "apps/api/src/services/mt5-performance.service.ts";
let source = fs.readFileSync(file, "utf8");

function replaceOnce(label, before, after) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected anchor not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: anchor is not unique`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  "imports",
  `import { resolvePhase7CDailyRecoveryMagicNumbers } from "./phase7c-daily-recovery-view.service";\n\nconst DAY_MS`,
  `import { resolvePhase7CDailyRecoveryMagicNumbers } from "./phase7c-daily-recovery-view.service";\nimport {\n  enrichPerformanceTradesWithRegimeAttribution,\n  loadPhase7CPerformanceRegimeAudit,\n  loadPhase7CPerformanceRegimeAuditFromDirectory,\n} from "./phase7c-performance-regime-attribution.service";\n\nexport {\n  enrichPerformanceTradesWithRegimeAttribution,\n  loadPhase7CPerformanceRegimeAuditFromDirectory,\n} from "./phase7c-performance-regime-attribution.service";\n\nconst DAY_MS`,
);

replaceOnce(
  "trade attribution fields",
  `  weekday: string;\n  exitReason: "UNKNOWN";\n}`,
  `  weekday: string;\n  exitReason: "UNKNOWN";\n  regime: string | null;\n  regimeConfidence: number | null;\n  regimeAttribution: "MATCHED" | "UNMATCHED";\n  regimeSource: string | null;\n}`,
);

replaceOnce(
  "bucket metrics",
  `export interface Mt5PerformanceBucket {\n  key: string;\n  label: string;\n  totalTrades: number;\n  netPnl: number;\n  winRatePercent: number;\n  profitFactor: number | null;\n}`,
  `export interface Mt5PerformanceBucket {\n  key: string;\n  label: string;\n  totalTrades: number;\n  wins: number;\n  losses: number;\n  breakeven: number;\n  netPnl: number;\n  grossProfit: number;\n  grossLoss: number;\n  winRatePercent: number;\n  profitFactor: number | null;\n  expectancy: number;\n  averageWin: number;\n  averageLoss: number;\n  maxConsecutiveLosses: number;\n}`,
);

replaceOnce(
  "snapshot breakdown fields",
  `    hour: Mt5PerformanceBucket[];\n    ownership: Mt5PerformanceBucket[];\n  };`,
  `    hour: Mt5PerformanceBucket[];\n    ownership: Mt5PerformanceBucket[];\n    regime: Mt5PerformanceBucket[];\n    strategyRegime: Mt5PerformanceBucket[];\n  };`,
);

replaceOnce(
  "reconstructed trade defaults",
  `        brokerHour: hour,\n        weekday: WEEKDAYS[day] ?? String(day),\n        exitReason: "UNKNOWN",\n      });`,
  `        brokerHour: hour,\n        weekday: WEEKDAYS[day] ?? String(day),\n        exitReason: "UNKNOWN",\n        regime: null,\n        regimeConfidence: null,\n        regimeAttribution: "UNMATCHED",\n        regimeSource: null,\n      });`,
);

const bucketStart = source.indexOf("function bucket(");
const recommendationsStart = source.indexOf("function recommendations(", bucketStart);
if (bucketStart < 0 || recommendationsStart < 0 || recommendationsStart <= bucketStart) {
  throw new Error("bucket helper: expected function range not found");
}
const bucketReplacement = `function performanceBucket(key: string, rows: readonly Mt5PerformanceTrade[]): Mt5PerformanceBucket {\n  const metrics = calculateMetrics(rows);\n  return {\n    key,\n    label: key,\n    totalTrades: metrics.totalTrades,\n    wins: metrics.wins,\n    losses: metrics.losses,\n    breakeven: metrics.breakeven,\n    netPnl: metrics.netPnl,\n    grossProfit: metrics.grossProfit,\n    grossLoss: metrics.grossLoss,\n    winRatePercent: metrics.winRatePercent,\n    profitFactor: metrics.profitFactor,\n    expectancy: metrics.expectancy,\n    averageWin: metrics.averageWin,\n    averageLoss: metrics.averageLoss,\n    maxConsecutiveLosses: metrics.maxConsecutiveLosses,\n  };\n}\n\nfunction bucket(trades: readonly Mt5PerformanceTrade[], keyOf: (trade: Mt5PerformanceTrade) => string): Mt5PerformanceBucket[] {\n  const groups = new Map<string, Mt5PerformanceTrade[]>();\n  for (const trade of trades) {\n    const key = keyOf(trade);\n    const group = groups.get(key) ?? [];\n    group.push(trade);\n    groups.set(key, group);\n  }\n  return [...groups.entries()]\n    .map(([key, rows]) => performanceBucket(key, rows))\n    .sort((a, b) => b.totalTrades - a.totalTrades || a.label.localeCompare(b.label));\n}\n\nfunction regimeKey(trade: Mt5PerformanceTrade): string {\n  return trade.regimeAttribution === "MATCHED" && trade.regime ? trade.regime : "UNMATCHED";\n}\n\nexport function buildPerformanceRegimeBreakdowns(trades: readonly Mt5PerformanceTrade[]) {\n  const systemTrades = trades.filter((trade) =>\n    trade.ownership === "SYSTEM" && (trade.strategy === "TREND" || trade.strategy === "SIDEWAY")\n  );\n  return {\n    regime: bucket(systemTrades, regimeKey),\n    strategyRegime: bucket(systemTrades, (trade) => \`${'${trade.strategy}'} × ${'${regimeKey(trade)}'}\`),\n  };\n}\n\n`;
source = source.slice(0, bucketStart) + bucketReplacement + source.slice(recommendationsStart);

replaceOnce(
  "load and enrich trades",
  `  const trades = reconstructTrades(deals, trendMagic, sidewayMagic)\n    .filter((trade) => trade.closedAt >= fromMs && trade.closedAt < brokerNow);`,
  `  const reconstructedTrades = reconstructTrades(deals, trendMagic, sidewayMagic)\n    .filter((trade) => trade.closedAt >= fromMs && trade.closedAt < brokerNow);\n  const regimeAudit = await loadPhase7CPerformanceRegimeAudit(account.accountMode);\n  const trades = enrichPerformanceTradesWithRegimeAttribution(reconstructedTrades, regimeAudit);`,
);

replaceOnce(
  "regime breakdown variable",
  `  const systemTrades = trades.filter((trade) => trade.ownership === "SYSTEM");\n  const systemMetrics = calculateMetrics(systemTrades);\n\n  return {`,
  `  const systemTrades = trades.filter((trade) => trade.ownership === "SYSTEM");\n  const systemMetrics = calculateMetrics(systemTrades);\n  const regimeBreakdowns = buildPerformanceRegimeBreakdowns(systemTrades);\n\n  return {`,
);

replaceOnce(
  "strategy detailed bucket",
  `      strategy: (["TREND", "SIDEWAY"] as const).map((strategy) => {\n        const metrics = calculateMetrics(systemTrades.filter((trade) => trade.strategy === strategy));\n        return { key: strategy, label: strategy, totalTrades: metrics.totalTrades, netPnl: metrics.netPnl, winRatePercent: metrics.winRatePercent, profitFactor: metrics.profitFactor };\n      }),`,
  `      strategy: (["TREND", "SIDEWAY"] as const).map((strategy) =>\n        performanceBucket(strategy, systemTrades.filter((trade) => trade.strategy === strategy))\n      ),`,
);

replaceOnce(
  "return regime breakdowns",
  `      hour: bucket(trades, (trade) => \`${'${String(trade.brokerHour).padStart(2, "0")}:00'}\`),\n      ownership: bucket(trades, (trade) => trade.ownership),\n    },`,
  `      hour: bucket(trades, (trade) => \`${'${String(trade.brokerHour).padStart(2, "0")}:00'}\`),\n      ownership: bucket(trades, (trade) => trade.ownership),\n      regime: regimeBreakdowns.regime,\n      strategyRegime: regimeBreakdowns.strategyRegime,\n    },`,
);

replaceOnce(
  "performance notes",
  `      \`SYSTEM ownership dùng Trend magic ${'${trendMagic}'} và Sideway magic ${'${sidewayMagic}'}.\`,\n      "Trang hiệu suất không đổi strategy, không gửi order và không mutate position.",`,
  `      \`SYSTEM ownership dùng Trend magic ${'${trendMagic}'} và Sideway magic ${'${sidewayMagic}'}.\`,\n      "Regime chỉ được gán từ authoritative entry audit; không có hoặc mơ hồ thì giữ UNMATCHED.",\n      "Không backfill regime lịch sử bằng suy đoán; Strategy×Regime chỉ dùng system-owned trades.",\n      "Trang hiệu suất không đổi strategy, không gửi order và không mutate position.",`,
);

fs.writeFileSync(file, source, "utf8");
console.log("PERFORMANCE_REGIME_ATTRIBUTION_PATCH=APPLIED");
