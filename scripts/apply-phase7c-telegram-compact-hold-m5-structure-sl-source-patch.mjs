import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const notifierPath = path.join(scriptsDir, "run-phase7b-telegram-notifier.mjs");
const m5AdapterPath = path.join(scriptsDir, "phase7c-m5-structural-trailing-source-adapter.mjs");
const syntheticTestPath = path.join(scriptsDir, "phase7c-trade-notifier-synthetic.test.mjs");
const sidewaySampleTestPath = path.join(scriptsDir, "phase7c-sideway-production-telegram-sample.test.mjs");

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) {
    console.log(`${label}=ALREADY_PATCHED`);
    return source;
  }
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected source block not found`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: expected source block is not unique`);
  }
  console.log(`${label}=PATCHED`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let notifier = fs.readFileSync(notifierPath, "utf8");

notifier = replaceRequired(
  notifier,
  `  "STRUCTURAL_SL_TIGHTEN",\n  "STRUCTURAL_SL_REJECTED",`,
  `  "STRUCTURAL_SL_TIGHTEN",\n  "M5_STRUCTURAL_SL_TIGHTEN",\n  "SIDEWAY_M5_STRUCTURAL_SL_TIGHTEN",\n  "STRUCTURAL_SL_REJECTED",`,
  "NOTIFIER_INTERESTING_M5_STRUCTURE",
);

notifier = replaceRequired(
  notifier,
  `  "PLUS10_PARTIAL_REJECTED",\n\n  // Legacy Sideway journal compatibility only.`,
  `  "PLUS10_PARTIAL_REJECTED",\n  "SIDEWAY_M5_STRUCTURAL_SL_TIGHTEN",\n\n  // Legacy Sideway journal compatibility only.`,
  "NOTIFIER_SIDEWAY_M5_STRUCTURE",
);

notifier = replaceRequired(
  notifier,
  `      await sendHtml(html, route);`,
  `      await sendHtml(\n        html,\n        route,\n        {\n          includePhase:\n            !isHoldEvent(event) &&\n            ![\n              "STRUCTURAL_SL_TIGHTEN",\n              "M5_STRUCTURAL_SL_TIGHTEN",\n              "SIDEWAY_M5_STRUCTURAL_SL_TIGHTEN",\n            ].includes(type),\n        },\n      );`,
  "NOTIFIER_COMPACT_SEND",
);

notifier = replaceRequired(
  notifier,
  `    return compactTradeCard(\n      "🧩",\n      side,\n      "HOLD CONFIRMED",\n      [\n        ...lifecycleContextLines(event, enrichment),\n        \`🧾 <b>\${esc(reason)}</b>\`,\n      ],\n    );`,
  `    const ticket = String(\n      event.ticket ??\n      event.position?.ticket ??\n      "",\n    ).trim();\n\n    if (!ticket) return null;\n\n    const sideMarker = side === "BUY" ? "🟢" : "🔴";\n\n    return [\n      \`🧩 \${sideMarker} <b>\${esc(side)} · HOLD</b>\`,\n      \`🎫 <b>Ticket:</b> <code>\${esc(ticket)}</code>\`,\n      \`🧾 <b>\${esc(reason)}</b>\`,\n    ].join("\\n");`,
  "NOTIFIER_COMPACT_HOLD",
);

notifier = replaceRequired(
  notifier,
  `  if (type === "STRUCTURAL_SL_TIGHTEN") {\n    const side =\n      currentSide(\n        event,\n        enrichment,\n      );\n\n    const m = enrichment.metrics;\n\n    return compactTradeCard(\n      "🔒",\n      side,\n      "TRAIL SL",\n      [\n        ...lifecycleContextLines(event, enrichment),\n        \`🛡 <b>SL mới:</b> <code>\${fmtPrice(\n          m.stopLoss,\n        )}</code> · khóa <code>\${fmtSignedPrice(\n          m.slPriceMove,\n        )} giá</code> · <code>\${fmtMoney(\n          m.lockedPnlUsd,\n          true,\n        )}</code>\`,\n        compactStats(m),\n      ],\n    );\n  }`,
  `  if (\n    [\n      "STRUCTURAL_SL_TIGHTEN",\n      "M5_STRUCTURAL_SL_TIGHTEN",\n      "SIDEWAY_M5_STRUCTURAL_SL_TIGHTEN",\n    ].includes(type)\n  ) {\n    const side =\n      currentSide(\n        event,\n        enrichment,\n      );\n\n    const ticket = String(\n      event.ticket ??\n      event.position?.ticket ??\n      "",\n    ).trim();\n    const previousStopLoss = firstPositiveNumber(event.previousStopLoss);\n    const newStopLoss = firstPositiveNumber(event.stopLoss, enrichment.metrics?.stopLoss);\n\n    if (!ticket || previousStopLoss === null || newStopLoss === null) return null;\n\n    const isM5 = type !== "STRUCTURAL_SL_TIGHTEN";\n    const sideMarker = side === "BUY" ? "🟢" : "🔴";\n\n    return [\n      \`🛡 \${sideMarker} <b>\${esc(side)} · \${isM5 ? "SL → STRUCTURE M5" : "SL → STRUCTURE"}</b>\`,\n      \`🎫 <b>Ticket:</b> <code>\${esc(ticket)}</code>\`,\n      \`🛡 <b>SL:</b> <code>\${fmtPrice(previousStopLoss)} → \${fmtPrice(newStopLoss)}</code>\`,\n      \`🧾 <b>\${isM5 ? "Dời StopLoss theo cấu trúc M5 đã xác nhận." : "Dời StopLoss theo cấu trúc đã xác nhận."}</b>\`,\n    ].join("\\n");\n  }`,
  "NOTIFIER_STRUCTURE_CARD",
);

notifier = replaceRequired(
  notifier,
  `async function sendHtml(text, route = "trade") {`,
  `async function sendHtml(\n  text,\n  route = "trade",\n  { includePhase = true } = {},\n) {`,
  "NOTIFIER_SEND_OPTIONS",
);

notifier = replaceRequired(
  notifier,
  `  const phaseTaggedText = String(text).includes(phaseBanner)\n    ? String(text)\n    : \`\${String(text)}\\n<code>\${phaseBanner}</code>\`;`,
  `  const phaseTaggedText =\n    !includePhase ||\n    String(text).includes(phaseBanner)\n      ? String(text)\n      : \`\${String(text)}\\n<code>\${phaseBanner}</code>\`;`,
  "NOTIFIER_PHASE_OPTION",
);

fs.writeFileSync(notifierPath, notifier, "utf8");

let adapter = fs.readFileSync(m5AdapterPath, "utf8");
adapter = replaceRequired(
  adapter,
  `        journal("M5_STRUCTURAL_SL_TIGHTEN", {\n          ticket: managed.ticket,\n          stopLoss: m5Trail.stopLoss,`,
  `        journal("M5_STRUCTURAL_SL_TIGHTEN", {\n          ticket: managed.ticket,\n          previousStopLoss: position.stopLoss,\n          stopLoss: m5Trail.stopLoss,`,
  "TREND_M5_PREVIOUS_SL",
);
adapter = replaceRequired(
  adapter,
  `            journal("SIDEWAY_M5_STRUCTURAL_SL_TIGHTEN", {\n              ticket: managed.ticket,\n              stopLoss: m5Trail.stopLoss,`,
  `            journal("SIDEWAY_M5_STRUCTURAL_SL_TIGHTEN", {\n              ticket: managed.ticket,\n              previousStopLoss: position.stopLoss,\n              stopLoss: m5Trail.stopLoss,`,
  "SIDEWAY_M5_PREVIOUS_SL",
);
fs.writeFileSync(m5AdapterPath, adapter, "utf8");

let synthetic = fs.readFileSync(syntheticTestPath, "utf8");
synthetic = replaceRequired(synthetic, `    "HOLD CONFIRMED",`, `    "HOLD",`, "SYNTHETIC_HOLD_LABEL");
synthetic = replaceRequired(
  synthetic,
  `    assert.ok(\n      notifications[index].text.includes(\`PHASE 7C · \${accountMode}\`),\n      \`notification \${index + 1} must display PHASE 7C · \${accountMode}\`,\n    );`,
  `    if (index === 1) {\n      assert.doesNotMatch(notifications[index].text, /PHASE 7C ·/);\n    } else {\n      assert.ok(\n        notifications[index].text.includes(\`PHASE 7C · \${accountMode}\`),\n        \`notification \${index + 1} must display PHASE 7C · \${accountMode}\`,\n      );\n    }`,
  "SYNTHETIC_HOLD_PHASE",
);
synthetic = replaceRequired(synthetic, `  assert.match(hold, /HOLD CONFIRMED/);`, `  assert.match(hold, /SELL · HOLD/);`, "SYNTHETIC_RECOVERY_HOLD_LABEL");
synthetic = replaceRequired(
  synthetic,
  `  assert.match(hold, /4435\\.50/);\n  assert.match(hold, /4443\\.50/);\n  assert.match(hold, /4425\\.01/);\n  assert.match(hold, /0\\.03 lot/);`,
  `  assert.match(hold, /RECOVERY-ZERO-1/);\n  assert.match(hold, /Recovery TP đang hoạt động/);\n  assert.doesNotMatch(hold, /PHASE 7C ·/);\n  assert.doesNotMatch(hold, /Entry:/);\n  assert.doesNotMatch(hold, /SL:/);\n  assert.doesNotMatch(hold, /TP:/);\n  assert.doesNotMatch(hold, /Lot:/);`,
  "SYNTHETIC_RECOVERY_HOLD_DETAILS",
);
fs.writeFileSync(syntheticTestPath, synthetic, "utf8");

let sidewaySample = fs.readFileSync(sidewaySampleTestPath, "utf8");
sidewaySample = replaceRequired(
  sidewaySample,
  `  for (const notification of notifications) {\n    assert.equal(notification.route, "trade");\n    assert.match(notification.text, /PHASE 7C · LIVE/);\n  }`,
  `  for (const [index, notification] of notifications.entries()) {\n    assert.equal(notification.route, "trade");\n    if (index === 4) {\n      assert.doesNotMatch(notification.text, /PHASE 7C · LIVE/);\n    } else {\n      assert.match(notification.text, /PHASE 7C · LIVE/);\n    }\n  }`,
  "SIDEWAY_SAMPLE_HOLD_PHASE",
);
sidewaySample = replaceRequired(
  sidewaySample,
  `  assert.match(notifications[4].text, /HOLD CONFIRMED/);\n  assert.match(notifications[4].text, /GIỮ LỆNH: Biên sideway vẫn còn hiệu lực/);`,
  `  assert.match(notifications[4].text, /BUY · HOLD/);\n  assert.match(notifications[4].text, /SIDEWAY-PRODUCTION-SAMPLE-1/);\n  assert.match(notifications[4].text, /GIỮ LỆNH: Biên sideway vẫn còn hiệu lực/);\n  assert.doesNotMatch(notifications[4].text, /Regime:/);\n  assert.doesNotMatch(notifications[4].text, /Entry:/);\n  assert.doesNotMatch(notifications[4].text, /SL:/);\n  assert.doesNotMatch(notifications[4].text, /TP:/);\n  assert.doesNotMatch(notifications[4].text, /Lot:/);`,
  "SIDEWAY_SAMPLE_HOLD_DETAILS",
);
fs.writeFileSync(sidewaySampleTestPath, sidewaySample, "utf8");

console.log("PHASE7C_TELEGRAM_COMPACT_HOLD_M5_STRUCTURE_SL_SOURCE_PATCH=PASS");
