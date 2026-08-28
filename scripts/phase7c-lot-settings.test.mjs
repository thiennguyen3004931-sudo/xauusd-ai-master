import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  PHASE7C_LOT_LIMITS,
  Phase7CLotSettingsService,
  validatePhase7CLotSettings,
} from "../apps/api/dist/services/phase7c-lot-settings.service.js";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptsDir, "..");

test("lot settings default safely and require an armed matching executor", () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase7c-lot-settings-"));
  try {
    const settingsPath = path.join(root, "settings.json");
    const activePath = path.join(root, "active.json");
    const service = new Phase7CLotSettingsService(settingsPath, activePath);

    const initial = service.get();
    assert.equal(initial.state.trendFixedLot, 0.03);
    assert.equal(initial.state.sidewayRiskPercent, 0.25);
    assert.equal(initial.state.sidewayMaxLot, 0.03);
    assert.equal(initial.restartRequired, true);

    const saved = service.set({
      trendFixedLot: 0.06,
      sidewayRiskPercent: 0.4,
      sidewayMaxLot: 0.03,
    }, "test");
    assert.equal(saved.state.trendFixedLot, 0.06);
    assert.equal(saved.state.sidewayRiskPercent, 0.4);
    assert.equal(saved.state.sidewayMaxLot, 0.03);
    assert.equal(saved.restartRequired, true);

    writeFileSync(activePath, JSON.stringify({
      version: 1,
      trendFixedLot: 0.06,
      sidewayRiskPercent: 0.4,
      sidewayMaxLot: 0.03,
      armed: true,
      supervisorPid: process.pid,
      appliedAt: new Date().toISOString(),
    }));

    const active = service.get();
    assert.equal(active.activeAlive, true);
    assert.equal(active.restartRequired, false);
    assert.equal(active.safety.existingPositionMutation, false);
    assert.equal(active.safety.recoveryLotEscalation, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("lot settings reject non-third-compatible Trend lots and excessive risk", () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase7c-lot-settings-invalid-"));
  try {
    const service = new Phase7CLotSettingsService(
      path.join(root, "settings.json"),
      path.join(root, "active.json"),
    );
    assert.throws(() => service.set({
      trendFixedLot: 0.05,
      sidewayRiskPercent: 0.25,
      sidewayMaxLot: 0.03,
    }), /0\.03 increments/);
    assert.throws(() => service.set({
      trendFixedLot: 0.03,
      sidewayRiskPercent: 1.01,
      sidewayMaxLot: 0.03,
    }), /between 0\.01% and 1\.00%/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("canonical lot bounds cap Trend at 0.06 and Sideway cap at 0.04", () => {
  assert.equal(PHASE7C_LOT_LIMITS.maxDemoLot, 0.06, "public managed-lot ceiling must be 0.06");
  assert.equal(PHASE7C_LOT_LIMITS.maxManagedLot, 0.06, "canonical managed-lot ceiling must be 0.06");
  assert.equal(PHASE7C_LOT_LIMITS.maxTrendLot, 0.06, "Trend ceiling must be 0.06");
  assert.equal(PHASE7C_LOT_LIMITS.maxSidewayLot, 0.04, "Sideway cap ceiling must be 0.04");

  assert.deepEqual(
    validatePhase7CLotSettings({
      trendFixedLot: 0.06,
      sidewayRiskPercent: 0.25,
      sidewayMaxLot: 0.04,
    }),
    {
      trendFixedLot: 0.06,
      sidewayRiskPercent: 0.25,
      sidewayMaxLot: 0.04,
    },
    "0.04 is a Sideway Auto-Lot cap, not the executed managed lot",
  );

  assert.throws(
    () => validatePhase7CLotSettings({
      trendFixedLot: 0.09,
      sidewayRiskPercent: 0.25,
      sidewayMaxLot: 0.04,
    }),
    /Trend fixed lot.*0\.06/i,
    "Trend must fail closed above 0.06",
  );

  assert.throws(
    () => validatePhase7CLotSettings({
      trendFixedLot: 0.06,
      sidewayRiskPercent: 0.25,
      sidewayMaxLot: 0.05,
    }),
    /Sideway max lot.*0\.04/i,
    "Sideway cap must fail closed above 0.04",
  );
});

test("execution boundaries distinguish Trend managed-lot increments from Sideway cap increments", () => {
  const supervisor = readFileSync(path.join(scriptsDir, "run-phase7c-executors-local.ps1"), "utf8");
  const trendLauncher = readFileSync(path.join(scriptsDir, "run-phase7c-trend-controller-local.ps1"), "utf8");
  const sidewayLauncher = readFileSync(path.join(scriptsDir, "run-phase7c-sideway-controller-local.ps1"), "utf8");
  const accountModeLibrary = readFileSync(path.join(scriptsDir, "lib", "phase7c-account-mode.ps1"), "utf8");
  const trendController = readFileSync(path.join(scriptsDir, "run-phase7b-demo-controller.ts"), "utf8");
  const sidewayController = readFileSync(path.join(scriptsDir, "run-phase7c-sideway-controller.mjs"), "utf8");

  assert.match(supervisor, /\$TrendFixedVolume\s+-gt\s+0\.06/, "supervisor must cap Trend at 0.06");
  assert.match(supervisor, /\$SidewayMaxLot\s+-gt\s+0\.04/, "supervisor must cap Sideway at 0.04");
  assert.match(supervisor, /\$TrendFixedVolume\s*\/\s*0\.03/, "supervisor must preserve Trend one-third increment");
  assert.match(supervisor, /\$SidewayMaxLot\s*\/\s*0\.01/, "supervisor must treat Sideway max as a broker-step cap");
  assert.match(trendLauncher, /\$FixedVolume\s+-gt\s+0\.06/, "Trend launcher must cap at 0.06");
  assert.match(trendLauncher, /\$FixedVolume\s*\/\s*0\.03/, "Trend launcher must preserve one-third increment");
  assert.match(sidewayLauncher, /\$MaxLot\s+-gt\s+0\.04/, "Sideway launcher must cap at 0.04");
  assert.match(sidewayLauncher, /\$MaxLot\s*\/\s*0\.01/, "Sideway launcher must treat MaxLot as a cap increment");
  assert.match(accountModeLibrary, /\$trend\s*\/\s*0\.03/, "shared profile must preserve Trend one-third increment");
  assert.match(accountModeLibrary, /\$maxLot\s*\/\s*0\.01/, "shared profile must treat Sideway max as a broker-step cap");
  assert.match(trendController, /MAX_TREND_FIXED_VOLUME\s*=\s*0\.06/, "Trend controller must retain a direct 0.06 fail-closed ceiling");
  assert.match(sidewayController, /MAX_SIDEWAY_LOT\s*=\s*0\.04/, "Sideway controller must retain a direct 0.04 fail-closed ceiling");
  assert.match(sidewayController, /rawMaxLot\s*\/\s*0\.01/, "Sideway controller must validate the cap at broker-step precision");
});

test("API route keeps exact one-third on Trend but treats Sideway max as a broker-step cap", () => {
  const route = readFileSync(path.join(projectRoot, "apps", "api", "src", "routes", "phase7c.route.ts"), "utf8");

  assert.match(
    route,
    /Trend fixed lot[^\n]*exact one-third partial close/s,
    "Trend broker validation must retain exact one-third compatibility",
  );
  assert.match(
    route,
    /Sideway max lot[^\n]*broker step/s,
    "Sideway max broker validation must be cap/step validation rather than executed-lot one-third validation",
  );
  assert.doesNotMatch(
    route,
    /\["Trend fixed lot", input\.trendFixedLot\][\s\S]*\["Sideway max lot", input\.sidewayMaxLot\][\s\S]*Math\.round\(units\) % 3/,
    "Trend and Sideway cap must not share the same one-third validator",
  );
});

test("Web lot controls expose the canonical bounds and Sideway cap step", () => {
  const web = readFileSync(path.join(projectRoot, "apps", "web", "src", "pages", "Phase7CControlCenterPage.tsx"), "utf8");

  assert.match(
    web,
    /label="Trend fixed lot"[\s\S]*?max:\s*0\.06,\s*step:\s*0\.03/,
    "Web Trend control must expose max 0.06 with 0.03 managed-lot increments",
  );
  assert.match(
    web,
    /label="Sideway max lot"[\s\S]*?max:\s*0\.04,\s*step:\s*0\.01/,
    "Web Sideway cap must expose max 0.04 with broker-step 0.01 increments",
  );
});

test("Telegram dry-run preserves journal numeric precision and remains orderPermission=NONE", () => {
  const root = mkdtempSync(path.join(tmpdir(), "phase7c-telegram-journal-precision-"));
  try {
    const journalPath = path.join(root, "trend-events.jsonl");
    const statePath = path.join(root, "telegram-state.json");
    const sinkPath = path.join(root, "notifications.jsonl");
    const exactEntry = 4712.12345678;

    writeFileSync(journalPath, `${JSON.stringify({
      type: "ENTRY_SUBMIT",
      timestamp: "2026-08-28T01:00:00.000Z",
      side: "BUY",
      pattern: "M15_BULLISH_ENGULFING",
      signalEntry: exactEntry,
      stopLoss: 4704.12345678,
      stopDistance: 8,
      volume: 0.03,
    })}\n`, "utf8");

    const result = spawnSync(process.execPath, [path.join(scriptsDir, "run-phase7b-telegram-notifier.mjs")], {
      env: {
        ...process.env,
        ZIQ_TELEGRAM_BOT_TOKEN: "synthetic-token-not-used",
        ZIQ_TELEGRAM_CHAT_ID: "synthetic-chat-not-used",
        ZIQ_TELEGRAM_JOURNAL_PATH: journalPath,
        ZIQ_TELEGRAM_STATE_PATH: statePath,
        ZIQ_TELEGRAM_SYMBOL: "XAUUSD",
        ZIQ_PHASE7C_ACCOUNT_MODE: "DEMO",
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
      `notifier dry-run must exit cleanly\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );

    const notifications = readFileSync(sinkPath, "utf8")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));

    assert.equal(notifications.length, 1, "one journal event must produce one dry-run notification");
    assert.equal(notifications[0].orderPermission, "NONE", "notifier must remain read-only");
    assert.match(result.stdout, /PHASE7B_TELEGRAM_ORDER_PERMISSION=NONE_READ_ONLY_JOURNAL_AND_MONITOR/);
    assert.ok(
      notifications[0].text.includes(String(exactEntry)),
      `Telegram must preserve exact journal numeric precision ${exactEntry}; actual=${notifications[0].text}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
