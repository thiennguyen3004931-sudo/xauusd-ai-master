import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { Phase7CLotSettingsService } from "../apps/api/dist/services/phase7c-lot-settings.service.js";

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
      sidewayMaxLot: 0.09,
    }, "test");
    assert.equal(saved.state.trendFixedLot, 0.06);
    assert.equal(saved.state.sidewayRiskPercent, 0.4);
    assert.equal(saved.state.sidewayMaxLot, 0.09);
    assert.equal(saved.restartRequired, true);

    writeFileSync(activePath, JSON.stringify({
      version: 1,
      trendFixedLot: 0.06,
      sidewayRiskPercent: 0.4,
      sidewayMaxLot: 0.09,
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

test("lot settings reject non-third-compatible lots and excessive DEMO risk", () => {
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
