import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const notifierPath = path.join(scriptsDir, "run-phase7b-telegram-notifier.mjs");
let source = fs.readFileSync(notifierPath, "utf8");

function replaceExact(label, before, after, expected = 1) {
  const count = source.split(before).length - 1;
  if (count !== expected) {
    throw new Error(`${label}: expected ${expected} match(es), found ${count}`);
  }
  source = source.split(before).join(after);
}

replaceExact(
  "ENTRY_FILLED validated entry/sl",
  `    const entry =\n      numberOrNull(\n        position.entry ??\n        event.fillPrice,\n      );\n\n    const sl =\n      numberOrNull(\n        position.stopLoss,\n      );`,
  `    const entry =\n      firstPositiveNumber(\n        position.entry,\n        event.fillPrice,\n        event.management?.entry,\n        event.lastKnownState?.entry,\n      );\n\n    const sl =\n      firstPositiveNumber(\n        position.stopLoss,\n        event.stopLoss,\n        event.management?.stopLoss,\n        event.lastKnownState?.stopLoss,\n      );\n\n    const entryVolume =\n      firstPositiveNumber(\n        position.volume,\n        event.volume,\n        event.management?.expectedRemainingVolume,\n        event.management?.initialVolume,\n        event.lastKnownState?.expectedRemainingVolume,\n        event.lastKnownState?.initialVolume,\n      );`,
);

replaceExact(
  "ENTRY_FILLED Lot rendering",
  `\${value(\n              position.volume,\n            )} lot`,
  `\${value(\n              entryVolume,\n            )} lot`,
  3,
);

replaceExact(
  "Recovery TP ignores zero placeholders",
  `    takeProfit:\n      numberOrNull(\n        event?.recoveryTakeProfit ??\n        management?.recoveryTakeProfit ??\n        event?.plan?.takeProfit ??\n        state.trade?.recoveryTakeProfit,\n      ),`,
  `    takeProfit:\n      firstPositiveNumber(\n        event?.recoveryTakeProfit,\n        management?.recoveryTakeProfit,\n        management?.tp2,\n        event?.plan?.takeProfit,\n        state.trade?.recoveryTakeProfit,\n        state.trade?.takeProfit,\n      ),`,
);

replaceExact(
  "ENTRY_FILLED trade state context",
  `      entry:\n        numberOrNull(\n          position.entry ??\n          event.fillPrice,\n        ),\n\n      initialVolume:\n        numberOrNull(\n          position.volume,\n        ),\n\n      remainingVolume:\n        numberOrNull(\n          position.volume,\n        ),\n\n      stopLoss:\n        numberOrNull(\n          position.stopLoss,\n        ),`,
  `      entry:\n        firstPositiveNumber(\n          position.entry,\n          event.fillPrice,\n          event.management?.entry,\n          event.lastKnownState?.entry,\n          enrichment.metrics?.entry,\n        ),\n\n      initialVolume:\n        firstPositiveNumber(\n          position.volume,\n          event.volume,\n          event.management?.initialVolume,\n          event.management?.expectedRemainingVolume,\n          event.lastKnownState?.initialVolume,\n          enrichment.metrics?.volume,\n        ),\n\n      remainingVolume:\n        firstPositiveNumber(\n          position.volume,\n          event.volume,\n          event.management?.expectedRemainingVolume,\n          event.management?.initialVolume,\n          event.lastKnownState?.expectedRemainingVolume,\n          enrichment.metrics?.volume,\n        ),\n\n      stopLoss:\n        firstPositiveNumber(\n          position.stopLoss,\n          event.stopLoss,\n          event.management?.stopLoss,\n          event.lastKnownState?.stopLoss,\n          enrichment.metrics?.stopLoss,\n        ),`,
);

replaceExact(
  "Sideway state TP ignores zero placeholders",
  `            ? numberOrNull(\n                event.management?.tp2 ??\n                position.takeProfit,\n              )`,
  `            ? firstPositiveNumber(\n                event.management?.tp2,\n                position.takeProfit,\n                event.lastKnownState?.tp2,\n              )`,
);

