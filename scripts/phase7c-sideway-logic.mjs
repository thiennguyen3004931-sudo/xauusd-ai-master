export function resolveSidewayPermission(activeMode, recommendedMode) {
  const active = String(activeMode ?? "PAUSE").trim().toUpperCase();
  const recommended = String(recommendedMode ?? "PAUSE").trim().toUpperCase();

  if (active === "SIDEWAY") {
    return { allowed: true, reason: "MANUAL_SIDEWAY_MODE", activeMode: active, recommendedMode: recommended };
  }
  if (active === "AUTO") {
    return {
      allowed: recommended === "SIDEWAY",
      reason: recommended === "SIDEWAY" ? "AUTO_REGIME_ALLOWS_SIDEWAY" : `AUTO_REGIME_RECOMMENDS_${recommended}`,
      activeMode: active,
      recommendedMode: recommended,
    };
  }
  if (active === "TREND") {
    return { allowed: false, reason: "TREND_MODE_BLOCKS_SIDEWAY_ENTRY", activeMode: active, recommendedMode: recommended };
  }
  if (active === "PAUSE") {
    return { allowed: false, reason: "PAUSE_MODE_BLOCKS_NEW_ENTRY", activeMode: active, recommendedMode: recommended };
  }
  return { allowed: false, reason: "INVALID_MODE_FAIL_CLOSED", activeMode: active, recommendedMode: recommended };
}

export function chooseRangeSide(range, bid, ask) {
  if (!range || !Number.isFinite(bid) || !Number.isFinite(ask)) return null;
  const lower = Number(range.demand?.high);
  const upper = Number(range.supply?.low);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper <= lower) return null;

  const mid = (bid + ask) / 2;
  const position = clamp((mid - lower) / (upper - lower), 0, 1);
  const buyNear = ask <= lower || position <= 0.30;
  const sellNear = bid >= upper || position >= 0.70;

  if (buyNear && sellNear) return position <= 0.5 ? "BUY" : "SELL";
  if (buyNear) return "BUY";
  if (sellNear) return "SELL";
  return null;
}

export function detectM5Confirmation(bars, side) {
  if (!Array.isArray(bars) || bars.length < 2) return null;
  const current = bars.at(-1);
  const previous = bars.at(-2);
  if (!validBar(current) || !validBar(previous)) return null;

  const currentBody = Math.abs(current.close - current.open);
  const currentRange = Math.max(1e-9, current.high - current.low);
  const lowerWick = Math.min(current.open, current.close) - current.low;
  const upperWick = current.high - Math.max(current.open, current.close);

  if (side === "BUY") {
    const engulfing = previous.close < previous.open && current.close > current.open &&
      current.open <= previous.close + 1e-9 && current.close >= previous.open - 1e-9;
    const rejection = current.close > current.open && lowerWick >= Math.max(currentBody * 1.2, currentRange * 0.25) &&
      current.close >= current.low + currentRange * 0.60;
    if (engulfing) return { pattern: "BULLISH_ENGULFING", closeTime: Number(current.closeTime), triggerPrice: current.close };
    if (rejection) return { pattern: "BULLISH_REJECTION", closeTime: Number(current.closeTime), triggerPrice: current.close };
    return null;
  }

  if (side === "SELL") {
    const engulfing = previous.close > previous.open && current.close < current.open &&
      current.open >= previous.close - 1e-9 && current.close <= previous.open + 1e-9;
    const rejection = current.close < current.open && upperWick >= Math.max(currentBody * 1.2, currentRange * 0.25) &&
      current.close <= current.low + currentRange * 0.40;
    if (engulfing) return { pattern: "BEARISH_ENGULFING", closeTime: Number(current.closeTime), triggerPrice: current.close };
    if (rejection) return { pattern: "BEARISH_REJECTION", closeTime: Number(current.closeTime), triggerPrice: current.close };
  }
  return null;
}

export function estimateVolumePoc(bars, lower, upper, binCount = 24) {
  if (!Array.isArray(bars) || !Number.isFinite(lower) || !Number.isFinite(upper) || upper <= lower) return null;
  const count = Math.max(8, Math.min(64, Math.trunc(binCount)));
  const bins = Array.from({ length: count }, () => 0);
  const width = (upper - lower) / count;

  for (const bar of bars) {
    if (!validBar(bar)) continue;
    const price = (Number(bar.high) + Number(bar.low) + Number(bar.close)) / 3;
    if (price < lower || price > upper) continue;
    const volume = Math.max(1, Number(bar.volume ?? bar.tickVolume ?? 1));
    const index = Math.min(count - 1, Math.max(0, Math.floor((price - lower) / width)));
    bins[index] += Number.isFinite(volume) ? volume : 1;
  }

  let bestIndex = -1;
  let bestVolume = 0;
  for (let index = 0; index < bins.length; index += 1) {
    if (bins[index] > bestVolume) {
      bestVolume = bins[index];
      bestIndex = index;
    }
  }
  if (bestIndex < 0 || bestVolume <= 0) return null;
  return lower + (bestIndex + 0.5) * width;
}

