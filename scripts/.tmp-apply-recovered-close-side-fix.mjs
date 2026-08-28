import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const notifierPath = path.join(scriptsDir, "run-phase7b-telegram-notifier.mjs");
let source = fs.readFileSync(notifierPath, "utf8");

function replaceExactlyOnce(from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`${label}: source marker not found`);
  if (source.indexOf(from, first + from.length) >= 0) {
    throw new Error(`${label}: source marker matched more than once`);
  }
  source = source.replace(from, to);
}

replaceExactlyOnce(
`    const side =
      normalizeSide(
        closed?.side ??
        state.trade?.side ??
        event.side,
      );`,
`    const side =
      normalizeSide(
        closed?.side ??
        state.trade?.side ??
        event?.lastKnownState?.side ??
        event?.management?.side ??
        event.side,
      );`,
  "close formatter side context",
);

const matcherStart = source.indexOf("function matchClosedTrade(trades, event) {");
const matcherEnd = source.indexOf("\n}\n", matcherStart);
if (matcherStart < 0 || matcherEnd < 0) {
  throw new Error("closed-trade matcher scope not found");
}
const matcherBlock = source.slice(matcherStart, matcherEnd + 2);
const oldMatcherSide = `  const side = normalizeSide(state.trade?.side ?? event.side);`;
const newMatcherSide = `  const side = normalizeSide(\n    state.trade?.side ??\n    event?.lastKnownState?.side ??\n    event?.management?.side ??\n    event.side,\n  );`;
if (!matcherBlock.includes(oldMatcherSide)) {
  throw new Error("closed-trade matcher side marker not found in matcher scope");
}
if (matcherBlock.indexOf(oldMatcherSide) !== matcherBlock.lastIndexOf(oldMatcherSide)) {
  throw new Error("closed-trade matcher side marker matched more than once in matcher scope");
}
source =
  source.slice(0, matcherStart) +
  matcherBlock.replace(oldMatcherSide, newMatcherSide) +
  source.slice(matcherEnd + 2);

fs.writeFileSync(notifierPath, source, "utf8");
console.log("RECOVERED_CLOSE_SIDE_PATCH=PASS");
