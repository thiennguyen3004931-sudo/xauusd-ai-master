import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { acquireExecutionLock } from "./phase7c-execution-lock.mjs";
import { evaluateAutoTrendEntryModeGate } from "./phase7c-trend-mode-gate.mjs";

const nativeFetch = globalThis.fetch.bind(globalThis);
const controlApiBase = (process.env.ZIQ_PHASE7C_CONTROL_API_URL?.trim() || "http://127.0.0.1:3711").replace(/\/$/, "");
const regimeSymbol = process.env.ZIQ_PHASE7C_REGIME_SYMBOL?.trim().toUpperCase() || process.env.ZIQ_DEMO_SYMBOL?.trim().toUpperCase() || "XAUUSD";
const regimeCandleCount = clampInt(process.env.ZIQ_PHASE7C_REGIME_CANDLE_COUNT, 320, 220, 1000);
const trendRuntimeArmed = /^(1|true|yes|on)$/i.test(
  process.env.ZIQ_DEMO_ARMED ?? "false",
);
const trendRuntimeIntervalSeconds = clampInt(
  process.env.ZIQ_DEMO_INTERVAL_SECONDS,
  5,
  1,
  60,
);
const trendRuntimeStartedAt = Date.now();

startTrendRuntimeHeartbeat();

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
      `PHASE7C_TREND_ENTRY_ALLOWED=MODE_${decision.activeMode}|RECOMMENDED_${decision.recommendedMode ?? "N/A"}|REASON_${decision.reason}`,
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

await importLegacyTrendController();

async function importLegacyTrendController() {
  // `tsx` resolves .ts files according to the repository's CommonJS package
  // context. The legacy controller intentionally uses top-level await, which
  // cannot be transformed to CJS. Transpile only its TypeScript syntax to ESM
  // in memory, then import it in this same process so the Phase 7C fetch gate
  // and execution lock remain active around every new-order request.
  const sourceUrl = new URL("./run-phase7b-demo-controller.ts", import.meta.url);
  const source = fs.readFileSync(sourceUrl, "utf8");
  const transformed = ts.transpileModule(source, {
    fileName: "run-phase7b-demo-controller.ts",
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      verbatimModuleSyntax: false,
    },
  });

  const errors = (transformed.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length > 0) {
    const detail = errors
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "))
      .join(" | ");
    throw new Error(`Legacy Trend TypeScript transpile failed: ${detail}`);
  }

  const sourceLabel = sourceUrl.href.replace(/\s/g, "%20");

  // Execute the transpiled legacy Trend controller from a real file URL.
  // A data: URL has no hierarchical filesystem base, so Node cannot
  // resolve workspace packages such as @xauusd/risk-engine from it.
  const runtimeUrl = new URL(
    `./.phase7c-trend-legacy-runtime-${process.pid}.mjs`,
    import.meta.url,
  );

  const riskEngineUrl = new URL(
    "../packages/risk-engine/dist/index.js",
    import.meta.url,
  ).href;

  // The temporary legacy runtime lives under scripts/, while the root
  // workspace does not expose @xauusd/risk-engine in root node_modules.
  // Rewrite only this known runtime dependency to the already-built ESM file.
  const previewCompleteSentinel = "__PHASE7C_TREND_PREVIEW_COMPLETE__";

  const runtimeOutput = transformed.outputText
    .replaceAll(
      '"@xauusd/risk-engine"',
      JSON.stringify(riskEngineUrl),
    )
    .replaceAll(
      "'@xauusd/risk-engine'",
      JSON.stringify(riskEngineUrl),
    )
    // The legacy preview path uses process.exit(0). Because this controller
    // is imported into the Phase 7C/tsx host, forcing process termination can
    // abort while loader handles are closing. Convert only the successful
    // preview exit into a sentinel unwind handled below.
    .replaceAll(
      "process.exit(0);",
      `throw new Error("${previewCompleteSentinel}");`,
    );

  const runtimeSource =
    `${runtimeOutput}\n//# sourceURL=${sourceLabel}\n`;

  fs.writeFileSync(runtimeUrl, runtimeSource, "utf8");

  console.log("PHASE7C_TREND_LEGACY_TRANSPILE=ESM");
  console.log(`PHASE7C_TREND_LEGACY_RUNTIME=${runtimeUrl.href}`);

  try {
    await import(`${runtimeUrl.href}?pid=${process.pid}`);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === previewCompleteSentinel
    ) {
      console.log("PHASE7C_TREND_PREVIEW_COMPLETE=PASS");
      return;
    }

    throw error;
  } finally {
    try {
      fs.unlinkSync(runtimeUrl);
    } catch {
      // Best-effort cleanup only.
    }
  }
}