export function buildSidewayPlan({ side, bid, ask, range, atr, poc, point, stopsLevelTicks = 0, digits = 2 }) {
  if (!range || (side !== "BUY" && side !== "SELL")) return { accepted: false, reason: "INVALID_INPUT" };
  const demandLow = Number(range.demand?.low);
  const demandHigh = Number(range.demand?.high);
  const supplyLow = Number(range.supply?.low);
  const supplyHigh = Number(range.supply?.high);
  const values = [bid, ask, demandLow, demandHigh, supplyLow, supplyHigh, atr, point];
  if (!values.every(Number.isFinite) || supplyLow <= demandHigh || point <= 0 || atr <= 0) {
    return { accepted: false, reason: "INVALID_RANGE_OR_MARKET" };
  }

  const entry = side === "BUY" ? ask : bid;
  const brokerGap = Math.max(0, Number(stopsLevelTicks) || 0) * point;
  const buffer = Math.max(atr * 0.25, brokerGap, point * 20);
  const stopLoss = side === "BUY" ? demandLow - buffer : supplyHigh + buffer;
  const stopDistance = Math.abs(entry - stopLoss);
  if (!(stopDistance > 0) || stopDistance > 50) {
    return { accepted: false, reason: "STOP_DISTANCE_OUT_OF_RANGE", stopDistance };
  }

  const finalTarget = side === "BUY" ? supplyLow : demandHigh;
  const finalDistance = side === "BUY" ? finalTarget - entry : entry - finalTarget;
  if (!(finalDistance > 0)) return { accepted: false, reason: "FINAL_TARGET_NOT_FAVORABLE" };

  const corridorMid = (demandHigh + supplyLow) / 2;
  const pocNumber = Number(poc);
  const pocFavorable = Number.isFinite(pocNumber) && (side === "BUY" ? pocNumber > entry && pocNumber < finalTarget : pocNumber < entry && pocNumber > finalTarget);
  const tp1 = pocFavorable ? pocNumber : corridorMid;
  const tp1Distance = side === "BUY" ? tp1 - entry : entry - tp1;
  if (!(tp1Distance > 0)) return { accepted: false, reason: "TP1_NOT_FAVORABLE" };

  const rewardRisk = finalDistance / stopDistance;
  if (rewardRisk < 1.2) {
    return { accepted: false, reason: "FINAL_RR_BELOW_1_2", rewardRisk };
  }

  return {
    accepted: true,
    reason: "SIDEWAY_PLAN_ACCEPTED",
    side,
    entry: round(entry, digits),
    stopLoss: round(stopLoss, digits),
    stopDistance: round(stopDistance, Math.max(digits, 5)),
    tp1: round(tp1, digits),
    tp1Kind: pocFavorable ? "VOLUME_POC" : "MID_RANGE_FALLBACK",
    takeProfit: round(finalTarget, digits),
    rewardRisk: round(rewardRisk, 3),
    range: {
      demandLow: round(demandLow, digits),
      demandHigh: round(demandHigh, digits),
      supplyLow: round(supplyLow, digits),
      supplyHigh: round(supplyHigh, digits),
    },
  };
}

export function targetReached(side, marketPrice, target) {
  if (![marketPrice, target].every(Number.isFinite)) return false;
  return side === "BUY" ? marketPrice >= target : marketPrice <= target;
}

export function normalizeVolume(value, step, digits = 8) {
  if (!(value > 0) || !(step > 0)) return 0;
  const units = Math.floor((value + 1e-12) / step);
  return round(units * step, digits);
}

export function oneThirdPartialVolume(initialVolume, currentVolume, minVolume, step) {
  const desired = normalizeVolume(initialVolume / 3, step);
  if (desired < minVolume - 1e-9) return 0;
  const remaining = normalizeVolume(currentVolume - desired, step);
  if (remaining < minVolume - 1e-9) return 0;
  return desired;
}

function validBar(bar) {
  return bar && [bar.open, bar.high, bar.low, bar.close].every(Number.isFinite);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}
