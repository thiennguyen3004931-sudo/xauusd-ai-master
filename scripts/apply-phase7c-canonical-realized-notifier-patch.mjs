import fs from "node:fs";

const notifierPath = "scripts/run-phase7b-telegram-notifier.mjs";
const workflowPath = ".github/workflows/phase7c-notifier-canonical-realized-patch.yml";
const selfPath = "scripts/apply-phase7c-canonical-realized-notifier-patch.mjs";

let source = fs.readFileSync(notifierPath, "utf8");

function replaceRegexOnce(pattern, replacement, label) {
  const matches = [...source.matchAll(new RegExp(pattern.source, `${pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`}`))];
  if (matches.length !== 1) {
    throw new Error(`${label}: expected exactly 1 match, got ${matches.length}`);
  }
  source = source.replace(pattern, replacement);
}

function replaceTextOnce(oldText, newText, label) {
  const first = source.indexOf(oldText);
  const second = first < 0 ? -1 : source.indexOf(oldText, first + oldText.length);
  if (first < 0 || second >= 0) {
    throw new Error(`${label}: expected exactly 1 match, first=${first}, second=${second}`);
  }
  source = source.slice(0, first) + newText + source.slice(first + oldText.length);
}

replaceRegexOnce(
  /  let partialPnlEstimate = null;[\s\S]*?  return \{\n    live,\n    metrics,\n    closedTrade,\n    partialPnlEstimate,\n    dailyRecoveryAfterClose,\n  \};/,
  `  let canonicalRealized = null;\n\n  if (\n    type === "PLUS10_PARTIAL_ONE_THIRD" ||\n    type === "TP1_PARTIAL_FILLED" ||\n    isCloseEvent\n  ) {\n    canonicalRealized =\n      await getCanonicalRealizedPositionWithRetry(event);\n  }\n\n  return {\n    live,\n    metrics,\n    closedTrade,\n    canonicalRealized,\n    dailyRecoveryAfterClose,\n  };`,
  "buildEnrichment canonical realized",
);

replaceTextOnce(
  `    const m = enrichment.metrics;\n    const partial =\n      enrichment.partialPnlEstimate;`,
  `    const m = enrichment.metrics;\n    const realizedDeal =\n      matchCanonicalRealizedDeal(\n        enrichment.canonicalRealized,\n        event,\n      );`,
  "partial formatter binding",
);

replaceRegexOnce(
  /· <b>Lãi:<\/b> <code>\$\{fmtMoney\(\n          partial,\n          true,\n          true,\n        \)\}<\/code>/,
  `· <b>Realized P&L:</b> <code>\${\n          realizedDeal\n            ? fmtMoney(\n                realizedDeal.netPnl,\n                true,\n              )\n            : "đang chờ MT5 deal"\n        }</code>`,
  "partial realized display",
);

replaceTextOnce(
  `    const pnl =\n      numberOrNull(\n        closed?.netPnl,\n      );`,
  `    const pnl =\n      numberOrNull(\n        enrichment.canonicalRealized?.realizedNetPnl,\n      );`,
  "exit canonical pnl",
);

replaceRegexOnce(
  /          closed\n            \? `💵 <b>P&L lệnh:<\/b> <code>\$\{fmtMoney\(\n                pnl,\n                true,\n              \)\}<\/code>`\n            : "💵 <b>P&L lệnh:<\/b> <code>đang đồng bộ MT5<\/code>",/,
  `          pnl !== null\n            ? \`💵 <b>P&L lệnh:</b> <code>\${fmtMoney(\n                pnl,\n                true,\n              )}</code>\`\n            : "💵 <b>P&L lệnh:</b> <code>đang đồng bộ MT5 deal canonical</code>",`,
  "recovery exit canonical display",
);

replaceRegexOnce(
  /        closed\n          \? `💵 <b>P&L tổng:<\/b> <code>\$\{fmtMoney\(\n              pnl,\n              true,\n            \)\}<\/code>`\n          : "💵 <b>P&L:<\/b> <code>đang đồng bộ MT5<\/code>",/,
  `        pnl !== null\n          ? \`💵 <b>P&L tổng:</b> <code>\${fmtMoney(\n              pnl,\n              true,\n            )}</code>\`\n          : "💵 <b>P&L:</b> <code>đang đồng bộ MT5 deal canonical</code>",`,
  "normal exit canonical display",
);

replaceTextOnce(
  `      realizedPnlEstimate: 0,\n\n`,
  "",
  "entry estimated realized state",
);

replaceRegexOnce(
  /\n    if \(\n      enrichment\.partialPnlEstimate !==\n      null\n    \) \{\n      state\.trade\.realizedPnlEstimate =[\s\S]*?        enrichment\.partialPnlEstimate;\n    \}/,
  "",
  "partial estimated realized accumulator",
);

const helperAnchor = "async function findClosedTradeWithRetry(event) {";
const helper = `async function getCanonicalRealizedPosition(event) {\n  const positionId = String(\n    event?.ticket ??\n    event?.position?.ticket ??\n    state.trade?.ticket ??\n    "",\n  ).trim();\n\n  if (!positionId) return null;\n\n  const eventAt = Date.parse(\n    String(\n      event?.timestamp ??\n      new Date().toISOString(),\n    ),\n  );\n  const safeEventAt = Number.isFinite(eventAt)\n    ? eventAt\n    : Date.now();\n  const openedAt = Number(state.trade?.openedAt);\n  const fromMs =\n    Number.isFinite(openedAt) && openedAt > 0\n      ? Math.max(0, openedAt - 5 * 60_000)\n      : Math.max(0, safeEventAt - 7 * 24 * 60 * 60_000);\n  const toMs = safeEventAt + 2 * 60_000;\n  const query = new URLSearchParams({\n    positionId,\n    symbol,\n    fromMs: String(fromMs),\n    toMs: String(toMs),\n  });\n\n  return fetchJson(\n    \`\${monitorApiBase}/api/v1/phase7c-canonical-ledger/position-realized?\${query.toString()}\`,\n    3000,\n  ).catch(() => null);\n}\n\nasync function getCanonicalRealizedPositionWithRetry(event) {\n  let lastSnapshot = null;\n  const partialEvent = [\n    "PLUS10_PARTIAL_ONE_THIRD",\n    "TP1_PARTIAL_FILLED",\n  ].includes(String(event?.type ?? ""));\n\n  for (let attempt = 0; attempt < 4; attempt += 1) {\n    const snapshot =\n      await getCanonicalRealizedPosition(event);\n\n    if (snapshot) {\n      lastSnapshot = snapshot;\n      if (\n        partialEvent\n          ? matchCanonicalRealizedDeal(snapshot, event)\n          : Number(snapshot.dealCount) > 0\n      ) {\n        return snapshot;\n      }\n    }\n\n    if (attempt < 3) await sleep(650);\n  }\n\n  return lastSnapshot;\n}\n\nfunction matchCanonicalRealizedDeal(snapshot, event) {\n  const deals = Array.isArray(snapshot?.deals)\n    ? snapshot.deals\n    : [];\n  if (deals.length === 0) return null;\n\n  const targetVolume = numberOrNull(event?.closedVolume);\n  const eventAt = Date.parse(String(event?.timestamp ?? ""));\n  const safeEventAt = Number.isFinite(eventAt)\n    ? eventAt\n    : Date.now();\n\n  return [...deals]\n    .filter((deal) => {\n      const dealAt = Number(deal?.timestamp);\n      return Number.isFinite(dealAt) &&\n        Math.abs(dealAt - safeEventAt) <= 2 * 60_000;\n    })\n    .sort((left, right) => {\n      const leftVolume = numberOrNull(left?.volume);\n      const rightVolume = numberOrNull(right?.volume);\n      const leftVolumeDelta =\n        targetVolume === null || leftVolume === null\n          ? 0\n          : Math.abs(leftVolume - targetVolume);\n      const rightVolumeDelta =\n        targetVolume === null || rightVolume === null\n          ? 0\n          : Math.abs(rightVolume - targetVolume);\n      if (Math.abs(leftVolumeDelta - rightVolumeDelta) > 1e-9) {\n        return leftVolumeDelta - rightVolumeDelta;\n      }\n      return Math.abs(Number(left.timestamp) - safeEventAt) -\n        Math.abs(Number(right.timestamp) - safeEventAt);\n    })[0] ?? null;\n}\n\n`;
replaceTextOnce(helperAnchor, helper + helperAnchor, "canonical realized helpers");

replaceTextOnce(
  "const lockedPnlUsd = estimatePnlFromPriceMove(slPriceMove, volume, snapshot?.mt5?.spec);",
  "const lockedPnlUsd = estimateLockedPnlUsd(slPriceMove, volume, snapshot?.mt5?.spec);",
  "locked pnl helper call",
);
replaceTextOnce(
  "function estimatePnlFromPriceMove(priceMove, volume, spec) {",
  "function estimateLockedPnlUsd(priceMove, volume, spec) {",
  "locked pnl helper name",
);

for (const forbidden of [
  "partialPnlEstimate",
  "realizedPnlEstimate",
  "estimatePnlFromPriceMove",
]) {
  if (source.includes(forbidden)) {
    throw new Error(`forbidden legacy realized estimate remains: ${forbidden}`);
  }
}

fs.writeFileSync(notifierPath, source, "utf8");
fs.unlinkSync(workflowPath);
fs.unlinkSync(selfPath);
console.log("PHASE7C_CANONICAL_REALIZED_NOTIFIER_PATCH=PASS");
