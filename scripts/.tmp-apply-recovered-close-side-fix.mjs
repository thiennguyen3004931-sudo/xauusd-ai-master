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
        state.hold?.side ??
        event.side,
      );`,
  "close formatter side context",
);

replaceExactlyOnce(
`  const side = normalizeSide(state.trade?.side ?? event.side);`,
`  const side = normalizeSide(
    state.trade?.side ??
    event?.lastKnownState?.side ??
    event?.management?.side ??
    state.hold?.side ??
    event.side,
  );`,
  "closed-trade matcher side context",
);

fs.writeFileSync(notifierPath, source, "utf8");
console.log("RECOVERED_CLOSE_SIDE_PATCH=PASS");
