import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve("scripts", "run-phase7c-sideway-controller.mjs");
let source = fs.readFileSync(sourcePath, "utf8");

if (source.includes("async function closeFixedTpIfTriggered(")) {
  console.log("SIDEWAY_FIXED_TP_EXIT_PATCH=ALREADY_APPLIED");
  process.exit(0);
}

function replaceOnce(input, from, to, label) {
  const first = input.indexOf(from);
  if (first < 0) throw new Error(`Missing patch marker: ${label}`);
  if (input.indexOf(from, first + from.length) >= 0) {
    throw new Error(`Patch marker is not unique: ${label}`);
  }
  return input.slice(0, first) + to + input.slice(first + from.length);
}

source = replaceOnce(
  source,
  'import { buildFixedTpSnapshot } from "./phase7c-fixed-tp.mjs";',
  `import { acquireExecutionLock } from "./phase7c-execution-lock.mjs";\nimport {\n  buildFixedTpSnapshot,\n  isFixedTpTriggered,\n  fixedTpCommandId,\n} from "./phase7c-fixed-tp.mjs";`,
  "Fixed TP exit imports",
);

const helper = `async function closeFixedTpIfTriggered(position, quote) {\n  const managed = state.managed;\n\n  // Preserve the additive OFF path: no extra broker I/O when the immutable\n  // managed snapshot has Fixed TP disabled.\n  if (!managed?.fixedTpEnabled || !Number.isFinite(Number(managed.fixedTpPrice))) {\n    return false;\n  }\n\n  if (!isFixedTpTriggered({\n    enabled: managed.fixedTpEnabled,\n    side: managed.side,\n    targetPrice: managed.fixedTpPrice,\n    bid: quote.bid,\n    ask: quote.ask,\n  })) {\n    return false;\n  }\n\n  journal("FIXED_TP_TRIGGERED", {\n    ticket: managed.ticket,\n    side: managed.side,\n    targetPrice: managed.fixedTpPrice,\n    bid: quote.bid,\n    ask: quote.ask,\n  });\n\n  let positions;\n  try {\n    positions = await bridgeGet(\n      \`/v1/positions?symbol=\${encodeURIComponent(symbol)}\`,\n    );\n  } catch (error) {\n    journal("FIXED_TP_CLOSE_BLOCKED", {\n      ticket: managed.ticket,\n      reason: "FIXED_TP_RECONCILE_ERROR",\n      message: errorMessage(error),\n    });\n    return true;\n  }\n\n  if (!Array.isArray(positions) || positions.length !== 1) {\n    journal("FIXED_TP_CLOSE_BLOCKED", {\n      ticket: managed.ticket,\n      reason: "FIXED_TP_RECONCILE_REQUIRES_EXACTLY_ONE_POSITION",\n      positions: Array.isArray(positions)\n        ? positions.map((row) => ({ ticket: row.ticket, side: row.side, volume: row.volume }))\n        : null,\n    });\n    return true;\n  }\n\n  // Reconcile at the actual Fixed TP decision point. If the native +10 partial\n  // already succeeded in this cycle, this snapshot contains only the broker's\n  // current remaining volume.\n  position = positions[0];\n\n  if (position.ticket !== managed.ticket) {\n    journal("FIXED_TP_CLOSE_BLOCKED", {\n      ticket: managed.ticket,\n      actualTicket: position.ticket,\n      reason: "MANAGED_TICKET_MISMATCH",\n    });\n    return true;\n  }\n\n  const expectedSide = managed.side === "BUY" ? "LONG" : "SHORT";\n  if (position.side !== expectedSide) {\n    journal("FIXED_TP_CLOSE_BLOCKED", {\n      ticket: managed.ticket,\n      expectedSide,\n      actualSide: position.side,\n      reason: "MANAGED_SIDE_MISMATCH",\n    });\n    return true;\n  }\n\n  if (!(Number.isFinite(Number(position.volume)) && Number(position.volume) > 0)) {\n    journal("FIXED_TP_CLOSE_BLOCKED", {\n      ticket: managed.ticket,\n      volume: position.volume,\n      reason: "POSITION_VOLUME_INVALID",\n    });\n    return true;\n  }\n\n  const commandId = fixedTpCommandId("sideway", managed.ticket);\n  const lock = acquireExecutionLock({\n    owner: \`SIDEWAY_FIXED_TP:\${managed.ticket}\`,\n  });\n\n  if (!lock.acquired) {\n    journal("FIXED_TP_CLOSE_BLOCKED", {\n      ticket: managed.ticket,\n      commandId,\n      reason: lock.reason ?? "LOCK_BUSY",\n      lockFile: lock.file,\n      lockAgeMs: lock.ageMs ?? null,\n    });\n    return true;\n  }\n\n  try {\n    journal("FIXED_TP_CLOSE_ATTEMPT", {\n      ticket: managed.ticket,\n      side: managed.side,\n      volume: Number(position.volume),\n      targetPrice: managed.fixedTpPrice,\n      commandId,\n    });\n\n    const response = await bridgeRequest(\n      "POST",\n      \`/v1/positions/\${encodeURIComponent(managed.ticket)}/close\`,\n      {\n        volume: Number(position.volume),\n        commandId,\n      },\n    );\n\n    if (!response.success) {\n      journal("FIXED_TP_CLOSE_BLOCKED", {\n        ticket: managed.ticket,\n        commandId,\n        volume: Number(position.volume),\n        reason: "BROKER_CLOSE_REJECTED",\n        response,\n      });\n      return true;\n    }\n\n    if (response.idempotentReplay) {\n      journal("FIXED_TP_CLOSE_REPLAY", {\n        ticket: managed.ticket,\n        commandId,\n        volume: Number(position.volume),\n        response,\n      });\n    } else {\n      journal("FIXED_TP_CLOSE_CONFIRMED", {\n        ticket: managed.ticket,\n        commandId,\n        volume: Number(position.volume),\n        response,\n      });\n    }\n\n    state.managed = null;\n    saveState();\n    return true;\n  } catch (error) {\n    journal("FIXED_TP_CLOSE_BLOCKED", {\n      ticket: managed.ticket,\n      commandId,\n      volume: Number(position.volume),\n      reason: "BROKER_CLOSE_ERROR",\n      message: errorMessage(error),\n    });\n    return true;\n  } finally {\n    lock.release();\n  }\n}\n\n`;

source = replaceOnce(
  source,
  "async function managePosition(position, quote, spec, brokerClockOffsetMs = 0) {",
  helper + "async function managePosition(position, quote, spec, brokerClockOffsetMs = 0) {",
  "Fixed TP helper insertion",
);

source = replaceOnce(
  source,
  '  if (managed.dailyMode === "RECOVERY_TP") {\n    const hold =',
  '  if (managed.dailyMode === "RECOVERY_TP") {\n    if (await closeFixedTpIfTriggered(position, quote)) return;\n\n    const hold =',
  "Daily Recovery Fixed TP precedence",
);

source = replaceOnce(
  source,
  "  }\n\n  // TP2 is already broker-protected on the position. This fallback closes",
  "  }\n\n  if (await closeFixedTpIfTriggered(position, quote)) return;\n\n  // TP2 is already broker-protected on the position. This fallback closes",
  "normal Fixed TP precedence before TP2 fallback",
);

fs.writeFileSync(sourcePath, source, "utf8");
console.log("SIDEWAY_FIXED_TP_EXIT_PATCH=APPLIED");
