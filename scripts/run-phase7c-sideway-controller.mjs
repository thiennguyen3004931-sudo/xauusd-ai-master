import fs from "node:fs";
import path from "node:path";
import {
  buildSidewayPlan,
  chooseRangeSide,
  detectM5Confirmation,
  estimateVolumePoc,
  normalizeVolume,
  oneThirdPartialVolume,
  resolveSidewayPermission,
  targetReached,
} from "./phase7c-sideway-logic.mjs";

const symbol = (process.env.ZIQ_PHASE7C_SIDEWAY_SYMBOL || process.env.ZIQ_DEMO_SYMBOL || "XAUUSD").trim().toUpperCase();
const controlApiBase = (process.env.ZIQ_PHASE7C_CONTROL_API_URL || "http://127.0.0.1:3711").trim().replace(/\/$/, "");
const intervalSeconds = clampNumber(process.env.ZIQ_PHASE7C_SIDEWAY_INTERVAL_SECONDS, 5, 1, 60);
const riskPercent = clampNumber(process.env.ZIQ_PHASE7C_SIDEWAY_RISK_PERCENT, 0.25, 0.01, 5);
const maxLot = clampNumber(process.env.ZIQ_PHASE7C_SIDEWAY_MAX_LOT, 0.03, 0.01, 10);
const minRegimeConfidence = clampNumber(process.env.ZIQ_PHASE7C_SIDEWAY_MIN_REGIME_CONFIDENCE, 60, 0, 100);
const regimeCandleCount = clampInteger(process.env.ZIQ_PHASE7C_REGIME_CANDLE_COUNT, 320, 220, 1000);
const m5CandleCount = clampInteger(process.env.ZIQ_PHASE7C_SIDEWAY_M5_COUNT, 120, 30, 500);
const armed = truthy(process.env.ZIQ_PHASE7C_SIDEWAY_ARMED);
const once = truthy(process.env.ZIQ_PHASE7C_SIDEWAY_ONCE);
const workDir = process.env.ZIQ_PHASE7C_SIDEWAY_WORK_DIR?.trim() || path.resolve(".runtime", "phase7c-sideway");
const maxHoldingMinutes = clampInteger(process.env.ZIQ_PHASE7C_SIDEWAY_MAX_HOLD_MINUTES, 180, 30, 720);
const magicNumber = clampInteger(process.env.ZIQ_PHASE7C_SIDEWAY_MAGIC_NUMBER, 270714, 1, 2147483647);
const deviationPoints = clampInteger(process.env.MT5_DEVIATION_POINTS, 50, 1, 10000);
const allowReal = truthy(process.env.MT5_ALLOW_REAL_ACCOUNT);
const allowedLogins = new Set(
  String(process.env.MT5_ALLOWED_LOGINS || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter(Number.isFinite),
);

const bridgeBase = process.env.MT5_BRIDGE_BASE_URL?.trim().replace(/\/$/, "") ||
  `http://${process.env.MT5_BRIDGE_HOST || "127.0.0.1"}:${process.env.MT5_BRIDGE_PORT || "8765"}`;
const bridgeApiKey = (process.env.MT5_API_KEY || process.env.MT5_BRIDGE_API_KEY || "").trim();
if (!bridgeApiKey) throw new Error("MT5_API_KEY or MT5_BRIDGE_API_KEY is required for Phase 7C Sideway controller.");
if (allowReal) throw new Error("Phase 7C Sideway controller refuses MT5_ALLOW_REAL_ACCOUNT=true.");

fs.mkdirSync(workDir, { recursive: true });
const statePath = path.join(workDir, "phase7c-sideway-state.json");
const journalPath = path.join(workDir, "phase7c-sideway-events.jsonl");
let state = loadState();

console.log("PHASE7C_SIDEWAY_CONTROLLER=STARTING");
console.log(`PHASE7C_SIDEWAY_SYMBOL=${symbol}`);
console.log(`PHASE7C_CONTROL_API=${controlApiBase}`);
console.log(`PHASE7C_SIDEWAY_ARMED=${armed ? "YES" : "NO"}`);
console.log(`PHASE7C_SIDEWAY_RISK_PERCENT=${riskPercent}`);
console.log(`PHASE7C_SIDEWAY_MAX_LOT=${maxLot}`);
console.log(`PHASE7C_SIDEWAY_MIN_REGIME_CONFIDENCE=${minRegimeConfidence}`);
console.log(`PHASE7C_SIDEWAY_MAX_HOLD_MINUTES=${maxHoldingMinutes}`);
console.log("PHASE7C_SIDEWAY_ENTRY=M15_RANGING_PLUS_SUPPLY_DEMAND_EDGE_PLUS_M5_CONFIRMATION");
console.log("PHASE7C_SIDEWAY_TP1=VOLUME_POC_OR_RANGE_MID_FALLBACK");
console.log("PHASE7C_SIDEWAY_TP2=OPPOSITE_RANGE_BOUNDARY");
console.log("PHASE7C_SIDEWAY_MANAGEMENT=ONE_THIRD_PARTIAL_THEN_BREAK_EVEN_NO_TRAILING");
console.log("PHASE7C_SIDEWAY_FAIL_CLOSED=TRUE");
console.log(`PHASE7C_SIDEWAY_STATE=${statePath}`);
console.log(`PHASE7C_SIDEWAY_JOURNAL=${journalPath}`);

await preflight();

if (!armed) {
  await cycle();
  console.log("PHASE7C_SIDEWAY_PREFLIGHT_STATUS=PASS");
  console.log("PHASE7C_SIDEWAY_ORDER_SEND=DISABLED_NOT_ARMED");
  process.exit(0);
}

console.log("PHASE7C_SIDEWAY_PREFLIGHT_STATUS=PASS");
console.log("PHASE7C_SIDEWAY_EXECUTION_STATUS=ARMED_DEMO_ONLY");

while (true) {
  try {
    await cycle();
  } catch (error) {
    journal("CYCLE_ERROR", { message: errorMessage(error) });
    console.error(`PHASE7C_SIDEWAY_CYCLE_ERROR=${errorMessage(error)}`);
  }
  if (once) break;
  await sleep(intervalSeconds * 1000);
}

async function preflight() {
  const health = await bridgeGet("/health");
  console.log(`PHASE7C_SIDEWAY_ACCOUNT_LOGIN=${health.accountLogin ?? "UNKNOWN"}`);
  console.log(`PHASE7C_SIDEWAY_ACCOUNT_MODE=${health.accountMode ?? "UNKNOWN"}`);
  console.log(`PHASE7C_SIDEWAY_SERVER=${health.server ?? "UNKNOWN"}`);
  console.log(`PHASE7C_SIDEWAY_BRIDGE_TRADING_ENABLED=${health.tradingEnabled ? "YES" : "NO"}`);

  if (!health.connected || health.status !== "ok") throw new Error("MT5 bridge is not healthy/connected.");
  if (health.accountMode !== "demo") throw new Error(`Phase 7C Sideway requires accountMode=demo, got ${health.accountMode ?? "unknown"}.`);
  if (!Number.isFinite(Number(health.accountLogin))) throw new Error("MT5 DEMO account login is unavailable.");

  if (state.accountLogin !== null && state.accountLogin !== Number(health.accountLogin)) {
    throw new Error(`Sideway state belongs to account ${state.accountLogin}, current account is ${health.accountLogin}.`);
  }

  if (armed) {
    if (!health.tradingEnabled) throw new Error("MT5 bridge trading is disabled.");
    if (!health.terminalTradeAllowed || !health.expertTradeAllowed) throw new Error("MT5 automated trading is not enabled in terminal/account.");
    if (allowedLogins.size === 0) throw new Error(`MT5_ALLOWED_LOGINS is empty. Add DEMO login ${health.accountLogin} before arming.`);
    if (!allowedLogins.has(Number(health.accountLogin))) throw new Error(`Current DEMO login ${health.accountLogin} is not in MT5_ALLOWED_LOGINS.`);
  }

  state.accountLogin = Number(health.accountLogin);
  saveState();
}

async function cycle() {
  const health = await bridgeGet("/health");
  if (
    health.accountMode !== "demo" ||
    !health.connected ||
    (armed && (!health.tradingEnabled || !health.terminalTradeAllowed || !health.expertTradeAllowed || !allowedLogins.has(Number(health.accountLogin))))
  ) {
    journal("DEMO_GUARD_BLOCK", {
      accountLogin: health.accountLogin,
      accountMode: health.accountMode,
      connected: health.connected,
      tradingEnabled: health.tradingEnabled,
      terminalTradeAllowed: health.terminalTradeAllowed,
      expertTradeAllowed: health.expertTradeAllowed,
    });
    return;
  }

  const [positions, quote, spec] = await Promise.all([
    bridgeGet(`/v1/positions?symbol=${encodeURIComponent(symbol)}`),
    bridgeGet(`/v1/quotes/${encodeURIComponent(symbol)}`),
    bridgeGet(`/v1/symbols/${encodeURIComponent(symbol)}/spec`),
  ]);

  if (state.managed) {
    const managedPosition = positions.find((position) => String(position.ticket) === state.managed.ticket);
    if (!managedPosition) {
      journal("MANAGED_POSITION_CLOSED", { ticket: state.managed.ticket, lastKnownState: state.managed });
      state.managed = null;
      saveState();
      return;
    }
    if (positions.length !== 1) {
      journal("UNEXPECTED_ADDITIONAL_POSITION", { managedTicket: state.managed.ticket, positions: positions.map((position) => position.ticket) });
      return;
    }
    const expectedSide = state.managed.side === "BUY" ? "LONG" : "SHORT";
    if (managedPosition.side !== expectedSide) {
      journal("MANAGED_POSITION_SIDE_MISMATCH", { ticket: managedPosition.ticket, expectedSide, actualSide: managedPosition.side });
      return;
    }
    if (Math.abs(Number(managedPosition.volume) - state.managed.expectedRemainingVolume) > Number(spec.volumeStep) / 2 + 1e-9) {
      journal("MANAGED_POSITION_VOLUME_MISMATCH", {
        ticket: managedPosition.ticket,
        expected: state.managed.expectedRemainingVolume,
        actual: managedPosition.volume,
      });
      return;
    }
    await managePosition(managedPosition, quote, spec);
    return;
  }

  if (positions.length > 0) {
    journal("UNMANAGED_POSITION_PRESENT", { positions: positions.map((position) => ({ ticket: position.ticket, side: position.side, volume: position.volume })) });
    return;
  }

  const maxSpread = Number(spec.maxSpread);
  if (Number.isFinite(maxSpread) && maxSpread > 0 && Number(quote.spread) > maxSpread) {
    journal("ENTRY_SPREAD_BLOCK", { spread: quote.spread, maxSpread });
    return;
  }

  const [modePayload, regime, m5] = await Promise.all([
    controlGet("/api/v1/phase7c/bot-mode"),
    controlGet(`/api/v1/phase7c/live-regime?symbol=${encodeURIComponent(symbol)}&count=${regimeCandleCount}`),
    bridgeGet(`/v1/candles/${encodeURIComponent(symbol)}?timeframe=M5&count=${m5CandleCount}`),
  ]);

  const latest = Array.isArray(m5) ? m5.at(-1) : null;
  if (!latest || !Number.isFinite(Number(latest.closeTime))) {
    journal("M5_DATA_INVALID", {});
    return;
  }
  const closeTime = Number(latest.closeTime);
  if (closeTime <= state.lastEvaluatedM5Close) return;
  state.lastEvaluatedM5Close = closeTime;
  saveState();

  const activeMode = String(modePayload?.state?.mode ?? "PAUSE").toUpperCase();
  const permission = resolveSidewayPermission(activeMode, regime?.recommendedMode);
  if (!permission.allowed) {
    journal("ENTRY_MODE_BLOCK", permission);
    return;
  }

  if (
    regime?.regime !== "RANGING" ||
    regime?.recommendedMode !== "SIDEWAY" ||
    !regime?.supplyDemandRange ||
    Number(regime?.confidence ?? 0) < minRegimeConfidence
  ) {
    journal("ENTRY_REGIME_BLOCK", {
      activeMode,
      regime: regime?.regime ?? null,
      confidence: regime?.confidence ?? null,
      minRegimeConfidence,
      recommendedMode: regime?.recommendedMode ?? null,
      hasRange: Boolean(regime?.supplyDemandRange),
    });
    return;
  }

  const side = chooseRangeSide(regime.supplyDemandRange, Number(quote.bid), Number(quote.ask));
  if (!side) {
    journal("ENTRY_LOCATION_BLOCK", {
      closeTime,
      bid: quote.bid,
      ask: quote.ask,
      range: regime.supplyDemandRange,
      note: "Middle-range and live breakouts outside the outer zones are blocked.",
    });
    return;
  }

  const confirmation = detectM5Confirmation(m5, side);
  if (!confirmation || Number(confirmation.closeTime) !== closeTime) {
    journal("ENTRY_M5_CONFIRMATION_BLOCK", { closeTime, side });
    return;
  }

  const lower = Number(regime.supplyDemandRange.demand.high);
  const upper = Number(regime.supplyDemandRange.supply.low);
  const poc = estimateVolumePoc(m5.slice(-96), lower, upper, 24);
  const plan = buildSidewayPlan({
    side,
    bid: Number(quote.bid),
    ask: Number(quote.ask),
    range: regime.supplyDemandRange,
    atr: Number(regime.metrics?.atr),
    poc,
    point: Number(spec.point),
    stopsLevelTicks: Number(spec.stopsLevelTicks ?? 0),
    digits: Number(spec.digits ?? 2),
  });

  if (!plan.accepted) {
    journal("ENTRY_PLAN_BLOCK", { closeTime, side, plan });
    return;
  }

  const autoLot = await controlGet(
    `/api/v1/phase7c/auto-lot-preview?stopDistance=${encodeURIComponent(plan.stopDistance)}&riskPercent=${encodeURIComponent(riskPercent)}&maxLot=${encodeURIComponent(maxLot)}`,
  );
  const preview = autoLot?.preview;
  if (!preview?.approved || !(Number(preview.recommendedLot) > 0)) {
    journal("ENTRY_AUTO_LOT_BLOCK", { closeTime, side, stopDistance: plan.stopDistance, preview: preview ?? null });
    return;
  }

  const volume = Number(preview.recommendedLot);
  validateVolume(volume, spec);

  // Re-check the mode/regime immediately before mutation to close the gap
  // between signal evaluation and order submission.
  const [freshMode, freshRegime] = await Promise.all([
    controlGet("/api/v1/phase7c/bot-mode"),
    controlGet(`/api/v1/phase7c/live-regime?symbol=${encodeURIComponent(symbol)}&count=${regimeCandleCount}`),
  ]);
  const finalPermission = resolveSidewayPermission(freshMode?.state?.mode, freshRegime?.recommendedMode);
  if (
    !finalPermission.allowed ||
    freshRegime?.regime !== "RANGING" ||
    freshRegime?.recommendedMode !== "SIDEWAY" ||
    Number(freshRegime?.confidence ?? 0) < minRegimeConfidence
  ) {
    journal("ENTRY_FINAL_GATE_BLOCK", {
      finalPermission,
      regime: freshRegime?.regime ?? null,
      confidence: freshRegime?.confidence ?? null,
      minRegimeConfidence,
    });
    return;
  }

  const orderId = `p7c-sideway-${closeTime}-${side}`;
  journal("ENTRY_SUBMIT", {
    orderId,
    closeTime,
    side,
    confirmation: confirmation.pattern,
    volume,
    riskPercent,
    estimatedRiskUsd: preview.estimatedRiskUsd,
    plan,
    regimeConfidence: freshRegime?.confidence,
  });

  if (!armed) {
    journal("ENTRY_SHADOW_READY", { orderId, side, volume, plan });
    return;
  }

  const order = await bridgeRequest("POST", "/v1/orders", {
    symbol,
    side,
    orderType: "MARKET",
    timeInForce: "GTC",
    volume,
    requestedPrice: plan.entry,
    stopLoss: plan.stopLoss,
    takeProfit: plan.takeProfit,
    deviationPoints,
    magicNumber,
    comment: "phase7c-sideway",
    clientOrderId: orderId,
    idempotencyKey: orderId,
  });

  if (!order.accepted) {
    journal("ENTRY_REJECTED", { orderId, message: order.message, retcode: order.retcode });
    return;
  }

  let opened = order.position ?? null;
  if (!opened) {
    const after = await bridgeGet(`/v1/positions?symbol=${encodeURIComponent(symbol)}`);
    if (Array.isArray(after) && after.length === 1) opened = after[0];
  }
  if (!opened) {
    journal("ENTRY_ACCEPTED_POSITION_NOT_RESOLVED", { orderId, ticket: order.ticket, fillPrice: order.fillPrice });
    return;
  }

  state.managed = {
    ticket: String(opened.ticket),
    side,
    signalM5CloseTime: closeTime,
    entry: Number(opened.entry),
    initialVolume: Number(opened.volume),
    expectedRemainingVolume: Number(opened.volume),
    stopLoss: plan.stopLoss,
    stopDistance: Math.abs(Number(opened.entry) - plan.stopLoss),
    tp1: plan.tp1,
    tp1Kind: plan.tp1Kind,
    tp2: plan.takeProfit,
    partialApplied: false,
    breakEvenApplied: false,
    lastRegimeCloseChecked: Number(freshRegime?.lastCandleCloseTime ?? 0),
    openedAt: Date.now(),
    timeStopAt: Date.now() + maxHoldingMinutes * 60_000,
    partialAttempt: 0,
    breakEvenAttempt: 0,
    exitAttempt: 0,
  };
  saveState();
  journal("ENTRY_FILLED", { orderId, position: opened, management: state.managed });
}

async function managePosition(position, quote, spec) {
  const managed = state.managed;
  const marketPrice = managed.side === "BUY" ? Number(quote.bid) : Number(quote.ask);

  if (Date.now() >= managed.timeStopAt) {
    await closeAll(position, "TIME_STOP_180M");
    return;
  }

  try {
    const regime = await controlGet(`/api/v1/phase7c/live-regime?symbol=${encodeURIComponent(symbol)}&count=${regimeCandleCount}`);
    const regimeClose = Number(regime?.lastCandleCloseTime ?? 0);
    if (regimeClose > managed.lastRegimeCloseChecked) {
      managed.lastRegimeCloseChecked = regimeClose;
      saveState();
      if (regime?.regime !== "RANGING" || regime?.recommendedMode !== "SIDEWAY") {
        journal("MANAGEMENT_REGIME_INVALIDATION", {
          ticket: managed.ticket,
          regime: regime?.regime ?? null,
          recommendedMode: regime?.recommendedMode ?? null,
          closeTime: regimeClose,
        });
        await closeAll(position, "REGIME_LEFT_RANGE");
        return;
      }
    }
  } catch (error) {
    // Existing broker SL/TP remains active. A control API outage must never
    // trigger a blind close or abandon management state.
    journal("MANAGEMENT_REGIME_CHECK_ERROR", { ticket: managed.ticket, message: errorMessage(error) });
  }

  if (!managed.partialApplied && targetReached(managed.side, marketPrice, managed.tp1)) {
    const closeVolume = oneThirdPartialVolume(
      managed.initialVolume,
      Number(position.volume),
      Number(spec.minVolume),
      Number(spec.volumeStep),
    );
    if (!(closeVolume > 0)) {
      journal("TP1_PARTIAL_NOT_FEASIBLE", {
        ticket: managed.ticket,
        initialVolume: managed.initialVolume,
        currentVolume: position.volume,
      });
    } else {
      managed.partialAttempt += 1;
      saveState();
      const response = await bridgeRequest("POST", `/v1/positions/${encodeURIComponent(managed.ticket)}/close`, {
        volume: closeVolume,
        commandId: `p7c-sideway-tp1-${managed.ticket}-${managed.partialAttempt}`,
      });
      if (response.success) {
        managed.partialApplied = true;
        managed.expectedRemainingVolume = normalizeVolume(Number(position.volume) - closeVolume, Number(spec.volumeStep));
        saveState();
        journal("TP1_PARTIAL_FILLED", {
          ticket: managed.ticket,
          tp1: managed.tp1,
          tp1Kind: managed.tp1Kind,
          marketPrice,
          closedVolume: closeVolume,
          remainingVolume: managed.expectedRemainingVolume,
        });
      } else {
        journal("TP1_PARTIAL_REJECTED", { ticket: managed.ticket, response });
      }
    }
  }

  if (managed.partialApplied && !managed.breakEvenApplied) {
    const minimumGap = Math.max(Number(spec.stopsLevelTicks ?? 0), Number(spec.freezeLevelTicks ?? 0)) * Number(spec.point);
    const valid = managed.side === "BUY"
      ? managed.entry < Number(quote.bid) - minimumGap
      : managed.entry > Number(quote.ask) + minimumGap;
    if (valid) {
      managed.breakEvenAttempt += 1;
      saveState();
      const response = await bridgeRequest("PATCH", `/v1/positions/${encodeURIComponent(managed.ticket)}`, {
        stopLoss: roundPrice(managed.entry, Number(spec.digits ?? 2)),
        commandId: `p7c-sideway-be-${managed.ticket}-${managed.breakEvenAttempt}`,
      });
      if (response.success) {
        managed.breakEvenApplied = true;
        saveState();
        journal("TP1_BREAK_EVEN_APPLIED", { ticket: managed.ticket, stopLoss: managed.entry });
      } else {
        journal("TP1_BREAK_EVEN_REJECTED", { ticket: managed.ticket, response });
      }
    }
  }

  // TP2 is already broker-protected on the position. This fallback closes
  // the remainder if a bridge/broker reports the position before TP handling.
  if (targetReached(managed.side, marketPrice, managed.tp2)) {
    await closeAll(position, "TP2_OPPOSITE_RANGE");
  }
}

async function closeAll(position, reason) {
  const managed = state.managed;
  managed.exitAttempt += 1;
  saveState();
  const response = await bridgeRequest("POST", `/v1/positions/${encodeURIComponent(managed.ticket)}/close`, {
    volume: Number(position.volume),
    commandId: `p7c-sideway-exit-${managed.ticket}-${managed.exitAttempt}`,
  });
  if (response.success) {
    journal("POSITION_CLOSED", { ticket: managed.ticket, reason, response });
    state.managed = null;
    saveState();
  } else {
    journal("POSITION_CLOSE_REJECTED", { ticket: managed.ticket, reason, response });
  }
}

async function controlGet(pathname) {
  return jsonRequest(`${controlApiBase}${pathname}`, { method: "GET", headers: { accept: "application/json" } }, 5_000, "Phase7C control API");
}

async function bridgeGet(pathname) {
  return bridgeRequest("GET", pathname);
}

async function bridgeRequest(method, pathname, body = undefined) {
  const headers = {
    accept: "application/json",
    "x-mt5-api-key": bridgeApiKey,
  };
  if (body !== undefined) headers["content-type"] = "application/json";
  return jsonRequest(`${bridgeBase}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }, 10_000, "MT5 bridge");
}

async function jsonRequest(url, init, timeoutMs, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    const text = await response.text();
    if (!response.ok) throw new Error(`${label} ${response.status}: ${text}`);
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timeout);
  }
}

function validateVolume(volume, spec) {
  const min = Number(spec.minVolume);
  const max = Number(spec.maxVolume);
  const step = Number(spec.volumeStep);
  if (!(volume >= min - 1e-9 && volume <= max + 1e-9 && step > 0)) {
    throw new Error(`Auto Lot ${volume} is outside broker volume range ${min}..${max}.`);
  }
  const units = volume / step;
  if (Math.abs(units - Math.round(units)) > 1e-7) {
    throw new Error(`Auto Lot ${volume} does not align to broker volume step ${step}.`);
  }
}

function loadState() {
  if (!fs.existsSync(statePath)) {
    return { version: 1, accountLogin: null, lastEvaluatedM5Close: 0, managed: null };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (parsed?.version !== 1) throw new Error("unsupported state version");
    return {
      version: 1,
      accountLogin: Number.isFinite(Number(parsed.accountLogin)) ? Number(parsed.accountLogin) : null,
      lastEvaluatedM5Close: Number(parsed.lastEvaluatedM5Close ?? 0),
      managed: parsed.managed ?? null,
    };
  } catch (error) {
    throw new Error(`Cannot load Phase 7C Sideway state: ${errorMessage(error)}`);
  }
}

function saveState() {
  const temporary = `${statePath}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, statePath);
}

function journal(event, payload) {
  const record = { timestamp: Date.now(), event, ...payload };
  fs.appendFileSync(journalPath, `${JSON.stringify(record)}\n`, "utf8");
  console.log(`PHASE7C_SIDEWAY_EVENT=${event}|${JSON.stringify(payload)}`);
}

function truthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? ""));
}

function clampNumber(raw, fallback, min, max) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function clampInteger(raw, fallback, min, max) {
  return Math.trunc(clampNumber(raw, fallback, min, max));
}

function roundPrice(value, digits) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
