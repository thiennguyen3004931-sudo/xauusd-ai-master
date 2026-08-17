import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateTimestampFreshness,
  inferBrokerClockOffset,
  normalizeBrokerTimestamp,
  validateAutoLotSnapshot,
} from "./phase7c-sideway-execution-guards.mjs";

test("timestamp freshness blocks stale and future snapshots", () => {
  const now = 1_700_000_000_000;
  assert.equal(evaluateTimestampFreshness(now - 5_000, { now, maxAgeMs: 10_000 }).fresh, true);
  assert.equal(evaluateTimestampFreshness(now - 20_000, { now, maxAgeMs: 10_000 }).reason, "TIMESTAMP_STALE");
  assert.equal(evaluateTimestampFreshness(now + 20_000, { now, maxAgeMs: 10_000 }).reason, "TIMESTAMP_TOO_FAR_IN_FUTURE");
});

test("DBG-style whole-hour broker clock offset normalizes quote and candle freshness", () => {
  const now = 1_700_000_000_000;
  const threeHours = 3 * 60 * 60_000;
  const brokerQuote = now + threeHours - 1_500;
  const offset = inferBrokerClockOffset(brokerQuote, { systemTimestamp: now });

  assert.equal(offset, threeHours);
  assert.equal(normalizeBrokerTimestamp(brokerQuote, offset), now - 1_500);

  const quoteFreshness = evaluateTimestampFreshness(brokerQuote, {
    now,
    maxAgeMs: 30_000,
    clockOffsetMs: offset,
  });
  assert.equal(quoteFreshness.fresh, true);
  assert.equal(quoteFreshness.clockOffsetMs, threeHours);
  assert.equal(quoteFreshness.ageMs, 1_500);
  assert.equal(quoteFreshness.rawAgeMs, -threeHours + 1_500);

  const latestM15Close = now + threeHours - 5 * 60_000;
  const candleFreshness = evaluateTimestampFreshness(latestM15Close, {
    now,
    maxAgeMs: 30 * 60_000,
    clockOffsetMs: offset,
  });
  assert.equal(candleFreshness.fresh, true);
  assert.equal(candleFreshness.clockOffsetMs, threeHours);
  assert.equal(candleFreshness.ageMs, 5 * 60_000);
});

test("broker clock inference fails closed on non-hour or excessive skew", () => {
  const now = 1_700_000_000_000;
  assert.equal(inferBrokerClockOffset(now + 37 * 60_000, { systemTimestamp: now }), null);
  assert.equal(inferBrokerClockOffset(now + 15 * 60 * 60_000, { systemTimestamp: now }), null);
});

function validPayload(now = 1_700_000_000_000) {
  return {
    generatedAt: now - 500,
    safety: {
      mode: "AUTO_LOT_SHADOW",
      executionMutation: false,
      phase7bFixedVolumeUnchanged: true,
    },
    account: {
      login: 123456,
      mode: "demo",
    },
    broker: {
      symbol: "XAUUSDm",
    },
    configuration: {
      riskPercent: 0.25,
      maxLot: 0.03,
    },
    preview: {
      stopDistance: 4.25,
      recommendedLot: 0.03,
      estimatedRiskUsd: 12.75,
      approved: true,
    },
  };
}

test("auto lot snapshot must match the same demo account, broker, risk and stop", () => {
  const now = 1_700_000_000_000;
  const expected = {
    accountLogin: 123456,
    brokerSymbol: "XAUUSDm",
    riskPercent: 0.25,
    maxLot: 0.03,
    stopDistance: 4.25,
    now,
    maxAgeMs: 10_000,
  };

  const accepted = validateAutoLotSnapshot(validPayload(now), expected);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.recommendedLot, 0.03);

  assert.equal(validateAutoLotSnapshot({ ...validPayload(now), account: { login: 999999, mode: "demo" } }, expected).reason, "AUTO_LOT_ACCOUNT_LOGIN_MISMATCH");
  assert.equal(validateAutoLotSnapshot({ ...validPayload(now), broker: { symbol: "XAUUSD.pro" } }, expected).reason, "AUTO_LOT_BROKER_SYMBOL_MISMATCH");
  assert.equal(validateAutoLotSnapshot({ ...validPayload(now), configuration: { riskPercent: 0.5, maxLot: 0.03 } }, expected).reason, "AUTO_LOT_RISK_PERCENT_MISMATCH");
  assert.equal(validateAutoLotSnapshot({ ...validPayload(now), preview: { ...validPayload(now).preview, stopDistance: 5 } }, expected).reason, "AUTO_LOT_STOP_DISTANCE_MISMATCH");
});

test("auto lot snapshot fails closed on stale or unsafe payloads", () => {
  const now = 1_700_000_000_000;
  const expected = {
    accountLogin: 123456,
    brokerSymbol: "XAUUSDm",
    riskPercent: 0.25,
    maxLot: 0.03,
    stopDistance: 4.25,
    now,
    maxAgeMs: 10_000,
  };

  const stale = validPayload(now);
  stale.generatedAt = now - 20_000;
  assert.equal(validateAutoLotSnapshot(stale, expected).reason, "AUTO_LOT_TIMESTAMP_STALE");

  const unsafe = validPayload(now);
  unsafe.safety.executionMutation = true;
  assert.equal(validateAutoLotSnapshot(unsafe, expected).reason, "AUTO_LOT_SAFETY_ASSERTION_FAILED");

  const unapproved = validPayload(now);
  unapproved.preview.approved = false;
  assert.equal(validateAutoLotSnapshot(unapproved, expected).reason, "AUTO_LOT_PREVIEW_NOT_APPROVED");
});
