import fs from "node:fs";

function replaceOnce(file, before, after, label) {
  const source = fs.readFileSync(file, "utf8");
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0 || first !== last) {
    throw new Error(`${label}: expected exactly one source anchor`);
  }
  fs.writeFileSync(file, source.replace(before, after), "utf8");
}

const trend = "scripts/run-phase7b-demo-controller.ts";
const sideway = "scripts/run-phase7c-sideway-controller.mjs";

replaceOnce(
  trend,
  `} from "./phase7c-stop-monotonicity.mjs";\nimport {\n  compareStrategyEntryConfigVersion,`,
  `} from "./phase7c-stop-monotonicity.mjs";\nimport { fastMoveProfitLockCandidate } from "./phase7c-fast-move-profit-lock.mjs";\nimport {\n  compareStrategyEntryConfigVersion,`,
  "trend helper import",
);

replaceOnce(
  trend,
  `  structureAttempt: number;\n  dailyMode?: DailyMode;`,
  `  structureAttempt: number;\n  fastMovePeakPrice?: number;\n  fastMoveAttempt?: number;\n  dailyMode?: DailyMode;`,
  "trend managed state fields",
);

replaceOnce(
  trend,
  `const MIN_INITIAL_SL_PRICE = 6;\nconst MAX_INITIAL_SL_PRICE = 10;\nconst pullbackWaitMinutes = 15;`,
  `const MIN_INITIAL_SL_PRICE = 6;\nconst MAX_INITIAL_SL_PRICE = 10;\nconst FAST_MOVE_PROFIT_LOCK_ACTIVATION_PRICE = 10;\nconst FAST_MOVE_PROFIT_LOCK_GIVEBACK_PRICE = 6;\nconst pullbackWaitMinutes = 15;`,
  "trend constants",
);

replaceOnce(
  trend,
  `console.log("PHASE7B_DEMO_PLUS10=PARTIAL_ONE_THIRD");\nconsole.log("PHASE7B_DEMO_POST_PLUS10_SL=M15_CONFIRMED_SWING_STRUCTURE_PLUS_1_BUFFER_ONLY_TIGHTEN");`,
  `console.log("PHASE7B_DEMO_PLUS10=PARTIAL_ONE_THIRD");\nconsole.log(\`PHASE7B_DEMO_FAST_MOVE_PROFIT_LOCK=ON|ACTIVATION=+\${FAST_MOVE_PROFIT_LOCK_ACTIVATION_PRICE}|GIVEBACK=\${FAST_MOVE_PROFIT_LOCK_GIVEBACK_PRICE}|SOURCE=LIVE_BID_ASK\`);\nconsole.log("PHASE7B_DEMO_POST_PLUS10_SL=M15_CONFIRMED_SWING_STRUCTURE_PLUS_1_BUFFER_ONLY_TIGHTEN");`,
  "trend startup observability",
);

