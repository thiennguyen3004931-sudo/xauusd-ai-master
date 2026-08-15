const nativeFetch = globalThis.fetch.bind(globalThis);
const controlApiBase = (process.env.ZIQ_PHASE7C_CONTROL_API_URL?.trim() || "http://127.0.0.1:3711").replace(/\/$/, "");
const regimeSymbol = process.env.ZIQ_PHASE7C_REGIME_SYMBOL?.trim().toUpperCase() || process.env.ZIQ_DEMO_SYMBOL?.trim().toUpperCase() || "XAUUSD";
const regimeCandleCount = clampInt(process.env.ZIQ_PHASE7C_REGIME_CANDLE_COUNT, 320, 220, 1000);

console.log("PHASE7C_TREND_ENTRY_GATE=ENABLED");
console.log(`PHASE7C_CONTROL_API=${controlApiBase}`);
console.log(`PHASE7C_REGIME_SYMBOL=${regimeSymbol}`);
console.log("PHASE7C_GATE_SCOPE=POST_/v1/orders_ONLY");
console.log("PHASE7C_POSITION_MANAGEMENT=PASS_THROUGH");

globalThis.fetch = async function phase7CTrendGate(input, init = undefined) {
  const request = toRequestInfo(input, init);
  if (!isNewOrderRequest(request)) {
    return nativeFetch(input, init);
  }

  try {
    const decision = await evaluateTrendEntryPermission();
    if (decision.allowed) {
      console.log(
        `PHASE7C_TREND_ENTRY_ALLOWED=MODE_${decision.activeMode}|RECOMMENDED_${decision.recommendedMode ?? "N/A"}`,
      );
      return nativeFetch(input, init);
    }

    console.warn(
      `PHASE7C_TREND_ENTRY_BLOCKED=${decision.reason}|ACTIVE_${decision.activeMode}|RECOMMENDED_${decision.recommendedMode ?? "N/A"}`,
    );
    return blockedResponse(decision);
  } catch (error) {
    const message = errorMessage(error);
    console.error(`PHASE7C_TREND_ENTRY_BLOCKED=CONTROL_API_ERROR|DETAIL=${message}`);
    return blockedResponse({
      allowed: false,
      activeMode: "UNKNOWN",
      recommendedMode: null,
      reason: "CONTROL_API_ERROR_FAIL_CLOSED",
      detail: message,
    });
  }
};

await import("./run-phase7b-demo-controller.ts");

async function evaluateTrendEntryPermission() {
  const modePayload = await controlRequest("/api/v1/phase7c/bot-mode");
  const activeMode = String(modePayload?.state?.mode ?? "PAUSE").toUpperCase();

  if (activeMode === "TREND") {
    return {
      allowed: true,
      activeMode,
      recommendedMode: null,
      reason: "MANUAL_TREND_MODE",
    };
  }

  if (activeMode === "SIDEWAY") {
    return {
      allowed: false,
      activeMode,
      recommendedMode: "SIDEWAY",
      reason: "SIDEWAY_MODE_BLOCKS_TREND_ENTRY",
    };
  }

  if (activeMode === "PAUSE") {
    return {
      allowed: false,
      activeMode,
      recommendedMode: "PAUSE",
      reason: "PAUSE_MODE_BLOCKS_NEW_ENTRY",
    };
  }

  if (activeMode !== "AUTO") {
    return {
      allowed: false,
      activeMode,
      recommendedMode: null,
      reason: "INVALID_MODE_FAIL_CLOSED",
    };
  }

  const query = new URLSearchParams({
    symbol: regimeSymbol,
    count: String(regimeCandleCount),
  });
  const regime = await controlRequest(`/api/v1/phase7c/live-regime?${query.toString()}`);
  const recommendedMode = String(regime?.recommendedMode ?? "PAUSE").toUpperCase();

  return {
    allowed: recommendedMode === "TREND",
    activeMode,
    recommendedMode,
    reason: recommendedMode === "TREND"
      ? "AUTO_REGIME_ALLOWS_TREND"
      : `AUTO_REGIME_RECOMMENDS_${recommendedMode}`,
  };
}

async function controlRequest(pathname) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await nativeFetch(`${controlApiBase}${pathname}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Phase7C control API ${response.status}: ${text}`);
    }
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timeout);
  }
}

function isNewOrderRequest(request) {
  if (request.method !== "POST") return false;
  try {
    const url = new URL(request.url);
    return url.pathname === "/v1/orders";
  } catch {
    return false;
  }
}

function toRequestInfo(input, init) {
  const requestMethod = input instanceof Request ? input.method : undefined;
  const rawUrl = input instanceof Request
    ? input.url
    : input instanceof URL
      ? input.href
      : String(input);
  return {
    method: String(init?.method ?? requestMethod ?? "GET").toUpperCase(),
    url: rawUrl,
  };
}

function blockedResponse(decision) {
  return new Response(
    JSON.stringify({
      error: "PHASE7C_TREND_ENTRY_BLOCKED",
      accepted: false,
      status: "blocked_by_phase7c_mode_gate",
      message: decision.reason,
      activeMode: decision.activeMode,
      recommendedMode: decision.recommendedMode,
      detail: decision.detail,
    }),
    {
      status: 423,
      headers: { "content-type": "application/json; charset=utf-8" },
    },
  );
}

function clampInt(raw, fallback, min, max) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
