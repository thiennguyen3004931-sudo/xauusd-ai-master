const EPSILON = 1e-9;

function normalizeSide(side) {
  const normalized = String(side ?? "").trim().toUpperCase();
  return normalized === "BUY" || normalized === "SELL" ? normalized : null;
}

export function stopStrictlyTightens(side, currentStop, candidateStop) {
  const normalizedSide = normalizeSide(side);
  const current = Number(currentStop);
  const candidate = Number(candidateStop);
  if (!normalizedSide || !(candidate > 0)) return false;
  if (!(current > 0)) return true;
  return normalizedSide === "BUY"
    ? candidate > current + EPSILON
    : candidate < current - EPSILON;
}

export function stopIsAtLeastAsTight(side, currentStop, requiredStop) {
  const normalizedSide = normalizeSide(side);
  const current = Number(currentStop);
  const required = Number(requiredStop);
  if (!normalizedSide || !(current > 0) || !(required > 0)) return false;
  return normalizedSide === "BUY"
    ? current >= required - EPSILON
    : current <= required + EPSILON;
}
