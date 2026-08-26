import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const notifierPath = path.join(scriptsDir, "run-phase7b-telegram-notifier.mjs");

const lifecycleEvents = [
  {
    type: "ENTRY_FILLED",
    timestamp: "2026-08-26T04:00:00.000Z",
    position: {
      ticket: "SYNTHETIC-1",
      side: "LONG",
      entry: 4700,
      stopLoss: 4692,
      volume: 0.12,
    },
    fvgConfirmedAtEntry: false,
  },
  {
    type: "FVG_HOLD_CONFIRMED",
    timestamp: "2026-08-26T04:01:00.000Z",
    ticket: "SYNTHETIC-1",
    side: "BUY",
    favorable: 4,
    stopLoss: 4692,
    m15CloseTime: 1787716860000,
  },
  {
    type: "PLUS6_SL_TO_ENTRY",
    timestamp: "2026-08-26T04:02:00.000Z",
    ticket: "SYNTHETIC-1",
    side: "BUY",
    favorable: 6,
    stopLoss: 4700,
  },
  {
    type: "PLUS10_PARTIAL_ONE_THIRD",
    timestamp: "2026-08-26T04:03:00.000Z",
    ticket: "SYNTHETIC-1",
    side: "BUY",
    favorable: 10,
    stopLoss: 4700,
    closedVolume: 0.04,
    remainingVolume: 0.08,
  },
  {
    type: "EXIT_EXECUTED",
    timestamp: "2026-08-26T04:04:00.000Z",
    ticket: "SYNTHETIC-1",
    side: "BUY",
    reason: "TEST_SYNTHETIC_EXIT",
  },
];

const rejectedEntryEvents = [
  {
    type: "ENTRY_SUBMIT",
    timestamp: "2026-08-26T10:00:00.000Z",
    side: "SELL",
    pattern: "M15_BEARISH_ENGULFING",
    signalEntry: 4720,
    stopLoss: 4728,
    stopDistance: 8,
    volume: 0.12,
  },
  {
    type: "ENTRY_REJECTED",
    timestamp: "2026-08-26T10:00:00.200Z",
    side: "SELL",
    message: "ARM_FILE_MISSING",
    reason: "ARM_FILE_MISSING",
    retcode: 423,
  },
];

function runJournal(accountMode, events, label) {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `phase7c-trade-notifier-${label}-${accountMode.toLowerCase()}-`),
  );
  const journalPath = path.join(tempDir, "trend-events.jsonl");
  const statePath = path.join(tempDir, "telegram-state.json");
  const sinkPath = path.join(tempDir, "dry-run-notifications.jsonl");

  fs.writeFileSync(
    journalPath,
    events.map((event) => JSON.stringify(event)).join("\n") + "\n",
    "utf8",
  );

  const result = spawnSync(process.execPath, [notifierPath], {
    env: {
      ...process.env,
      ZIQ_TELEGRAM_BOT_TOKEN: "synthetic-token-not-used",
      ZIQ_TELEGRAM_CHAT_ID: "synthetic-chat-not-used",
      ZIQ_TELEGRAM_JOURNAL_PATH: journalPath,
      ZIQ_TELEGRAM_STATE_PATH: statePath,
      ZIQ_TELEGRAM_SYMBOL: "XAUUSD",
      ZIQ_PHASE7C_ACCOUNT_MODE: accountMode,
      ZIQ_TELEGRAM_INTERVAL_MS: "1000",
      ZIQ_TELEGRAM_REPLAY_EXISTING: "true",
      ZIQ_TELEGRAM_SEND_STARTUP: "false",
      ZIQ_TELEGRAM_ONCE: "true",
      ZIQ_TELEGRAM_DRY_RUN: "true",
      ZIQ_TELEGRAM_DRY_RUN_SINK: sinkPath,
      ZIQ_TELEGRAM_MONITOR_API_URL: "http://127.0.0.1:9",
    },
    encoding: "utf8",
    timeout: 30_000,
  });

  assert.equal(
    result.status,
    0,
    `notifier process must exit cleanly in synthetic once mode\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  assert.ok(
    fs.existsSync(sinkPath),
    `synthetic dry-run sink must be created; stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );

  const notifications = fs
    .readFileSync(sinkPath, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  assert.match(result.stdout, /PHASE7B_TELEGRAM_ORDER_PERMISSION=NONE_READ_ONLY_JOURNAL_AND_MONITOR/);
  assert.doesNotMatch(result.stdout + result.stderr, /\/v1\/orders/);

  return notifications;
}

function runLifecycle(accountMode) {
  const notifications = runJournal(accountMode, lifecycleEvents, "lifecycle");

  assert.equal(notifications.length, 5, "ENTRY → HOLD → BE → partial → EXIT must emit exactly five trade notifications");

  const expectedFragments = [
    "FILLED",
    "HOLD CONFIRMED",
    "+6 → BE",
    "CHỐT 1/3",
    "CHỐT LỆNH",
  ];

  for (let index = 0; index < expectedFragments.length; index += 1) {
    assert.equal(notifications[index].route, "trade", `notification ${index + 1} must use the trade route`);
    assert.match(notifications[index].text, new RegExp(expectedFragments[index].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(
      notifications[index].text.includes(`PHASE 7C · ${accountMode}`),
      `notification ${index + 1} must display PHASE 7C · ${accountMode}`,
    );
  }

  return notifications;
}

test("LIVE synthetic journal lifecycle uses production notifier with PHASE 7C · LIVE", () => {
  runLifecycle("LIVE");
});

test("DEMO synthetic journal lifecycle uses production notifier with PHASE 7C · DEMO", () => {
  runLifecycle("DEMO");
});

test("ENTRY_SUBMIT is pending truthfully and ARM_FILE_MISSING rejection says MT5 did not enter", () => {
  const notifications = runJournal("LIVE", rejectedEntryEvents, "entry-truth");

  assert.equal(notifications.length, 2, "submit + reject must emit exactly two trade notifications");
  assert.equal(notifications[0].route, "trade");
  assert.match(notifications[0].text, /PENDING|ĐANG GỬI/i);
  assert.match(notifications[0].text, /CHƯA VÀO MT5/i);
  assert.doesNotMatch(notifications[0].text, /FILLED/i);

  assert.equal(notifications[1].route, "trade");
  assert.match(notifications[1].text, /KHÔNG VÀO MT5/i);
  assert.match(notifications[1].text, /ARM_FILE_MISSING/);
  assert.match(notifications[1].text, /423/);
});
