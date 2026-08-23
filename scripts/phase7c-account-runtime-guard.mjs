const ACCOUNT_MODES = new Set(["DEMO", "LIVE"]);

export function truthyPhase7C(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

export function resolvePhase7CAccountRuntime(env = process.env) {
  const accountMode = String(env.ZIQ_PHASE7C_ACCOUNT_MODE || "DEMO").trim().toUpperCase();
  if (!ACCOUNT_MODES.has(accountMode)) {
    throw new Error(`Invalid ZIQ_PHASE7C_ACCOUNT_MODE=${accountMode || "missing"}. Expected DEMO or LIVE.`);
  }

  const liveExecutionEnabled = truthyPhase7C(env.ZIQ_PHASE7C_LIVE_EXECUTION_ENABLED);
  const allowRealAccount = truthyPhase7C(env.MT5_ALLOW_REAL_ACCOUNT);
  const tradingConfigured = truthyPhase7C(env.MT5_TRADING_ENABLED);
  const allowedLogins = new Set(
    String(env.MT5_ALLOWED_LOGINS || "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0),
  );

  if (accountMode === "DEMO") {
    if (liveExecutionEnabled) {
      throw new Error("DEMO runtime cannot set ZIQ_PHASE7C_LIVE_EXECUTION_ENABLED=true.");
    }
    if (allowRealAccount) {
      throw new Error("DEMO runtime requires MT5_ALLOW_REAL_ACCOUNT=false.");
    }
  } else {
    if (!liveExecutionEnabled) {
      throw new Error("LIVE runtime requires ZIQ_PHASE7C_LIVE_EXECUTION_ENABLED=true.");
    }
    if (!allowRealAccount) {
      throw new Error("LIVE runtime requires MT5_ALLOW_REAL_ACCOUNT=true.");
    }
  }

  return Object.freeze({
    accountMode,
    expectedBrokerMode: accountMode === "LIVE" ? "real" : "demo",
    liveExecutionEnabled,
    allowRealAccount,
    tradingConfigured,
    allowedLogins,
  });
}

export function evaluatePhase7CAccountHealth(health, runtime, { armed = true } = {}) {
  if (!health || typeof health !== "object") {
    return { allowed: false, reason: "HEALTH_UNAVAILABLE" };
  }
  if (!health.connected || health.status !== "ok") {
    return { allowed: false, reason: "BRIDGE_NOT_HEALTHY" };
  }
  if (String(health.accountMode ?? "").toLowerCase() !== runtime.expectedBrokerMode) {
    return {
      allowed: false,
      reason: "ACCOUNT_MODE_MISMATCH",
      detail: `configured=${runtime.accountMode};broker=${health.accountMode ?? "unknown"}`,
    };
  }

  const login = Number(health.accountLogin);
  if (!Number.isFinite(login) || login <= 0) {
    return { allowed: false, reason: "ACCOUNT_LOGIN_UNAVAILABLE" };
  }

  if (armed) {
    if (!runtime.tradingConfigured) {
      return { allowed: false, reason: "TRADING_NOT_CONFIGURED" };
    }
    if (!health.tradingEnabled) {
      return { allowed: false, reason: "BRIDGE_TRADING_DISABLED" };
    }
    if (!health.terminalTradeAllowed || !health.expertTradeAllowed) {
      return { allowed: false, reason: "MT5_AUTOMATED_TRADING_DISABLED" };
    }
    if (runtime.allowedLogins.size === 0) {
      return { allowed: false, reason: "ACCOUNT_ALLOWLIST_EMPTY" };
    }
    if (!runtime.allowedLogins.has(login)) {
      return { allowed: false, reason: "ACCOUNT_LOGIN_NOT_ALLOWLISTED" };
    }
  }

  return { allowed: true, reason: "PASS", login };
}

export function assertPhase7CAccountHealth(health, runtime, options = {}) {
  const result = evaluatePhase7CAccountHealth(health, runtime, options);
  if (!result.allowed) {
    throw new Error(
      `Phase7C ${runtime.accountMode} account guard blocked runtime: ${result.reason}${result.detail ? ` (${result.detail})` : ""}.`,
    );
  }
  return result;
}