replaceExact(
  "Backfill trade context before lifecycle mutations",
  `  if (!state.trade) {\n    return;\n  }\n\n  if (\n    type === "PLUS6_SL_TO_ENTRY" ||`,
  `  if (!state.trade) {\n    return;\n  }\n\n  const contextEntry =\n    firstPositiveNumber(\n      event.position?.entry,\n      event.fillPrice,\n      enrichment.metrics?.entry,\n      event.management?.entry,\n      event.lastKnownState?.entry,\n    );\n  if (contextEntry !== null) {\n    state.trade.entry = contextEntry;\n  }\n\n  const contextStopLoss =\n    firstPositiveNumber(\n      event.stopLoss,\n      event.position?.stopLoss,\n      enrichment.metrics?.stopLoss,\n      event.management?.stopLoss,\n      event.lastKnownState?.stopLoss,\n    );\n  if (contextStopLoss !== null) {\n    state.trade.stopLoss = contextStopLoss;\n  }\n\n  const contextVolume =\n    firstPositiveNumber(\n      event.remainingVolume,\n      event.position?.volume,\n      enrichment.metrics?.volume,\n      event.management?.expectedRemainingVolume,\n      event.lastKnownState?.expectedRemainingVolume,\n      state.trade.remainingVolume,\n      state.trade.initialVolume,\n    );\n  if (contextVolume !== null) {\n    state.trade.remainingVolume = contextVolume;\n  }\n\n  const contextTakeProfit =\n    firstPositiveNumber(\n      event.recoveryTakeProfit,\n      event.position?.takeProfit,\n      event.management?.recoveryTakeProfit,\n      event.management?.tp2,\n      event.lastKnownState?.recoveryTakeProfit,\n      event.lastKnownState?.tp2,\n      state.trade.recoveryTakeProfit,\n      state.trade.takeProfit,\n    );\n  if (contextTakeProfit !== null) {\n    state.trade.takeProfit = contextTakeProfit;\n    if (state.trade.dailyMode === "RECOVERY_TP") {\n      state.trade.recoveryTakeProfit = contextTakeProfit;\n    }\n  }\n\n  if (\n    type === "PLUS6_SL_TO_ENTRY" ||`,
);

replaceExact(
  "Management SL update ignores zero placeholders",
  `    const stop =\n      numberOrNull(\n        event.stopLoss ??\n        enrichment.metrics?.stopLoss,\n      );`,
  `    const stop =\n      firstPositiveNumber(\n        event.stopLoss,\n        enrichment.metrics?.stopLoss,\n        event.management?.stopLoss,\n        state.trade?.stopLoss,\n      );`,
);

replaceExact(
  "Partial remaining volume ignores zero placeholders",
  `    state.trade.remainingVolume =\n      numberOrNull(\n        event.remainingVolume,\n      ) ??\n      state.trade.remainingVolume;`,
  `    state.trade.remainingVolume =\n      firstPositiveNumber(\n        event.remainingVolume,\n        enrichment.metrics?.volume,\n        state.trade.remainingVolume,\n        state.trade.initialVolume,\n      ) ??\n      state.trade.remainingVolume;`,
  2,
);

replaceExact(
  "Live metrics validated position context",
  `  const entry = numberOrNull(managed?.entry ?? managedState?.entry ?? state.trade?.entry);\n  const quote = snapshot?.mt5?.quote ?? null;\n  const market = side === "BUY" ? numberOrNull(quote?.bid) : numberOrNull(quote?.ask);\n  const stopLoss = numberOrNull(managed?.stopLoss ?? managedState?.lastStructuralStop ?? event.stopLoss ?? state.trade?.stopLoss);\n  const volume = numberOrNull(managed?.volume ?? managedState?.expectedRemainingVolume ?? state.trade?.remainingVolume);`,
  `  const entry = firstPositiveNumber(\n    managed?.openPrice,\n    managed?.entry,\n    managedState?.entry,\n    event.position?.entry,\n    event.management?.entry,\n    state.trade?.entry,\n  );\n  const quote = snapshot?.mt5?.quote ?? null;\n  const market = side === "BUY" ? numberOrNull(quote?.bid) : numberOrNull(quote?.ask);\n  const stopLoss = firstPositiveNumber(\n    managed?.stopLoss,\n    managedState?.lastStructuralStop,\n    event.stopLoss,\n    event.position?.stopLoss,\n    event.management?.stopLoss,\n    state.trade?.stopLoss,\n  );\n  const volume = firstPositiveNumber(\n    managed?.volume,\n    managedState?.expectedRemainingVolume,\n    event.remainingVolume,\n    event.position?.volume,\n    event.management?.expectedRemainingVolume,\n    state.trade?.remainingVolume,\n    state.trade?.initialVolume,\n  );`,
);

