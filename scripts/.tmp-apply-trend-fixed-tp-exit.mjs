import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve("scripts", "run-phase7b-demo-controller.ts");
let source = fs.readFileSync(sourcePath, "utf8");

if (source.includes("async function closeFixedTpIfTriggered(")) {
  console.log("TREND_FIXED_TP_EXIT_PATCH=ALREADY_APPLIED");
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
  "fixed TP imports",
);

const helper = `async function closeFixedTpIfTriggered(\n  position: Position,\n  quote: Quote,\n): Promise<boolean> {\n  const managed = state.managed!;\n\n  // Keep the migration/default path production-equivalent: no extra broker I/O\n  // when this additive feature is disabled for the immutable managed snapshot.\n  if (!managed.fixedTpEnabled || !Number.isFinite(Number(managed.fixedTpPrice))) {\n    return false;\n  }\n\n  const positions = await get<Position[]>(\n    \`/v1/positions?symbol=\${encodeURIComponent(symbol)}\`,\n  );\n  if (positions.length !== 1) {\n    journal("FIXED_TP_CLOSE_BLOCKED", {\n      ticket: managed.ticket,\n      reason: "FIXED_TP_RECONCILE_REQUIRES_EXACTLY_ONE_POSITION",\n      positions: positions.map((row) => ({ ticket: row.ticket, side: row.side, volume: row.volume })),\n    });\n    return true;\n  }\n\n  // Reconcile again at the Fixed TP decision point. This matters after a +10\n  // partial in the same management cycle: position.volume must be the actual\n  // remaining broker volume, not the pre-partial snapshot passed by cycle().\n  position = positions[0]!;\n\n  if (!isFixedTpTriggered({\n    enabled: managed.fixedTpEnabled,\n    side: managed.side,\n    targetPrice: managed.fixedTpPrice,\n    bid: quote.bid,\n    ask: quote.ask,\n  })) {\n    return false;\n  }\n\n  journal("FIXED_TP_TRIGGERED", {\n    ticket: managed.ticket,\n    side: managed.side,\n    targetPrice: managed.fixedTpPrice,\n    bid: quote.bid,\n    ask: quote.ask,\n    volume: position.volume,\n  });\n\n  if (position.ticket !== managed.ticket) {\n    journal("FIXED_TP_CLOSE_BLOCKED", {\n      ticket: managed.ticket,\n      actualTicket: position.ticket,\n      reason: "MANAGED_TICKET_MISMATCH",\n    });\n    return true;\n  }\n\n  const expectedSide = managed.side === "BUY" ? "LONG" : "SHORT";\n  if (position.side !== expectedSide) {\n    journal("FIXED_TP_CLOSE_BLOCKED", {\n      ticket: managed.ticket,\n      expectedSide,\n      actualSide: position.side,\n      reason: "MANAGED_SIDE_MISMATCH",\n    });\n    return true;\n  }\n\n  if (!(Number.isFinite(position.volume) && position.volume > 0)) {\n    journal("FIXED_TP_CLOSE_BLOCKED", {\n      ticket: managed.ticket,\n      volume: position.volume,\n      reason: "POSITION_VOLUME_INVALID",\n    });\n    return true;\n  }\n\n  const health = await get<Health>("/health");\n  const accountLogin = Number(health.accountLogin);\n  if (\n    health.status !== "ok" ||\n    health.accountMode !== "demo" ||\n    !health.connected ||\n    !health.tradingEnabled ||\n    !health.terminalTradeAllowed ||\n    !health.expertTradeAllowed ||\n    !Number.isFinite(accountLogin) ||\n    state.accountLogin !== accountLogin ||\n    !allowedLogins.has(accountLogin)\n  ) {\n    journal("FIXED_TP_CLOSE_BLOCKED", {\n      ticket: managed.ticket,\n      reason: "EXECUTION_GUARD_BLOCK",\n      accountLogin: health.accountLogin ?? null,\n      expectedAccountLogin: state.accountLogin,\n      accountMode: health.accountMode ?? null,\n      connected: health.connected,\n      tradingEnabled: health.tradingEnabled,\n      terminalTradeAllowed: health.terminalTradeAllowed,\n      expertTradeAllowed: health.expertTradeAllowed,\n    });\n    return true;\n  }\n\n  const commandId = fixedTpCommandId("trend", managed.ticket);\n  const lock = acquireExecutionLock({\n    owner: \`TREND_FIXED_TP:\${managed.ticket}\`,\n  });\n\n  if (!lock.acquired) {\n    journal("FIXED_TP_CLOSE_BLOCKED", {\n      ticket: managed.ticket,\n      commandId,\n      reason: lock.reason ?? "LOCK_BUSY",\n      lockFile: lock.file,\n      lockAgeMs: lock.ageMs ?? null,\n    });\n    return true;\n  }\n\n  try {\n    journal("FIXED_TP_CLOSE_ATTEMPT", {\n      ticket: managed.ticket,\n      side: managed.side,\n      volume: position.volume,\n      targetPrice: managed.fixedTpPrice,\n      commandId,\n    });\n\n    const response = await post<CommandResponse>(\n      \`/v1/positions/\${encodeURIComponent(managed.ticket)}/close\`,\n      {\n        volume: position.volume,\n        commandId,\n      },\n    );\n\n    if (!response.success) {\n      journal("FIXED_TP_CLOSE_BLOCKED", {\n        ticket: managed.ticket,\n        commandId,\n        volume: position.volume,\n        reason: "BROKER_CLOSE_REJECTED",\n        response,\n      });\n      return true;\n    }\n\n    if (response.idempotentReplay) {\n      journal("FIXED_TP_CLOSE_REPLAY", {\n        ticket: managed.ticket,\n        commandId,\n        volume: position.volume,\n        response,\n      });\n    } else {\n      journal("FIXED_TP_CLOSE_CONFIRMED", {\n        ticket: managed.ticket,\n        commandId,\n        volume: position.volume,\n        response,\n      });\n    }\n\n    state.managed = null;\n    saveState();\n    return true;\n  } catch (error) {\n    journal("FIXED_TP_CLOSE_BLOCKED", {\n      ticket: managed.ticket,\n      commandId,\n      volume: position.volume,\n      reason: "BROKER_CLOSE_ERROR",\n      message: errorMessage(error),\n    });\n    return true;\n  } finally {\n    lock.release();\n  }\n}\n\n`;

source = replaceOnce(
  source,
  "async function managePosition(position: Position, quote: Quote, spec: SymbolSpec, m15: Phase7Bar[]): Promise<void> {",
  helper + "async function managePosition(position: Position, quote: Quote, spec: SymbolSpec, m15: Phase7Bar[]): Promise<void> {",
  "managePosition insertion",
);

source = replaceOnce(
  source,
  '  if (managed.dailyMode === "RECOVERY_TP") {\n    const hold =',
  '  if (managed.dailyMode === "RECOVERY_TP") {\n    if (await closeFixedTpIfTriggered(position, quote)) return;\n\n    const hold =',
  "Recovery Fixed TP precedence",
);

source = replaceOnce(
  source,
  "  }\n\n  const latest = latestM15;",
  "  }\n\n  if (await closeFixedTpIfTriggered(position, quote)) return;\n\n  const latest = latestM15;",
  "normal Fixed TP precedence",
);

fs.writeFileSync(sourcePath, source, "utf8");
console.log("TREND_FIXED_TP_EXIT_PATCH=APPLIED");
