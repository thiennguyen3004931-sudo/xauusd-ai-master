import { acquireExecutionLock } from "./phase7c-execution-lock.mjs";
import { resolveSidewayPermission } from "./phase7c-sideway-logic.mjs";
import {
  evaluatePhase7CAccountHealth,
  resolvePhase7CAccountRuntime,
} from "./phase7c-account-runtime-guard.mjs";

const nativeFetch = globalThis.fetch.bind(globalThis);
const accountRuntime = resolvePhase7CAccountRuntime();
const controlApiBase = (process.env.ZIQ_PHASE7C_CONTROL_API_URL?.trim() || "http://127.0.0.1:3711").replace(/\/$/, "");
const symbol = (process.env.ZIQ_PHASE7C_SIDEWAY_SYMBOL || process.env.ZIQ_DEMO_SYMBOL || "XAUUSD").trim().toUpperCase();
const regimeCandleCount = clampInt(process.env.ZIQ_PHASE7C_REGIME_CANDLE_COUNT, 320, 220, 1000);
const minRegimeConfidence = clampNumber(process.env.ZIQ_PHASE7C_SIDEWAY_MIN_REGIME_CONFIDENCE, 60, 0, 100);

console.log("PHASE7C_SIDEWAY_EXECUTION_LOCK=ENABLED");
console.log(`PHASE7C_SIDEWAY_LOCK_ACCOUNT_MODE=${accountRuntime.accountMode}`);

globalThis.fetch = async function phase7CSidewayLockedFetch(input, init = undefined) {
  const request = toRequestInfo(input, init);
  if (!isNewOrderRequest(request)) return nativeFetch(input, init);

  const lock = acquireExecutionLock({ owner: "SIDEWAY" });
  if (!lock.acquired) {
    console.warn(`PHASE7C_SIDEWAY_ENTRY_BLOCKED=EXECUTION_LOCK_BUSY|DETAIL=${lock.reason}`);
    return blockedResponse("EXECUTION_LOCK_BUSY", lock.reason);
  }

  try {
    const [modePayload, regime, health] = await Promise.all([
      controlRequest("/api/v1/phase7c/bot-mode"),
      controlRequest(`/api/v1/phase7c/live-regime?symbol=${encodeURIComponent(symbol)}&count=${regimeCandleCount}`),
      fetchHealthUnderLock(request),
    ]);

    const accountGuard = evaluatePhase7CAccountHealth(health, accountRuntime, { armed: true });
    if (!accountGuard.allowed) {
      const detail = `${accountGuard.reason}${accountGuard.detail ? `;${accountGuard.detail}` : ""}`;
      console.warn(`PHASE7C_SIDEWAY_ENTRY_BLOCKED=ACCOUNT_GUARD|DETAIL=${detail}`);
      return blockedResponse("ACCOUNT_GUARD", detail);
    }

    const permission = resolveSidewayPermission(modePayload?.state?.mode, regime?.recommendedMode);
    if (
      !permission.allowed ||
      regime?.regime !== "RANGING" ||
      regime?.recommendedMode !== "SIDEWAY" ||
      Number(regime?.confidence ?? 0) < minRegimeConfidence
    ) {
      const reason = !permission.allowed
        ? permission.reason
        : regime?.regime !== "RANGING"
          ? `REGIME_${regime?.regime ?? "UNKNOWN"}_BLOCKS_SIDEWAY`
          : regime?.recommendedMode !== "SIDEWAY"
            ? `RECOMMENDED_${regime?.recommendedMode ?? "UNKNOWN"}_BLOCKS_SIDEWAY`
            : "REGIME_CONFIDENCE_BELOW_MINIMUM";
      console.warn(`PHASE7C_SIDEWAY_ENTRY_BLOCKED=${reason}`);
      return blockedResponse(reason, `confidence=${regime?.confidence ?? "N/A"};minimum=${minRegimeConfidence}`);
    }

    const positions = await fetchOpenPositionsUnderLock(request);
    if (positions.length > 0) {
      console.warn(`PHASE7C_SIDEWAY_ENTRY_BLOCKED=POSITION_PRESENT_UNDER_LOCK|COUNT=${positions.length}`);
      return blockedResponse("POSITION_PRESENT_UNDER_LOCK", `Open ${symbol} positions=${positions.length}`);
    }

    return await nativeFetch(input, init);
  } catch (error) {
    const message = errorMessage(error);
    console.error(`PHASE7C_SIDEWAY_ENTRY_BLOCKED=FINAL_LOCK_RECHECK_ERROR|DETAIL=${message}`);
    return blockedResponse("FINAL_LOCK_RECHECK_ERROR_FAIL_CLOSED", message);
  } finally {
    lock.release();
  }
};

await import("./run-phase7c-sideway-account-mode.mjs");

async function fetchHealthUnderLock(request) {
  const requestUrl = new URL(request.url);
  const response = await nativeFetch(`${requestUrl.origin}/health`, {
    method: "GET",
    headers: request.headers,
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`MT5 bridge health recheck ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function fetchOpenPositionsUnderLock(request) {
  const requestUrl = new URL(request.url);
  const response = await nativeFetch(
    `${requestUrl.origin}/v1/positions?symbol=${encodeURIComponent(symbol)}`,
    { method: "GET", headers: request.headers },
  );
  const text = await response.text();
  if (!response.ok) throw new Error(`MT5 bridge position recheck ${response.status}: ${text}`);
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
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Phase7C control API ${response.status}: ${text}`);
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timeout);
  }
}

function isNewOrderRequest(request) {
  if (request.method !== "POST") return false;
  try {
    return new URL(request.url).pathname === "/v1/orders";
  } catch {
    return false;
  }
}

function toRequestInfo(input, init) {
  const isRequest = input instanceof Request;
  const requestMethod = isRequest ? input.method : undefined;
  const rawUrl = isRequest ? input.url : input instanceof URL ? input.href : String(input);
  return {
    method: String(init?.method ?? requestMethod ?? "GET").toUpperCase(),
    url: rawUrl,
    headers: new Headers(init?.headers ?? (isRequest ? input.headers : undefined)),
  };
}

function blockedResponse(reason, detail) {
  return new Response(
    JSON.stringify({
      error: "PHASE7C_SIDEWAY_ENTRY_BLOCKED",
      accepted: false,
      status: "blocked_by_phase7c_execution_gate",
      message: reason,
      detail,
    }),
    { status: 423, headers: { "content-type": "application/json; charset=utf-8" } },
  );
}

function clampNumber(raw, fallback, min, max) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function clampInt(raw, fallback, min, max) {
  return Math.trunc(clampNumber(raw, fallback, min, max));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