replaceExact(
  "Fallback metrics validated position context",
  `function fallbackMetrics(event) {\n  const side = normalizeSide(state.trade?.side ?? event.side);\n  const entry = numberOrNull(state.trade?.entry);\n  const stopLoss = numberOrNull(event.stopLoss ?? state.trade?.stopLoss);\n  return {\n    side,\n    entry,\n    market: null,\n    stopLoss,\n    volume: numberOrNull(state.trade?.remainingVolume),`,
  `function fallbackMetrics(event) {\n  const side = normalizeSide(state.trade?.side ?? event.side);\n  const entry = firstPositiveNumber(\n    event.position?.entry,\n    event.fillPrice,\n    event.management?.entry,\n    event.lastKnownState?.entry,\n    state.trade?.entry,\n  );\n  const stopLoss = firstPositiveNumber(\n    event.stopLoss,\n    event.position?.stopLoss,\n    event.management?.stopLoss,\n    event.lastKnownState?.stopLoss,\n    state.trade?.stopLoss,\n  );\n  return {\n    side,\n    entry,\n    market: null,\n    stopLoss,\n    volume: firstPositiveNumber(\n      event.remainingVolume,\n      event.position?.volume,\n      event.management?.expectedRemainingVolume,\n      event.lastKnownState?.expectedRemainingVolume,\n      state.trade?.remainingVolume,\n      state.trade?.initialVolume,\n    ),`,
);

replaceExact(
  "Sideway lifecycle TP validated fallback",
  `  if (lifecycleRegime(event) === "SIDEWAY") {\n    return fmtPrice(\n      event?.management?.tp2 ??\n      event?.lastKnownState?.tp2 ??\n      state.trade?.takeProfit ??\n      event?.position?.takeProfit,\n    );\n  }`,
  `  if (lifecycleRegime(event) === "SIDEWAY") {\n    return fmtPrice(\n      firstPositiveNumber(\n        event?.management?.tp2,\n        event?.lastKnownState?.tp2,\n        state.trade?.takeProfit,\n        event?.position?.takeProfit,\n      ),\n    );\n  }`,
);

replaceExact(
  "Lifecycle context ignores zero placeholders",
  `  const entry = numberOrNull(\n    position?.entry ??\n    event?.fillPrice ??\n    metrics?.entry ??\n    state.trade?.entry,\n  );\n  const stopLoss = numberOrNull(\n    event?.stopLoss ??\n    position?.stopLoss ??\n    metrics?.stopLoss ??\n    state.trade?.stopLoss,\n  );\n  const lot = numberOrNull(\n    event?.remainingVolume ??\n    position?.volume ??\n    metrics?.volume ??\n    state.trade?.remainingVolume ??\n    state.trade?.initialVolume,\n  );`,
  `  const entry = firstPositiveNumber(\n    position?.entry,\n    event?.fillPrice,\n    metrics?.entry,\n    event?.management?.entry,\n    event?.lastKnownState?.entry,\n    state.trade?.entry,\n  );\n  const stopLoss = firstPositiveNumber(\n    event?.stopLoss,\n    position?.stopLoss,\n    metrics?.stopLoss,\n    event?.management?.stopLoss,\n    event?.lastKnownState?.stopLoss,\n    state.trade?.stopLoss,\n  );\n  const lot = firstPositiveNumber(\n    event?.remainingVolume,\n    position?.volume,\n    metrics?.volume,\n    event?.management?.expectedRemainingVolume,\n    event?.lastKnownState?.expectedRemainingVolume,\n    event?.management?.initialVolume,\n    event?.lastKnownState?.initialVolume,\n    state.trade?.remainingVolume,\n    state.trade?.initialVolume,\n  );`,
);

replaceExact(
  "Add positive position-context selector",
  `function numberOrNull(raw) {\n  const number = Number(raw);\n  return Number.isFinite(number) ? number : null;\n}\n\nfunction value(raw) {`,
  `function numberOrNull(raw) {\n  const number = Number(raw);\n  return Number.isFinite(number) ? number : null;\n}\n\nfunction firstPositiveNumber(...rawValues) {\n  for (const raw of rawValues) {\n    if (raw === null || raw === undefined || raw === "") continue;\n    const number = Number(raw);\n    if (Number.isFinite(number) && number > 0) return number;\n  }\n  return null;\n}\n\nfunction value(raw) {`,
);

fs.writeFileSync(notifierPath, source, "utf8");
console.log("PHASE7C_TELEGRAM_RECOVERY_CONTEXT_PATCH=APPLIED");
