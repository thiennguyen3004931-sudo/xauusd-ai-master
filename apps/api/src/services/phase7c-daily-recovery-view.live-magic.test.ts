import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePhase7CDailyRecoveryMagicNumbers,
} from "./phase7c-daily-recovery-view.service";

test("Daily Recovery uses LIVE trend magic when Phase 7C account mode is LIVE and API env has no MT5_MAGIC_NUMBER", () => {
  const resolved = resolvePhase7CDailyRecoveryMagicNumbers({
    accountMode: "LIVE",
    env: {},
  });

  assert.deepEqual(resolved, {
    trendMagicNumber: 270715,
    sidewayMagicNumber: 270714,
    configuredMagicNumbers: [270715, 270714],
  });
});

test("Daily Recovery keeps DEMO trend magic when Phase 7C account mode is DEMO and API env has no MT5_MAGIC_NUMBER", () => {
  const resolved = resolvePhase7CDailyRecoveryMagicNumbers({
    accountMode: "DEMO",
    env: {},
  });

  assert.deepEqual(resolved, {
    trendMagicNumber: 270713,
    sidewayMagicNumber: 270714,
    configuredMagicNumbers: [270713, 270714],
  });
});

test("Daily Recovery respects explicit MT5_MAGIC_NUMBER override", () => {
  const resolved = resolvePhase7CDailyRecoveryMagicNumbers({
    accountMode: "LIVE",
    env: {
      MT5_MAGIC_NUMBER: "990001",
      ZIQ_PHASE7C_SIDEWAY_MAGIC_NUMBER: "990002",
    },
  });

  assert.deepEqual(resolved, {
    trendMagicNumber: 990001,
    sidewayMagicNumber: 990002,
    configuredMagicNumbers: [990001, 990002],
  });
});
