import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  phase7CHoldDedupeKey,
  resolvePhase7CHoldReason,
} from "../apps/api/src/services/phase7c-hold-reason.service.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, "..");
const monitorSource = fs.readFileSync(
  path.join(repoRoot, "apps/api/src/services/phase7c-decision-monitor.service.ts"),
  "utf8",
);
const notifierSource = fs.readFileSync(
  path.join(repoRoot, "scripts/run-phase7b-telegram-notifier.mjs"),
  "utf8",
);

const TREND_MESSAGE = "GIỮ LỆNH: Cấu trúc xu hướng M15 vẫn còn hiệu lực; chưa có điều kiện thoát lệnh.";
const SIDEWAY_MESSAGE = "GIỮ LỆNH: Biên sideway vẫn còn hiệu lực; tiếp tục giữ đến TP2 hoặc khi có điều kiện thoát.";
const RECOVERY_MESSAGE = "GIỮ LỆNH: Recovery TP đang hoạt động; giữ toàn bộ vị thế đến Adaptive TP hoặc SL/BE.";

test("Trend HOLD uses the exact canonical code and Vietnamese backend message", () => {
  assert.deepEqual(
    resolvePhase7CHoldReason({ strategy: "TREND", dailyMode: "TREND" }),
    {
      holdReasonCode: "HOLD_TREND_STRUCTURE_INTACT",
      holdReason: TREND_MESSAGE,
    },
  );
});

test("Sideway HOLD uses the exact canonical code and Vietnamese backend message", () => {
  assert.deepEqual(
    resolvePhase7CHoldReason({ strategy: "SIDEWAY", dailyMode: "SIDEWAY" }),
    {
      holdReasonCode: "HOLD_SIDEWAY_RANGE_VALID",
      holdReason: SIDEWAY_MESSAGE,
    },
  );
});

test("Recovery HOLD has precedence over ordinary Trend and Sideway HOLD", () => {
  for (const strategy of ["TREND", "SIDEWAY"]) {
    assert.deepEqual(
      resolvePhase7CHoldReason({ strategy, dailyMode: "RECOVERY_TP" }),
      {
        holdReasonCode: "HOLD_RECOVERY_TP_ACTIVE",
        holdReason: RECOVERY_MESSAGE,
      },
    );
  }
});

test("unmanaged positions do not invent a canonical HOLD reason", () => {
  assert.deepEqual(
    resolvePhase7CHoldReason({ strategy: null, dailyMode: null }),
    { holdReasonCode: null, holdReason: null },
  );
});

test("Telegram dedupe identity is exactly ticket + holdReasonCode", () => {
  const trend = phase7CHoldDedupeKey("9001", "HOLD_TREND_STRUCTURE_INTACT");
  assert.equal(trend, "9001|HOLD_TREND_STRUCTURE_INTACT");
  assert.equal(
    phase7CHoldDedupeKey("9001", "HOLD_TREND_STRUCTURE_INTACT"),
    trend,
    "same ticket + same code must dedupe",
  );
  assert.notEqual(
    phase7CHoldDedupeKey("9001", "HOLD_RECOVERY_TP_ACTIVE"),
    trend,
    "same ticket + changed code must emit",
  );
  assert.notEqual(
    phase7CHoldDedupeKey("9002", "HOLD_TREND_STRUCTURE_INTACT"),
    trend,
    "different ticket + same code must emit",
  );
});

test("decision monitor is the single canonical HOLD source for MT5 and Web", () => {
  assert.match(monitorSource, /phase7c-hold-reason\.service\.mjs/);
  assert.match(monitorSource, /resolvePhase7CHoldReason/);
  assert.match(monitorSource, /holdReasonCode:/);
  assert.match(monitorSource, /\["holdReasonCode",\s*position\.holdReasonCode\]/);
  assert.doesNotMatch(monitorSource, /function journalHoldReason\s*\(/);
  assert.doesNotMatch(monitorSource, /Giữ runner: FVG cùng hướng/);
});

test("Telegram consumes canonical HOLD from decision-monitor and does not rebuild Vietnamese reason", () => {
  assert.match(notifierSource, /phase7CHoldDedupeKey/);
  assert.match(notifierSource, /decision-monitor/);
  assert.match(notifierSource, /holdReasonCode/);
  assert.match(notifierSource, /holdReason/);
  assert.doesNotMatch(notifierSource, /FVG_MA50_HOLD/);
  assert.doesNotMatch(notifierSource, /FVG cùng hướng · tiếp tục giữ\./);
  assert.doesNotMatch(notifierSource, /GIỮ LỆNH: Cấu trúc xu hướng M15/);
  assert.doesNotMatch(notifierSource, /GIỮ LỆNH: Biên sideway/);
  assert.doesNotMatch(notifierSource, /GIỮ LỆNH: Recovery TP/);
});
