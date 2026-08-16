import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSidewayPlan,
  chooseRangeSide,
  detectM5Confirmation,
  estimateVolumePoc,
  matchPendingEntryPosition,
  oneThirdPartialVolume,
  reconcileManagedBrokerState,
  resolveSidewayPermission,
  targetReached,
} from "./phase7c-sideway-logic.mjs";

const range = {
  demand: { low: 2390, high: 2392 },
  supply: { low: 2408, high: 2410 },
};

test("manual SIDEWAY and AUTO+SIDEWAY are the only entry permissions", () => {
  assert.equal(resolveSidewayPermission("SIDEWAY", "TREND").allowed, true);
  assert.equal(resolveSidewayPermission("AUTO", "SIDEWAY").allowed, true);
  assert.equal(resolveSidewayPermission("AUTO", "TREND").allowed, false);
  assert.equal(resolveSidewayPermission("TREND", "SIDEWAY").allowed, false);
  assert.equal(resolveSidewayPermission("PAUSE", "SIDEWAY").allowed, false);
  assert.equal(resolveSidewayPermission("garbage", "SIDEWAY").allowed, false);
});

test("range side only fires near demand or supply, not in the middle or after breakout", () => {
  assert.equal(chooseRangeSide(range, 2392.2, 2392.4), "BUY");
  assert.equal(chooseRangeSide(range, 2399.9, 2400.1), null);
  assert.equal(chooseRangeSide(range, 2407.8, 2408.0), "SELL");
  assert.equal(chooseRangeSide(range, 2388.8, 2389.0), null);
  assert.equal(chooseRangeSide(range, 2411.0, 2411.2), null);
});

test("M5 confirmation detects bullish rejection and bearish engulfing", () => {
  const bullish = [
    { open: 2392.0, high: 2393.0, low: 2391.8, close: 2392.6, closeTime: 1 },
    { open: 2392.4, high: 2393.2, low: 2390.6, close: 2393.0, closeTime: 2 },
  ];
  assert.equal(detectM5Confirmation(bullish, "BUY")?.pattern, "BULLISH_REJECTION");

  const bearish = [
    { open: 2406.5, high: 2408.2, low: 2406.2, close: 2407.8, closeTime: 3 },
    { open: 2408.0, high: 2408.3, low: 2406.0, close: 2406.2, closeTime: 4 },
  ];
  assert.equal(detectM5Confirmation(bearish, "SELL")?.pattern, "BEARISH_ENGULFING");
});

test("volume POC stays inside the range", () => {
  const bars = Array.from({ length: 20 }, (_, index) => ({
    open: 2397 + index * 0.01,
    high: 2398.2,
    low: 2397.8,
    close: 2398,
    volume: index < 15 ? 100 : 10,
  }));
  const poc = estimateVolumePoc(bars, 2392, 2408, 16);
  assert.ok(poc !== null && poc >= 2392 && poc <= 2408);
});

test("BUY sideway plan uses zone+ATR stop, POC TP1 and opposite range TP2", () => {
  const plan = buildSidewayPlan({
    side: "BUY",
    bid: 2392.2,
    ask: 2392.3,
    range,
    atr: 4,
    poc: 2399,
    point: 0.01,
    stopsLevelTicks: 0,
    digits: 2,
  });
  assert.equal(plan.accepted, true);
  assert.equal(plan.tp1Kind, "VOLUME_POC");
  assert.equal(plan.tp1, 2399);
  assert.equal(plan.takeProfit, 2408);
  assert.ok(plan.stopLoss < 2390);
  assert.ok(plan.rewardRisk >= 1.2);
});

test("one-third partial preserves a broker-minimum runner", () => {
  assert.equal(oneThirdPartialVolume(0.03, 0.03, 0.01, 0.01), 0.01);
  assert.equal(oneThirdPartialVolume(0.02, 0.02, 0.01, 0.01), 0);
});

test("target checks are directional", () => {
  assert.equal(targetReached("BUY", 2400, 2399), true);
  assert.equal(targetReached("BUY", 2398, 2399), false);
  assert.equal(targetReached("SELL", 2398, 2399), true);
  assert.equal(targetReached("SELL", 2400, 2399), false);
});

test("pending entry recovery only adopts the exact broker-protected position", () => {
  const now = 1_700_000_100_000;
  const pending = {
    side: "BUY",
    volume: 0.03,
    stopLoss: 2389,
    tp2: 2408,
    createdAt: now - 5_000,
  };
  const position = {
    ticket: "2001",
    side: "LONG",
    volume: 0.03,
    stopLoss: 2389,
    takeProfit: 2408,
    openedAt: now - 4_000,
  };
  const spec = { volumeStep: 0.01, point: 0.01 };

  assert.equal(matchPendingEntryPosition(pending, [position], spec, now).matched, true);
  assert.equal(matchPendingEntryPosition(pending, [{ ...position, stopLoss: 2388.5 }], spec, now).matched, false);
  assert.equal(matchPendingEntryPosition(pending, [{ ...position, side: "SHORT" }], spec, now).matched, false);
  assert.equal(matchPendingEntryPosition(pending, [position, { ...position, ticket: "2002" }], spec, now).matched, false);
});

test("managed state recovers a completed one-third partial after a crash", () => {
  const managed = {
    side: "BUY",
    entry: 2392.3,
    initialVolume: 0.03,
    expectedRemainingVolume: 0.03,
    partialApplied: false,
    breakEvenApplied: false,
  };
  const position = {
    side: "LONG",
    volume: 0.02,
    stopLoss: 2389,
  };
  const result = reconcileManagedBrokerState(managed, position, {
    minVolume: 0.01,
    volumeStep: 0.01,
    point: 0.01,
  });

  assert.equal(result.accepted, true);
  assert.equal(result.managed.partialApplied, true);
  assert.equal(result.managed.expectedRemainingVolume, 0.02);
  assert.equal(result.events[0]?.type, "TP1_PARTIAL_RECOVERED_FROM_BROKER_VOLUME");
});

test("managed state recovers break-even from broker stop and rejects unknown volume mutation", () => {
  const managed = {
    side: "SELL",
    entry: 2407.7,
    initialVolume: 0.03,
    expectedRemainingVolume: 0.02,
    partialApplied: true,
    breakEvenApplied: false,
  };
  const spec = { minVolume: 0.01, volumeStep: 0.01, point: 0.01 };
  const recovered = reconcileManagedBrokerState(managed, {
    side: "SHORT",
    volume: 0.02,
    stopLoss: 2407.7,
  }, spec);
  assert.equal(recovered.accepted, true);
  assert.equal(recovered.managed.breakEvenApplied, true);
  assert.equal(recovered.events[0]?.type, "BREAK_EVEN_RECOVERED_FROM_BROKER_STOP");

  const blocked = reconcileManagedBrokerState(managed, {
    side: "SHORT",
    volume: 0.01,
    stopLoss: 2407.7,
  }, spec);
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.reason, "MANAGED_VOLUME_MISMATCH");
});