function trendRuntimeFilePath() {
  const workDir =
    process.env.ZIQ_DEMO_WORK_DIR?.trim() ?? "";

  return workDir
    ? path.join(workDir, "phase7b-demo-runtime.json")
    : null;
}

function writeTrendRuntimeState(
  status,
  armed,
  requireOwnership = false,
) {
  const runtimePath = trendRuntimeFilePath();
  if (!runtimePath) return;

  if (
    requireOwnership &&
    fs.existsSync(runtimePath)
  ) {
    try {
      const current = JSON.parse(
        fs.readFileSync(runtimePath, "utf8")
          .replace(/^\uFEFF/, ""),
      );

      if (Number(current?.pid) !== process.pid) {
        return;
      }
    } catch {
      return;
    }
  }

  const payload = {
    version: 1,
    status,
    armed,
    pid: process.pid,
    heartbeatAt: Date.now(),
    startedAt: trendRuntimeStartedAt,
    intervalSeconds: trendRuntimeIntervalSeconds,
  };

  fs.mkdirSync(
    path.dirname(runtimePath),
    { recursive: true },
  );

  const tempPath =
    runtimePath +
    "." +
    process.pid +
    ".tmp";

  fs.writeFileSync(
    tempPath,
    JSON.stringify(payload, null, 2),
    "utf8",
  );

  fs.renameSync(
    tempPath,
    runtimePath,
  );
}

function startTrendRuntimeHeartbeat() {
  if (!trendRuntimeArmed) {
    console.log(
      "PHASE7C_TREND_RUNTIME_HEARTBEAT=OFF_NOT_ARMED",
    );
    return;
  }

  const runtimePath = trendRuntimeFilePath();

  if (!runtimePath) {
    throw new Error(
      "Phase 7C Trend runtime heartbeat requires ZIQ_DEMO_WORK_DIR.",
    );
  }

  writeTrendRuntimeState(
    "RUNNING",
    true,
  );

  const heartbeatMs =
    Math.max(
      1000,
      Math.min(
        trendRuntimeIntervalSeconds,
        5,
      ) * 1000,
    );

  const heartbeatTimer = setInterval(
    () => {
      try {
        writeTrendRuntimeState(
          "RUNNING",
          true,
        );
      } catch (error) {
        console.error(
          "PHASE7C_TREND_RUNTIME_HEARTBEAT_ERROR=" +
            errorMessage(error),
        );
      }
    },
    heartbeatMs,
  );

  heartbeatTimer.unref();

  process.once(
    "exit",
    () => {
      try {
        writeTrendRuntimeState(
          "STOPPED",
          false,
          true,
        );
      } catch {
        // Best-effort only.
      }
    },
  );

  console.log(
    "PHASE7C_TREND_RUNTIME_STATE=" +
      runtimePath,
  );

  console.log(
    "PHASE7C_TREND_RUNTIME_HEARTBEAT=ON" +
      "|PID=" +
      process.pid +
      "|INTERVAL_MS=" +
      heartbeatMs,
  );
}

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
  const [regime, demo] = await Promise.all([
    controlRequest(`/api/v1/phase7c/live-regime?${query.toString()}`),
    controlRequest("/api/v1/phase7b-demo"),
  ]);

  return evaluateAutoTrendEntryModeGate({
    activeMode,
    regime,
    demo,
  });
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
