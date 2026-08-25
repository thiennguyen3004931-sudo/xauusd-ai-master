function upper(value, fallback = "") {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized || fallback;
}

export function evaluateAutoTrendEntryModeGate({ activeMode, regime, demo }) {
  const normalizedActiveMode = upper(activeMode, "PAUSE");
  const observedActiveMode = upper(regime?.activeMode, normalizedActiveMode);
  const recommendedMode = upper(regime?.recommendedMode, "PAUSE");
  const regimeName = upper(regime?.regime, "UNCERTAIN");
  const canonicalEntryEligible = demo?.entryDiagnostics?.entry?.eligible === true;

  if (normalizedActiveMode !== "AUTO") {
    return {
      allowed: false,
      activeMode: normalizedActiveMode,
      recommendedMode,
      reason: "AUTO_GATE_CALLED_WITH_NON_AUTO_MODE",
      detail: `Expected AUTO, received ${normalizedActiveMode}.`,
    };
  }

  if (observedActiveMode !== normalizedActiveMode) {
    return {
      allowed: false,
      activeMode: observedActiveMode,
      recommendedMode,
      reason: "BOT_MODE_CHANGED_DURING_GATE",
      detail: `Mode changed from ${normalizedActiveMode} to ${observedActiveMode} while evaluating entry.`,
    };
  }

  if (recommendedMode === "TREND") {
    return {
      allowed: true,
      activeMode: normalizedActiveMode,
      recommendedMode,
      reason: "AUTO_REGIME_ALLOWS_TREND",
      detail: `Regime=${regimeName}.`,
    };
  }

  if (regimeName === "REVERSAL" && canonicalEntryEligible) {
    return {
      allowed: true,
      activeMode: normalizedActiveMode,
      recommendedMode,
      reason: "AUTO_REVERSAL_CANONICAL_TREND_ENTRY",
      detail: "Confirmed REVERSAL/CHOCH is allowed only because the canonical Trend entry is eligible.",
    };
  }

  return {
    allowed: false,
    activeMode: normalizedActiveMode,
    recommendedMode,
    reason: `AUTO_REGIME_RECOMMENDS_${recommendedMode}`,
    detail: regimeName === "REVERSAL"
      ? "REVERSAL remains fail-closed because the canonical Trend entry is not eligible."
      : `Regime=${regimeName}; no canonical REVERSAL exception applies.`,
  };
}
