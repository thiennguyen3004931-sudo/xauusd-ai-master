import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function update(pathname, transform) {
  const file = path.join(root, pathname);
  const before = fs.readFileSync(file, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`No change produced for ${pathname}`);
  fs.writeFileSync(file, after, "utf8");
}

function replaceExact(source, before, after, label, expected = 1) {
  const count = source.split(before).length - 1;
  if (count !== expected) {
    throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  }
  return source.split(before).join(after);
}

function replaceRegex(source, regex, after, label) {
  const matches = source.match(regex);
  if (!matches || matches.length !== 1) {
    throw new Error(`${label}: expected one regex match`);
  }
  return source.replace(regex, after);
}

update("scripts/run-phase7b-telegram-notifier.mjs", (input) => {
  let source = input;

  source = replaceExact(
    source,
    "    holdSentKeys: {},\n    systemAlerts: {},",
    "    holdSentKeys: {},\n    holdM15ByTicketReason: {},\n    systemAlerts: {},",
    "notifier state defaults",
    2,
  );

  source = replaceExact(
    source,
    "state.holdSentKeys ??= {};\n",
    "state.holdSentKeys ??= {};\nstate.holdM15ByTicketReason ??= {};\n",
    "notifier state normalization",
  );

  source = replaceExact(
    source,
    "      hold:\n        parsed.hold &&\n        typeof parsed.hold === \"object\"\n          ? parsed.hold\n          : null,\n\n      systemAlerts:",
    "      hold:\n        parsed.hold &&\n        typeof parsed.hold === \"object\"\n          ? parsed.hold\n          : null,\n\n      holdM15ByTicketReason:\n        parsed.holdM15ByTicketReason &&\n        typeof parsed.holdM15ByTicketReason === \"object\"\n          ? { ...parsed.holdM15ByTicketReason }\n          : {},\n\n      systemAlerts:",
    "notifier loadState HOLD M15 restore",
  );

  source = replaceRegex(
    source,
    /function holdKey\(event\) \{[\s\S]*?\n\}\n\nfunction shouldSuppressHoldAddon/,
    `function holdM15CloseTime(event) {\n  const explicit = Number(event?.m15CloseTime);\n  if (Number.isFinite(explicit) && explicit > 0) {\n    return explicit;\n  }\n\n  const timestampMs = Date.parse(String(event?.timestamp ?? \"\"));\n  if (Number.isFinite(timestampMs)) {\n    return Math.floor(timestampMs / (15 * 60_000)) * (15 * 60_000);\n  }\n\n  return 0;\n}\n\nfunction holdKey(event) {\n  const ticket =\n    String(\n      event?.ticket ??\n      state.trade?.ticket ??\n      \"\",\n    );\n\n  return \`${"${ticket}"}|${"${holdReasonCode(event)}"}\`;\n}\n\nfunction holdM15Key(event) {\n  return \`${"${holdKey(event)}"}|${"${holdM15CloseTime(event)}"}\`;\n}\n\nfunction shouldSuppressHold(event) {\n  const key = holdKey(event);\n  const m15CloseTime = holdM15CloseTime(event);\n\n  state.holdM15ByTicketReason ??= {};\n\n  if (\n    m15CloseTime > 0 &&\n    Number(state.holdM15ByTicketReason[key]) === m15CloseTime\n  ) {\n    if (state.hold?.key === key) {\n      state.hold.lastSeenAt =\n        String(\n          event?.timestamp ??\n          new Date().toISOString(),\n        );\n      state.hold.lastM15CloseTime = m15CloseTime;\n      state.hold.m15Key = holdM15Key(event);\n    }\n\n    saveState();\n    return true;\n  }\n\n  return false;\n}\n\nfunction shouldSuppressHoldAddon`,
    "notifier HOLD M15 suppress replacement",
  );

  source = replaceRegex(
    source,
    /function markHold\(event\) \{[\s\S]*?\n\}\n\nfunction releaseHold/,
    `function markHold(event) {\n  const key = holdKey(event);\n  const m15CloseTime = holdM15CloseTime(event);\n  const reasonCode = holdReasonCode(event);\n  const confirmedAt =\n    String(\n      event?.timestamp ??\n      new Date().toISOString(),\n    );\n\n  state.holdM15ByTicketReason ??= {};\n  if (m15CloseTime > 0) {\n    state.holdM15ByTicketReason[key] = m15CloseTime;\n  }\n\n  state.hold = {\n    active: true,\n    key,\n    m15Key: holdM15Key(event),\n    reasonCode,\n    ticket:\n      String(\n        event?.ticket ??\n        state.trade?.ticket ??\n        \"\",\n      ),\n    side:\n      normalizeSide(\n        event?.side ??\n        state.trade?.side,\n      ),\n    confirmedAt,\n    lastSeenAt: confirmedAt,\n    lastM15CloseTime:\n      m15CloseTime > 0\n        ? m15CloseTime\n        : null,\n  };\n}\n\nfunction releaseHold`,
    "notifier HOLD M15 mark replacement",
  );

  return source;
});

