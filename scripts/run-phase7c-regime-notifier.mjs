import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const token = requiredEnv("ZIQ_TELEGRAM_BOT_TOKEN");
const chatId = requiredEnv("ZIQ_TELEGRAM_CHAT_ID");
const apiBase = (process.env.ZIQ_PHASE7C_CONTROL_API_URL?.trim() || "http://127.0.0.1:3711").replace(/\/$/, "");
const symbol = process.env.ZIQ_PHASE7C_REGIME_SYMBOL?.trim().toUpperCase() || "XAUUSD";
const candleCount = clampInt(process.env.ZIQ_PHASE7C_REGIME_CANDLE_COUNT, 320, 220, 1000);
const intervalMs = clampInt(process.env.ZIQ_PHASE7C_REGIME_INTERVAL_MS, 15_000, 5_000, 300_000);
const heartbeatMinutes = clampInt(process.env.ZIQ_PHASE7C_REGIME_HEARTBEAT_MINUTES, 60, 0, 1440);
const stateFile = resolve(
  process.env.ZIQ_PHASE7C_REGIME_STATE_FILE?.trim() || ".runtime/phase7c-regime-notifier-state.json",
);
const telegramBase = `https://api.telegram.org/bot${token}`;

let state = await loadState();
console.log("PHASE7C_REGIME_NOTIFIER=RUNNING");
console.log(`PHASE7C_REGIME_API=${apiBase}`);
console.log(`PHASE7C_REGIME_SYMBOL=${symbol}`);
console.log(`PHASE7C_REGIME_INTERVAL_MS=${intervalMs}`);
console.log(`PHASE7C_REGIME_HEARTBEAT_MINUTES=${heartbeatMinutes}`);
console.log("PHASE7C_MT5_ORDER_PERMISSION=NONE");

while (true) {
  const startedAt = Date.now();
  try {
    const snapshot = await fetchRegime();
    const reason = notificationReason(snapshot, state, startedAt);
    if (reason) {
      await sendTelegram(snapshot, reason);
      state = {
        regime: snapshot.regime,
        recommendedMode: snapshot.recommendedMode,
        activeMode: snapshot.activeMode,
        lastCandleCloseTime: snapshot.lastCandleCloseTime,
        lastNotifiedAt: startedAt,
      };
      await saveState(state);
      console.log(
        `PHASE7C_REGIME_NOTIFICATION=${snapshot.regime}|RECOMMENDED=${snapshot.recommendedMode}|ACTIVE=${snapshot.activeMode}|REASON=${reason}`,
      );
    } else {
      state = {
        ...state,
        regime: snapshot.regime,
        recommendedMode: snapshot.recommendedMode,
        activeMode: snapshot.activeMode,
        lastCandleCloseTime: snapshot.lastCandleCloseTime,
      };
      await saveState(state);
    }
  } catch (error) {
    console.error(`PHASE7C_REGIME_NOTIFIER_ERROR=${errorMessage(error)}`);
  }

  const elapsed = Date.now() - startedAt;
  await sleep(Math.max(1000, intervalMs - elapsed));
}

function notificationReason(snapshot, previous, now) {
  if (!previous.regime) return "INITIAL";
  if (snapshot.regime !== previous.regime) return "REGIME_CHANGED";
  if (snapshot.recommendedMode !== previous.recommendedMode) return "RECOMMENDATION_CHANGED";
  if (snapshot.activeMode !== previous.activeMode) return "ACTIVE_MODE_CHANGED";

  if (
    heartbeatMinutes > 0 &&
    previous.lastNotifiedAt &&
    now - previous.lastNotifiedAt >= heartbeatMinutes * 60_000 &&
    snapshot.lastCandleCloseTime !== previous.lastCandleCloseTime
  ) {
    return "HEARTBEAT";
  }

  return "";
}