const trendAnchor = `    return;\n  }\n\n  const hold =\n    canonicalHoldReason(\n      "TREND",\n      managed,\n    );`;
const trendFastMove = `    return;\n  }\n\n  const fastMove = fastMoveProfitLockCandidate({\n    side: managed.side,\n    entry: position.entry,\n    marketPrice: exitPrice,\n    previousPeakPrice: managed.fastMovePeakPrice,\n    activationDistance: FAST_MOVE_PROFIT_LOCK_ACTIVATION_PRICE,\n    givebackDistance: FAST_MOVE_PROFIT_LOCK_GIVEBACK_PRICE,\n  });\n  const previousFastMovePeak = Number(managed.fastMovePeakPrice);\n  if (\n    fastMove.peakPrice > 0 &&\n    (!Number.isFinite(previousFastMovePeak) || Math.abs(previousFastMovePeak - fastMove.peakPrice) > 1e-9)\n  ) {\n    managed.fastMovePeakPrice = fastMove.peakPrice;\n    saveState();\n  }\n\n  if (fastMove.active) {\n    const candidate = roundPrice(fastMove.candidateStop, spec.digits);\n    const fastMoveBaseline = tightestKnownStop(\n      managed.side,\n      Number(position.stopLoss),\n      Number(managed.lastStructuralStop),\n    );\n    if (stopStrictlyTightens(managed.side, fastMoveBaseline, candidate)) {\n      const minimumGap = Math.max(spec.stopsLevelTicks, spec.freezeLevelTicks) * spec.point;\n      const validAgainstMarket = managed.side === "BUY"\n        ? candidate < quote.bid - minimumGap\n        : candidate > quote.ask + minimumGap;\n      if (validAgainstMarket) {\n        managed.fastMoveAttempt = Number(managed.fastMoveAttempt ?? 0) + 1;\n        saveState();\n        const commandId = \`p7b-fast-lock-\${managed.ticket}-\${managed.fastMoveAttempt}\`;\n        const response = await patch<CommandResponse>(\`/v1/positions/\${encodeURIComponent(managed.ticket)}\`, {\n          stopLoss: candidate,\n          commandId,\n        });\n        if (response.success) {\n          managed.lastStructuralStop = candidate;\n          saveState();\n          journal("FAST_MOVE_PROFIT_LOCK_TIGHTEN", {\n            ticket: managed.ticket,\n            side: managed.side,\n            favorable,\n            peakPrice: fastMove.peakPrice,\n            peakFavorable: fastMove.peakFavorable,\n            giveback: FAST_MOVE_PROFIT_LOCK_GIVEBACK_PRICE,\n            stopLoss: candidate,\n            response,\n          });\n        } else {\n          journal("FAST_MOVE_PROFIT_LOCK_REJECTED", {\n            ticket: managed.ticket,\n            side: managed.side,\n            favorable,\n            peakPrice: fastMove.peakPrice,\n            stopLoss: candidate,\n            response,\n          });\n        }\n      }\n    }\n  }\n\n  const hold =\n    canonicalHoldReason(\n      "TREND",\n      managed,\n    );`;
replaceOnce(trend, trendAnchor, trendFastMove, "trend fast-move wiring");

replaceOnce(
  sideway,
  `import { stopIsAtLeastAsTight } from "./phase7c-stop-monotonicity.mjs";\nimport {\n  compareStrategyEntryConfigVersion,`,
  `import {\n  stopIsAtLeastAsTight,\n  stopStrictlyTightens,\n  tightestKnownStop,\n} from "./phase7c-stop-monotonicity.mjs";\nimport { fastMoveProfitLockCandidate } from "./phase7c-fast-move-profit-lock.mjs";\nimport {\n  compareStrategyEntryConfigVersion,`,
  "sideway helper imports",
);

replaceOnce(
  sideway,
  `const DAILY_RECOVERY_MIN_TP_DISTANCE = 6;\nconst DAILY_RECOVERY_MAX_TP_DISTANCE = 10;\nconst DAILY_RECOVERY_TARGET_NET_USD = 1;`,
  `const DAILY_RECOVERY_MIN_TP_DISTANCE = 6;\nconst DAILY_RECOVERY_MAX_TP_DISTANCE = 10;\nconst DAILY_RECOVERY_TARGET_NET_USD = 1;\nconst FAST_MOVE_PROFIT_LOCK_ACTIVATION_PRICE = 10;\nconst FAST_MOVE_PROFIT_LOCK_GIVEBACK_PRICE = 4;`,
  "sideway constants",
);

replaceOnce(
  sideway,
  `console.log("PHASE7C_SIDEWAY_PLUS10=PARTIAL_ONE_THIRD");\nconsole.log("PHASE7C_SIDEWAY_TP2=OPPOSITE_RANGE_BOUNDARY");\nconsole.log("PHASE7C_SIDEWAY_MANAGEMENT=PLUS6_BREAK_EVEN_PLUS10_ONE_THIRD_NO_TRAILING");`,
  `console.log("PHASE7C_SIDEWAY_PLUS10=PARTIAL_ONE_THIRD");\nconsole.log(\`PHASE7C_SIDEWAY_FAST_MOVE_PROFIT_LOCK=ON|ACTIVATION=+\${FAST_MOVE_PROFIT_LOCK_ACTIVATION_PRICE}|GIVEBACK=\${FAST_MOVE_PROFIT_LOCK_GIVEBACK_PRICE}|SOURCE=LIVE_BID_ASK\`);\nconsole.log("PHASE7C_SIDEWAY_TP2=OPPOSITE_RANGE_BOUNDARY");\nconsole.log("PHASE7C_SIDEWAY_MANAGEMENT=PLUS6_BREAK_EVEN_PLUS10_ONE_THIRD_PLUS_FAST_MOVE_LOCK");`,
  "sideway startup observability",
);

