import { acquireExecutionLock } from "./phase7c-execution-lock.mjs";

const nativeFetch = globalThis.fetch.bind(globalThis);
const controlApiBase = (process.env.ZIQ_PHASE7C_CONTROL_API_URL?.trim() || "http://127.0.0.1:3711").replace(/\/$/, "");
const regimeSymbol = process.env.ZIQ_PHASE7C_REGIME_SYMBOL?.trim().toUpperCase() || process.env.ZIQ_DEMO_SYMBOL?.trim().toUpperCase() || "XAUUSD";
const regimeCandleCount = clampInt(process.env.ZIQ_PHASE7C_REGIME_CANDLE_COUNT, 320, 220, 1000);

console.log("PHASE7C_TREND_ENTRY_GATE=ENABLED");
console.log(`PHASE7C_CONTROL_API=${controlApiBase}`);
console.log(`PHASE7C_REGIME_SYMBOL=${regimeSymbol}`);
console.log("PHASE7C_GATE_SCOPE=POST_/v1/orders_ONLY");
console.log("PHASE7C_POSITION_MANAGEMENT=PASS_THROUGH");
console.log("PHASE7C_EXECUTION_LOCK=ENABLED");

globalThis.fetch = async function phase7CTrendGate(input, init = undefined) {
  const request = toRequestInfo(input, init);
  if (!isNewOrderRequest(request)) {
    return nativeFetch(input, init);
  }

  const lock = acquireExecutionLock({ owner: "TREND" });
  if (!lock.acquired) {
    console.warn(`PHASE7C_TREND_ENTRY_BLOCKED=EXECUTION_LOCK_BUSY|DETAIL=${lock.reason}`);
    return blockedResponse({
      allowed: false,
      activeMode: "UNKNOWN",
      recommendedMode: null,
      reason: "EXECUTION_LOCK_BUSY",
      detail: lock.reason,
    });
  }

  try {
    const decision = await evaluateTrendEntryPermission();
    if (!decision.allowed) {
      console.warn(
        `PHASE7C_TREND_ENTRY_BLOCKED=${decision.reason}|ACTIVE_${decision.activeMode}|RECOMMENDED_${decision.recommendedMode ?? "N/A"}`,
      );
      return blockedResponse(decision);
    }

    // The Phase 7B controller checked positions before it reached this fetch,
    // but Sideway runs concurrently. Re-check under the shared lock so a
    // regime transition cannot produce one Trend and one Sideway order.
    const positions = await fetchOpenPositionsUnderLock(request);
    if (positions.length > 0) {
      console.warn(`PHASE7C_TREND_ENTRY_BLOCKED=POSITION_PRESENT_UNDER_LOCK|COUNT=${positions.length}`);
      return blockedResponse({
        allowed: false,
        activeMode: decision.activeMode,
        recommendedMode: decision.recommendedMode,
        reason: "POSITION_PRESENT_UNDER_LOCK",
        detail: `Open ${regimeSymbol} positions=${positions.length}`,
      });
    }

    console.log(
      `PHASE7C_TREND_ENTRY_ALLOWED=MODE_${decision.activeMode}|RECOMMENDED_${decision.recommendedMode ?? "N/A"}`,
    );
    return await nativeFetch(input, init);
  } catch (error) {
    const message = errorMessage(error);
    console.error(`PHASE7C_TREND_ENTRY_BLOCKED=CONTROL_OR_LOCK_RECHECK_ERROR|DETAIL=${message}`);
    return blockedResponse({
      allowed: false,
      activeMode: "UNKNOWN",
      recommendedMode: null,
      reason: "CONTROL_OR_LOCK_RECHECK_ERROR_FAIL_CLOSED",
      detail: message,
    });
  } finally {
    lock.release();
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

async function fetchOpenPositionsUnderLock(request) {
  const requestUrl = new URL(request.url);
  const query = new URLSearchParams({ symbol: regimeSymbol });
  const response = await nativeFetch(`${requestUrl.origin}/v1/positions?${query.toString()}`, {
    method: "GET",
    headers: request.headers,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`MT5 bridge position recheck ${response.status}: ${text}`);
  }
  const parsed = text ? JSON.parse(text) : [];
  if (!Array.isArray(parsed)) throw new Error("MT5 bridge position recheck did not return an array.");
  return parsed;
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
  const isRequest = input instanceof Request;
  const requestMethod = isRequest ? input.method : undefined;
  const rawUrl = isRequest
    ? input.url
    : input instanceof URL
      ? input.href
      : String(input);
  return {
    method: String(init?.method ?? requestMethod ?? "GET").toUpperCase(),
    url: rawUrl,
    headers: new Headers(init?.headers ?? (isRequest ? input.headers : undefined)),
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
