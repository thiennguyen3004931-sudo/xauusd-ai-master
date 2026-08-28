import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const notifierPath = path.join(scriptsDir, "run-phase7b-telegram-notifier.mjs");

function runRecoveredCloseLifecycle() {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase7c-recovered-close-"),
  );
  const trendJournalPath = path.join(tempDir, "trend-events.jsonl");
  const sidewayJournalPath = path.join(tempDir, "sideway-events.jsonl");
  const statePath = path.join(tempDir, "telegram-state.json");
  const sinkPath = path.join(tempDir, "dry-run-notifications.jsonl");

  const events = [
    {
      type: "PENDING_ENTRY_RECOVERED",
      timestamp: "2026-08-28T20:06:02.584Z",
      orderId: "p7b-im-1787947200000-SELL",
      brokerTicket: null,
      ticket: "304488599",
      side: "SELL",
      volume: 0.12,
    },
    {
      type: "HOLD_POSITION",
      timestamp: "2026-08-28T20:06:02.611Z",
      ticket: "304488599",
      side: "SELL",
      dailyMode: "TREND",
      reasonCode: "HOLD_TREND_STRUCTURE_INTACT",
      reason: "GIỮ LỆNH: Cấu trúc xu hướng M15 vẫn còn hiệu lực; chưa có điều kiện thoát lệnh.",
    },
    {
      type: "MANAGED_POSITION_CLOSED",
      timestamp: "2026-08-28T20:06:33.734Z",
      ticket: "304488599",
      lastKnownState: {
        ticket: "304488599",
        side: "SELL",
        pattern: "ENGULFING",
        signalEntry: 4458.2,
        entry: 4461.14,
        initialVolume: 0.12,
        expectedRemainingVolume: 0.12,
        stopDistance: 6,
        breakEvenApplied: false,
        partialApplied: false,
        lastStructuralStop: 4467,
        dailyMode: "TREND",
        dailyNetPnlAtEntry: 0,
      },
    },
  ];

  fs.writeFileSync(
    trendJournalPath,
    events.map((event) => JSON.stringify(event)).join("\n") + "\n",
    "utf8",
  );
  fs.writeFileSync(sidewayJournalPath, "", "utf8");

  const result = spawnSync(process.execPath, [notifierPath], {
    env: {
      ...process.env,
      ZIQ_TELEGRAM_BOT_TOKEN: "synthetic-token-not-used",
      ZIQ_TELEGRAM_CHAT_ID: "synthetic-chat-not-used",
      ZIQ_TELEGRAM_JOURNAL_PATH: trendJournalPath,
      ZIQ_TELEGRAM_SIDEWAY_JOURNAL_PATH: sidewayJournalPath,
      ZIQ_TELEGRAM_STATE_PATH: statePath,
      ZIQ_TELEGRAM_SYMBOL: "XAUUSD",
      ZIQ_PHASE7C_ACCOUNT_MODE: "LIVE",
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
    `notifier must exit cleanly\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );

  const notifications = fs
    .readFileSync(sinkPath, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  return notifications;
}

test("recovered SELL close preserves side from lastKnownState when MT5 history is not ready", () => {
  const notifications = runRecoveredCloseLifecycle();
  const close = notifications.find((item) => /CHỐT LỆNH|CLOSED/i.test(item.text));

  assert.ok(close, "MANAGED_POSITION_CLOSED must emit a close notification");
  assert.match(
    close.text,
    /SELL/,
    "RED_TARGET_RECOVERED_CLOSE_SIDE: recovered SELL must not silently default to BUY when closed-trade history is unavailable",
  );
  assert.doesNotMatch(close.text, /BUY/);
});