update("scripts/run-phase7b-demo-controller.ts", (input) => {
  let source = input;

  source = replaceExact(
    source,
    "  lastTrendM15CloseChecked: number;\n  beAttempt: number;",
    "  lastTrendM15CloseChecked: number;\n  lastHoldM15Key?: string;\n  beAttempt: number;",
    "trend managed HOLD state type",
  );

  source = replaceExact(
    source,
    "  const favorable = managed.side === \"BUY\" ? exitPrice - position.entry : position.entry - exitPrice;\n",
    "  const favorable = managed.side === \"BUY\" ? exitPrice - position.entry : position.entry - exitPrice;\n  const latestM15 = m15.at(-1);\n  const holdM15CloseTime = Number(latestM15?.closeTime ?? 0);\n",
    "trend M15 identity",
  );

  source = replaceExact(
    source,
    "? `${managed.ticket}|${hold.reasonCode}`\n        : \"\";",
    "? `${managed.ticket}|${hold.reasonCode}|${holdM15CloseTime}`\n        : \"\";",
    "trend HOLD key",
    2,
  );

  source = replaceExact(
    source,
    "      hold &&\n      holdKey !== lastHoldObservationKey\n    ) {\n      lastHoldObservationKey =\n        holdKey;",
    "      hold &&\n      holdM15CloseTime > 0 &&\n      holdKey !== managed.lastHoldM15Key\n    ) {\n      managed.lastHoldM15Key = holdKey;\n      saveState();",
    "trend persisted HOLD dedupe",
    2,
  );

  source = replaceExact(
    source,
    "        side: managed.side,\n        dailyMode:",
    "        side: managed.side,\n        m15CloseTime: holdM15CloseTime,\n        dailyMode:",
    "trend HOLD journal M15",
    2,
  );

  source = replaceExact(
    source,
    "  const latest = m15.at(-1);\n  if (!latest) return;",
    "  const latest = latestM15;\n  if (!latest) return;",
    "trend reuse latest M15",
  );

  return source;
});

update("scripts/run-phase7c-sideway-controller.mjs", (input) => {
  let source = input;

  source = replaceExact(
    source,
    "    lastRegimeCloseChecked: Number(pending.lastRegimeCloseChecked ?? 0),\n    openedAt,",
    "    lastRegimeCloseChecked: Number(pending.lastRegimeCloseChecked ?? 0),\n    lastHoldM15Key: \"\",\n    openedAt,",
    "sideway managed HOLD state",
  );

  source = replaceExact(
    source,
    "  const quoteFreshness = evaluateTimestampFreshness(quote?.timestamp, { maxAgeMs: maxQuoteAgeMs, clockOffsetMs: brokerClockOffsetMs });",
    "  const holdM15CloseTime = Number(managed.lastRegimeCloseChecked ?? 0);\n\n  const quoteFreshness = evaluateTimestampFreshness(quote?.timestamp, { maxAgeMs: maxQuoteAgeMs, clockOffsetMs: brokerClockOffsetMs });",
    "sideway M15 identity",
  );

  source = replaceExact(
    source,
    "? `${managed.ticket}|${hold.reasonCode}`\n        : \"\";",
    "? `${managed.ticket}|${hold.reasonCode}|${holdM15CloseTime}`\n        : \"\";",
    "sideway HOLD key",
    2,
  );

  source = replaceExact(
    source,
    "      hold &&\n      holdKey !== lastHoldObservationKey\n    ) {\n      lastHoldObservationKey =\n        holdKey;",
    "      hold &&\n      holdM15CloseTime > 0 &&\n      holdKey !== managed.lastHoldM15Key\n    ) {\n      managed.lastHoldM15Key = holdKey;\n      saveState();",
    "sideway persisted HOLD dedupe",
    2,
  );

  source = replaceExact(
    source,
    "        side: managed.side,\n        dailyMode:",
    "        side: managed.side,\n        m15CloseTime: holdM15CloseTime,\n        dailyMode:",
    "sideway HOLD journal M15",
    2,
  );

  return source;
});

console.log("PHASE7C_HOLD_M15_PATCH=APPLIED");