async function fetchRegime() {
  const query = new URLSearchParams({
    symbol,
    count: String(candleCount),
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${apiBase}/api/v1/phase7c/live-regime?${query.toString()}`, {
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Phase7C live-regime ${response.status}: ${text}`);
    }
    const snapshot = JSON.parse(text);
    if (!snapshot?.regime || !snapshot?.recommendedMode || !snapshot?.activeMode) {
      throw new Error("Phase7C live-regime returned an incomplete snapshot.");
    }
    return snapshot;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendTelegram(snapshot, reason) {
  const response = await fetch(`${telegramBase}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: formatMessage(snapshot, reason),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: keyboard(snapshot.activeMode),
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(`Telegram sendMessage failed: ${JSON.stringify(payload)}`);
  }
}

function formatMessage(snapshot, reason) {
  const regime = String(snapshot.regime);
  const recommended = String(snapshot.recommendedMode);
  const active = String(snapshot.activeMode);
  const confidence = percentage(snapshot.confidence);
  const currentPrice = number(snapshot.metrics?.close, 2);
  const atr = number(snapshot.metrics?.atr, 2);
  const adx = firstNumber(snapshot.metrics, ["adx", "adxValue", "trendStrength"]);
  const bandwidth = number(snapshot.metrics?.bollingerBandwidth, 4);
  const range = snapshot.supplyDemandRange;
  const icon = regimeIcon(regime);
  const modeStatus = snapshot.modeMatchesRecommendation
    ? "✅ Mode đang chạy phù hợp"
    : `⚠️ Mode đang chạy <b>${escapeHtml(active)}</b> khác khuyến nghị <b>${escapeHtml(recommended)}</b>`;

  const lines = [
    `${icon} <b>XAUUSD AI MASTER · MARKET REGIME</b>`,
    "",
    `Regime: <b>${escapeHtml(regimeLabel(regime))}</b>`,
    `Confidence: <b>${escapeHtml(confidence)}</b>`,
    `Khuyến nghị: <b>${escapeHtml(recommended)}</b>`,
    `Mode hiện tại: <b>${escapeHtml(active)}</b>`,
    modeStatus,
    "",
    `Giá M15: <b>${currentPrice}</b>`,
    `ATR: ${atr}`,
    `ADX: ${adx === null ? "n/a" : number(adx, 1)}`,
    `BB Width: ${bandwidth}`,
  ];

  if (range) {
    lines.push(
      "",
      "📦 <b>Supply / Demand Range</b>",
      `Supply: ${number(range.supply?.low, 2)} → ${number(range.supply?.high, 2)}`,
      `Demand: ${number(range.demand?.low, 2)} → ${number(range.demand?.high, 2)}`,
      `Range position: ${percentage(range.position)}`,
      `Range quality: ${percentage(range.quality)}`,
    );
  }

  lines.push(
    "",
    recommendationText(recommended),
    `Trigger: ${escapeHtml(reason)}`,
    "",
    "Chọn mode bên dưới. Panel chỉ đổi quyền mở lệnh mới; không gửi lệnh MT5 trực tiếp.",
  );

  return lines.join("\n");
}

function recommendationText(mode) {
  if (mode === "TREND") {
    return "🟢 <b>Đề xuất:</b> dùng Trend Bot; Sideway Bot nên tắt.";
  }
  if (mode === "SIDEWAY") {
    return "🟡 <b>Đề xuất:</b> dùng Sideway Bot tại biên Supply/Demand; Trend Bot nên tắt.";
  }
  return "⚪ <b>Đề xuất:</b> TRANSITION/UNCERTAIN — PAUSE cả hai bot, chờ xác nhận mới.";
}

function keyboard(activeMode) {
  const button = (label, mode) => ({
    text: `${activeMode === mode ? "✅ " : ""}${label}`,
    callback_data: `p7c:${mode}`,
  });
  return {
    inline_keyboard: [
      [button("TREND", "TREND"), button("SIDEWAY", "SIDEWAY")],
      [button("AUTO", "AUTO"), button("PAUSE", "PAUSE")],
    ],
  };
}

function regimeLabel(regime) {
  if (regime === "TRENDING") return "TREND";
  if (regime === "BREAKOUT") return "TREND / BREAKOUT";
  if (regime === "RANGING") return "SIDEWAY";
  if (regime === "REVERSAL") return "TRANSITION / REVERSAL";
  return "TRANSITION / UNCERTAIN";
}

function regimeIcon(regime) {
  if (regime === "TRENDING" || regime === "BREAKOUT") return "🟢";
  if (regime === "RANGING") return "🟡";
  return "⚪";
}

async function loadState() {
  try {
    const raw = await readFile(stateFile, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveState(nextState) {
  await mkdir(dirname(stateFile), { recursive: true });
  const temporary = `${stateFile}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
  await rename(temporary, stateFile);
}

function firstNumber(object, keys) {
  for (const key of keys) {
    const value = Number(object?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function percentage(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "n/a";
  const normalized = numeric <= 1 ? numeric * 100 : numeric;
  return `${normalized.toFixed(0)}%`;
}

function number(value, digits) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : "n/a";
}

function clampInt(raw, fallback, min, max) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env ${name}`);
  return value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
