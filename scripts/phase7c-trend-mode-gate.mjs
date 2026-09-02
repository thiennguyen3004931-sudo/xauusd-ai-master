function upper(value, fallback = "") {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized || fallback;
}

function finite(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function evaluateAutoTrendEntryModeGate({ activeMode, regime, demo }) {
  const normalizedActiveMode = upper(activeMode, "PAUSE");
  const observedActiveMode = upper(regime?.activeMode, normalizedActiveMode);
  const recommendedMode = upper(regime?.recommendedMode, "PAUSE");
  const regimeName = upper(regime?.regime, "UNCERTAIN");
  const regimeConfidence = finite(regime?.confidence);
  const canonicalEntryEligible = demo?.entryDiagnostics?.entry?.eligible === true;
  const regimeSnapshot = {
    regime: regimeName,
    regimeConfidence,
  };

  if (normalizedActiveMode !== "AUTO") {
    return {
      allowed: false,
      activeMode: normalizedActiveMode,
      recommendedMode,
      ...regimeSnapshot,
      reason: "AUTO_GATE_CALLED_WITH_NON_AUTO_MODE",
      detail: `Expected AUTO, received ${normalizedActiveMode}.`,
    };
  }

  if (observedActiveMode !== normalizedActiveMode) {
    return {
      allowed: false,
      activeMode: observedActiveMode,
      recommendedMode,
      ...regimeSnapshot,
      reason: "BOT_MODE_CHANGED_DURING_GATE",
      detail: `Mode changed from ${normalizedActiveMode} to ${observedActiveMode} while evaluating entry.`,
    };
  }

  if (recommendedMode === "TREND") {
    return {
      allowed: true,
      activeMode: normalizedActiveMode,
      recommendedMode,
      ...regimeSnapshot,
      reason: "AUTO_REGIME_ALLOWS_TREND",
      detail: `Regime=${regimeName}.`,
    };
  }

  if (regimeName === "REVERSAL" && canonicalEntryEligible) {
    return {
      allowed: true,
      activeMode: normalizedActiveMode,
      recommendedMode,
      ...regimeSnapshot,
      reason: "AUTO_REVERSAL_CANONICAL_TREND_ENTRY",
      detail: "Confirmed REVERSAL/CHOCH is allowed only because the canonical Trend entry is eligible.",
    };
  }

  return {
    allowed: false,
    activeMode: normalizedActiveMode,
    recommendedMode,
    ...regimeSnapshot,
    reason: `AUTO_REGIME_RECOMMENDS_${recommendedMode}`,
    detail: regimeName === "REVERSAL"
      ? "REVERSAL remains fail-closed because the canonical Trend entry is not eligible."
      : `Regime=${regimeName}; no canonical REVERSAL exception applies.`,
  };
}
