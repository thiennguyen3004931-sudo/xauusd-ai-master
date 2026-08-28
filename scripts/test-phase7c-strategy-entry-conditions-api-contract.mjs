import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const {
  Phase7CStrategyEntryConditionsService,
  evaluatePhase7CStrategyEntrySaveGuard,
} = await import("../apps/api/dist/services/phase7c-strategy-entry-conditions.service.js");

function expectCode(fn, code) {
  let caught = null;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `Expected error code ${code}`);
  assert.equal(caught.code, code);
  return caught;
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "phase7c-strategy-entry-"));
try {
  const file = path.join(root, "phase7c-strategy-entry-conditions.json");
  const service = new Phase7CStrategyEntryConditionsService(file);

  const initial = service.read();
  assert.equal(initial.valid, true);
  assert.equal(initial.persisted, false);
  assert.equal(initial.error, null);
  assert.equal(initial.state.version, 0);
  assert.equal(initial.state.trend.patternM15, true);
  assert.equal(initial.state.sideway.rangeEdge, true);

  const saved = service.set({
    expectedVersion: 0,
    source: "web-control-center",
    trend: initial.state.trend,
    sideway: { ...initial.state.sideway, m5Confirmation: false },
  });
  assert.equal(saved.valid, true);
  assert.equal(saved.persisted, true);
  assert.equal(saved.state.version, 1);
  assert.equal(saved.state.sideway.m5Confirmation, false);
  assert.equal(saved.state.updatedBy, "web-control-center");
  assert.ok(Number.isFinite(Date.parse(saved.state.updatedAt)));
  assert.equal(fs.existsSync(file), true);

  const completeJson = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(completeJson.version, 1);
  assert.equal(completeJson.trend.patternM15, true);
  assert.equal(completeJson.sideway.rangeEdge, true);
  const tempArtifacts = fs.readdirSync(root).filter((name) => name.includes(".tmp"));
  assert.deepEqual(tempArtifacts, []);

  const beforeStale = fs.readFileSync(file, "utf8");
  expectCode(() => service.set({
    expectedVersion: 0,
    source: "web-control-center",
    trend: saved.state.trend,
    sideway: saved.state.sideway,
  }), "CONFIG_VERSION_CONFLICT");
  assert.equal(fs.readFileSync(file, "utf8"), beforeStale);

  const beforeSource = fs.readFileSync(file, "utf8");
  expectCode(() => service.set({
    expectedVersion: 1,
    source: "other-client",
    trend: saved.state.trend,
    sideway: saved.state.sideway,
  }), "ENTRY_STRATEGY_CONFIG_INVALID");
  assert.equal(fs.readFileSync(file, "utf8"), beforeSource);

  const beforeTrendAnchor = fs.readFileSync(file, "utf8");
  expectCode(() => service.set({
    expectedVersion: 1,
    source: "web-control-center",
    trend: { ...saved.state.trend, patternM15: false },
    sideway: saved.state.sideway,
  }), "ENTRY_STRATEGY_CONFIG_INVALID");
  assert.equal(fs.readFileSync(file, "utf8"), beforeTrendAnchor);

  const beforeSidewayAnchor = fs.readFileSync(file, "utf8");
  expectCode(() => service.set({
    expectedVersion: 1,
    source: "web-control-center",
    trend: saved.state.trend,
    sideway: { ...saved.state.sideway, rangeEdge: false },
  }), "ENTRY_STRATEGY_CONFIG_INVALID");
  assert.equal(fs.readFileSync(file, "utf8"), beforeSidewayAnchor);

  const beforeUnknown = fs.readFileSync(file, "utf8");
  expectCode(() => service.set({
    expectedVersion: 1,
    source: "web-control-center",
    trend: saved.state.trend,
    sideway: saved.state.sideway,
    threshold: 123,
  }), "ENTRY_STRATEGY_CONFIG_INVALID");
  assert.equal(fs.readFileSync(file, "utf8"), beforeUnknown);

  const malformedFile = path.join(root, "malformed.json");
  fs.writeFileSync(malformedFile, "{not-json\n", "utf8");
  const malformedService = new Phase7CStrategyEntryConditionsService(malformedFile);
  const malformed = malformedService.read();
  assert.equal(malformed.valid, false);
  assert.equal(malformed.persisted, true);
  assert.equal(malformed.state, null);
  assert.ok(malformed.error);
  const malformedBefore = fs.readFileSync(malformedFile, "utf8");
  expectCode(() => malformedService.set({
    expectedVersion: 0,
    source: "web-control-center",
    trend: initial.state.trend,
    sideway: initial.state.sideway,
  }), "ENTRY_STRATEGY_CONFIG_INVALID");
  assert.equal(fs.readFileSync(malformedFile, "utf8"), malformedBefore);

  const guardCases = [
    [
      { mode: "AUTO", accountStateValid: true, bridgeReachable: true, accountModeMatches: true, openXauusdPositions: 0 },
      "STRATEGY_PROFILE_EDIT_REQUIRES_PAUSE",
    ],
    [
      { mode: "PAUSE", accountStateValid: false, bridgeReachable: true, accountModeMatches: true, openXauusdPositions: 0 },
      "ACCOUNT_STATE_INVALID",
    ],
    [
      { mode: "PAUSE", accountStateValid: true, bridgeReachable: false, accountModeMatches: true, openXauusdPositions: 0 },
      "BRIDGE_TELEMETRY_UNAVAILABLE",
    ],
    [
      { mode: "PAUSE", accountStateValid: true, bridgeReachable: true, accountModeMatches: false, openXauusdPositions: 0 },
      "ACCOUNT_MODE_MISMATCH",
    ],
    [
      { mode: "PAUSE", accountStateValid: true, bridgeReachable: true, accountModeMatches: true, openXauusdPositions: null },
      "XAUUSD_POSITION_COUNT_UNKNOWN",
    ],
    [
      { mode: "PAUSE", accountStateValid: true, bridgeReachable: true, accountModeMatches: true, openXauusdPositions: 1 },
      "XAUUSD_POSITIONS_OPEN",
    ],
  ];

  for (const [input, expectedCode] of guardCases) {
    const result = evaluatePhase7CStrategyEntrySaveGuard(input);
    assert.equal(result.allowed, false);
    assert.equal(result.httpStatus, 409);
    assert.equal(result.code, expectedCode);
    assert.ok(result.message);
  }

  assert.deepEqual(
    evaluatePhase7CStrategyEntrySaveGuard({
      mode: "PAUSE",
      accountStateValid: true,
      bridgeReachable: true,
      accountModeMatches: true,
      openXauusdPositions: 0,
    }),
    { allowed: true },
  );

  console.log("PHASE7C_STRATEGY_ENTRY_API_PERSISTENCE_CONTRACT=PASS");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
