import {
  structuralStopWithBuffer,
  stopStrictlyTightens,
  tightestKnownStop,
} from "./phase7c-stop-monotonicity.mjs";

const EPSILON = 1e-9;

function normalizeSide(side) {
  const value = String(side ?? "").trim().toUpperCase();
  return value === "BUY" || value === "SELL" ? value : null;
}

function validBar(bar) {
  return Boolean(
    bar &&
    [bar.open, bar.high, bar.low, bar.close, bar.closeTime]
      .map(Number)
      .every(Number.isFinite),
  );
}

function confirmedSwingPoints(side, bars, afterTimestamp, atOrBefore) {
  if (!Array.isArray(bars) || bars.length < 3) return [];
  const after = Number(afterTimestamp);
  const before = Number(atOrBefore);
  if (!Number.isFinite(after) || !Number.isFinite(before) || before <= after) return [];

  const swings = [];
  for (let index = 1; index < bars.length - 1; index += 1) {
    const left = bars[index - 1];
    const middle = bars[index];
    const right = bars[index + 1];
    if (![left, middle, right].every(validBar)) continue;

    const middleTime = Number(middle.closeTime);
    const confirmationTime = Number(right.closeTime);
    if (
      middleTime <= after ||
      confirmationTime <= middleTime ||
      confirmationTime > before
    ) {
      continue;
    }

    if (
      side === "BUY" &&
      Number(middle.low) < Number(left.low) - EPSILON &&
      Number(middle.low) <= Number(right.low) + EPSILON
    ) {
      swings.push({
        price: Number(middle.low),
        swingCloseTime: middleTime,
        confirmationCloseTime: confirmationTime,
      });
    }

    if (
      side === "SELL" &&
      Number(middle.high) > Number(left.high) + EPSILON &&
      Number(middle.high) >= Number(right.high) - EPSILON
    ) {
      swings.push({
        price: Number(middle.high),
        swingCloseTime: middleTime,
        confirmationCloseTime: confirmationTime,
      });
    }
  }
  return swings;
}

export function findLatestConfirmedM5Structure({
  side,
  bars,
  afterTimestamp,
  atOrBefore,
}) {
  const normalizedSide = normalizeSide(side);
  if (!normalizedSide) return null;

  const swings = confirmedSwingPoints(
    normalizedSide,
    bars,
    afterTimestamp,
    atOrBefore,
  );
  if (swings.length < 2) return null;

  const previous = swings.at(-2);
  const latest = swings.at(-1);
  const isContinuationStructure = normalizedSide === "BUY"
    ? latest.price > previous.price + EPSILON
    : latest.price < previous.price - EPSILON;
  if (!isContinuationStructure) return null;

  return {
    side: normalizedSide,
    kind: normalizedSide === "BUY" ? "HIGHER_LOW" : "LOWER_HIGH",
    previousPrice: previous.price,
    price: latest.price,
    previousSwingCloseTime: previous.swingCloseTime,
    swingCloseTime: latest.swingCloseTime,
    confirmationCloseTime: latest.confirmationCloseTime,
  };
}

function roundPrice(value, digits) {
  const safeDigits = Math.max(0, Math.min(10, Math.trunc(Number(digits) || 0)));
  return Number(Number(value).toFixed(safeDigits));
}

export function planM5StructuralTrailingStop({
  active,
  side,
  bars,
  afterTimestamp,
  atOrBefore,
  currentStop,
  lastStructuralStop,
  bid,
  ask,
  point,
  stopsLevelTicks = 0,
  freezeLevelTicks = 0,
  digits = 2,
}) {
  if (!active) return { action: "HOLD", reason: "PARTIAL_REQUIRED" };

  const normalizedSide = normalizeSide(side);
  const safeBid = Number(bid);
  const safeAsk = Number(ask);
  const safePoint = Number(point);
  const safeStopsLevelTicks = Number(stopsLevelTicks);
  const safeFreezeLevelTicks = Number(freezeLevelTicks);
  if (
    !normalizedSide ||
    !(safeBid > 0) ||
    !(safeAsk > 0) ||
    safeAsk < safeBid ||
    !(safePoint > 0) ||
    !Number.isFinite(safeStopsLevelTicks) ||
    !Number.isFinite(safeFreezeLevelTicks) ||
    safeStopsLevelTicks < 0 ||
    safeFreezeLevelTicks < 0
  ) {
    return { action: "HOLD", reason: "INVALID_INPUT" };
  }

  const structure = findLatestConfirmedM5Structure({
    side: normalizedSide,
    bars,
    afterTimestamp,
    atOrBefore,
  });
  if (!structure) {
    return {
      action: "HOLD",
      reason: normalizedSide === "BUY"
        ? "NO_CONFIRMED_HIGHER_LOW"
        : "NO_CONFIRMED_LOWER_HIGH",
    };
  }

  const candidate = roundPrice(
    structuralStopWithBuffer(normalizedSide, structure.price),
    digits,
  );
  const baseline = tightestKnownStop(
    normalizedSide,
    Number(currentStop),
    Number(lastStructuralStop),
  );
  if (!stopStrictlyTightens(normalizedSide, baseline, candidate)) {
    return {
      action: "HOLD",
      reason: "NOT_TIGHTER",
      stopLoss: candidate,
      structure,
    };
  }

  const minimumGap = Math.max(
    safeStopsLevelTicks,
    safeFreezeLevelTicks,
  ) * safePoint;
  const validAgainstMarket = normalizedSide === "BUY"
    ? candidate < safeBid - minimumGap
    : candidate > safeAsk + minimumGap;
  if (!validAgainstMarket) {
    return {
      action: "HOLD",
      reason: "BROKER_GAP_BLOCK",
      stopLoss: candidate,
      minimumGap,
      structure,
    };
  }

  return {
    action: "TIGHTEN",
    reason: structure.kind,
    stopLoss: candidate,
    minimumGap,
    structure,
  };
}