replaceOnce(
  sideway,
  `    partialAttempt: 0,\n    breakEvenAttempt: 0,\n    exitAttempt: 0,`,
  `    partialAttempt: 0,\n    breakEvenAttempt: 0,\n    fastMovePeakPrice: Number(opened.entry),\n    fastMoveStop: Number(pending.stopLoss),\n    fastMoveAttempt: 0,\n    exitAttempt: 0,`,
  "sideway managed state fields",
);

replaceOnce(
  sideway,
  `      note: "Broker SL/TP remains active; dynamic TP1/BE actions are skipped on stale quote data.",`,
  `      note: "Broker SL/TP remains active; dynamic TP1/BE/Fast-Move actions are skipped on stale quote data.",`,
  "sideway stale quote note",
);

const sidewayAnchor = `    return;\n  }\n  if (managed.breakEvenApplied && !managed.partialApplied && targetReached(managed.side, marketPrice, managed.tp1)) {`;
const sidewayFastMove = `    return;\n  }\n\n  const fastMove = fastMoveProfitLockCandidate({\n    side: managed.side,\n    entry: managed.entry,\n    marketPrice,\n    previousPeakPrice: managed.fastMovePeakPrice,\n    activationDistance: FAST_MOVE_PROFIT_LOCK_ACTIVATION_PRICE,\n    givebackDistance: FAST_MOVE_PROFIT_LOCK_GIVEBACK_PRICE,\n  });\n  const previousFastMovePeak = Number(managed.fastMovePeakPrice);\n  if (\n    fastMove.peakPrice > 0 &&\n    (!Number.isFinite(previousFastMovePeak) || Math.abs(previousFastMovePeak - fastMove.peakPrice) > 1e-9)\n  ) {\n    managed.fastMovePeakPrice = fastMove.peakPrice;\n    saveState();\n  }\n\n  if (fastMove.active) {\n    const candidate = roundPrice(fastMove.candidateStop, Number(spec.digits ?? 2));\n    const fastMoveBaseline = tightestKnownStop(\n      managed.side,\n      Number(position.stopLoss),\n      Number(managed.fastMoveStop),\n      managed.breakEvenApplied ? Number(managed.entry) : 0,\n    );\n    if (stopStrictlyTightens(managed.side, fastMoveBaseline, candidate)) {\n      const minimumGap = Math.max(Number(spec.stopsLevelTicks ?? 0), Number(spec.freezeLevelTicks ?? 0)) * Number(spec.point);\n      const validAgainstMarket = managed.side === "BUY"\n        ? candidate < Number(quote.bid) - minimumGap\n        : candidate > Number(quote.ask) + minimumGap;\n      if (validAgainstMarket) {\n        managed.fastMoveAttempt = Number(managed.fastMoveAttempt ?? 0) + 1;\n        saveState();\n        const response = await bridgeRequest("PATCH", \`/v1/positions/\${encodeURIComponent(managed.ticket)}\`, {\n          stopLoss: candidate,\n          commandId: \`p7c-sideway-fast-lock-\${managed.ticket}-\${managed.fastMoveAttempt}\`,\n        });\n        if (response.success) {\n          managed.fastMoveStop = candidate;\n          saveState();\n          journal("FAST_MOVE_PROFIT_LOCK_TIGHTEN", {\n            ticket: managed.ticket,\n            side: managed.side,\n            favorable,\n            peakPrice: fastMove.peakPrice,\n            peakFavorable: fastMove.peakFavorable,\n            giveback: FAST_MOVE_PROFIT_LOCK_GIVEBACK_PRICE,\n            stopLoss: candidate,\n          });\n        } else {\n          journal("FAST_MOVE_PROFIT_LOCK_REJECTED", {\n            ticket: managed.ticket,\n            side: managed.side,\n            favorable,\n            peakPrice: fastMove.peakPrice,\n            stopLoss: candidate,\n            response,\n          });\n        }\n      }\n    }\n  }\n\n  if (managed.breakEvenApplied && !managed.partialApplied && targetReached(managed.side, marketPrice, managed.tp1)) {`;
replaceOnce(sideway, sidewayAnchor, sidewayFastMove, "sideway fast-move wiring");

console.log("FAST_MOVE_CONTROLLER_PATCH=APPLIED");
