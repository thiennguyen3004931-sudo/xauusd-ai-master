import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const notifierPath = path.resolve("scripts/run-phase7b-telegram-notifier.mjs");
let source = fs.readFileSync(notifierPath, "utf8");

function replaceExactlyOnce(label, before, after) {
  const matches = source.split(before).length - 1;
  assert.equal(matches, 1, `${label}: expected exactly one source match, got ${matches}`);
  source = source.replace(before, after);
}

replaceExactlyOnce(
  "canonical close backfill must precede Recovery Daily P/L read",
  `  let closedTrade = null;\n  let dailyRecoveryAfterClose = null;\n\n  const isCloseEvent = [\n    "EXIT_EXECUTED",\n    "MANAGED_POSITION_CLOSED",\n    "POSITION_CLOSED",\n  ].includes(type);\n\n  if (isCloseEvent) {\n    closedTrade =\n      await findClosedTradeWithRetry(event);\n\n    if (isRecoveryContext(event)) {\n      const previewVolume =\n        numberOrNull(\n          state.trade?.initialVolume,\n        ) ??\n        numberOrNull(\n          event?.lastKnownState?.initialVolume,\n        ) ??\n        numberOrNull(\n          event?.management?.initialVolume,\n        ) ??\n        0.03;\n\n      dailyRecoveryAfterClose =\n        await getDailyRecoverySnapshotWithRetry(\n          previewVolume,\n        );\n    }\n  }\n\n  let canonicalRealized = null;\n\n  if (\n    type === "PLUS10_PARTIAL_ONE_THIRD" ||\n    type === "TP1_PARTIAL_FILLED" ||\n    isCloseEvent\n  ) {\n    canonicalRealized =\n      await getCanonicalRealizedPositionWithRetry(event);\n  }\n`,
  `  let closedTrade = null;\n  let dailyRecoveryAfterClose = null;\n  let canonicalRealized = null;\n\n  const isCloseEvent = [\n    "EXIT_EXECUTED",\n    "MANAGED_POSITION_CLOSED",\n    "POSITION_CLOSED",\n  ].includes(type);\n\n  if (isCloseEvent) {\n    closedTrade =\n      await findClosedTradeWithRetry(event);\n\n    canonicalRealized =\n      await getCanonicalRealizedPositionWithRetry(event);\n\n    if (\n      isRecoveryContext(event) &&\n      Number(canonicalRealized?.dealCount) > 0\n    ) {\n      const previewVolume =\n        numberOrNull(\n          state.trade?.initialVolume,\n        ) ??\n        numberOrNull(\n          event?.lastKnownState?.initialVolume,\n        ) ??\n        numberOrNull(\n          event?.management?.initialVolume,\n        ) ??\n        0.03;\n\n      dailyRecoveryAfterClose =\n        await getDailyRecoverySnapshotWithRetry(\n          previewVolume,\n        );\n    }\n  } else if (\n    type === "PLUS10_PARTIAL_ONE_THIRD" ||\n    type === "TP1_PARTIAL_FILLED"\n  ) {\n    canonicalRealized =\n      await getCanonicalRealizedPositionWithRetry(event);\n  }\n`,
);

replaceExactlyOnce(
  "Recovery card must not confirm Daily P/L before canonical close deal",
  `      const dailyPnl =\n        numberOrNull(\n          daily?.dailyNetPnl,\n        );\n\n      const completed =\n        dailyPnl !== null\n          ? dailyPnl >= 0\n          : daily?.dailyMode === "NORMAL";\n`,
  `      const canonicalCloseSynchronized =\n        canonicalDealCount !== null &&\n        canonicalDealCount > 0;\n\n      const dailyPnl =\n        canonicalCloseSynchronized\n          ? numberOrNull(\n              daily?.dailyNetPnl,\n            )\n          : null;\n\n      const completed =\n        canonicalCloseSynchronized &&\n        (dailyPnl !== null\n          ? dailyPnl >= 0\n          : daily?.dailyMode === "NORMAL");\n`,
);

replaceExactlyOnce(
  "Recovery card pending Daily P/L copy",
  `          dailyPnl === null\n            ? "📅 <b>Daily P/L sau đóng:</b> <code>chưa đọc được</code>"\n            : \`📅 <b>Daily P/L sau đóng:</b> <code>\${fmtMoney(\n                dailyPnl,\n                true,\n              )}</code>\`,\n`,
  `          !canonicalCloseSynchronized\n            ? "📅 <b>Daily P/L sau đóng:</b> <code>đang đồng bộ MT5 deal canonical</code>"\n            : dailyPnl === null\n              ? "📅 <b>Daily P/L sau đóng:</b> <code>chưa đọc được</code>"\n              : \`📅 <b>Daily P/L sau đóng:</b> <code>\${fmtMoney(\n                  dailyPnl,\n                  true,\n                )}</code>\`,\n`,
);

fs.writeFileSync(notifierPath, source, "utf8");
console.log("PHASE7C_RECOVERY_CLOSE_DAILY_SYNC_PATCH=APPLIED");
