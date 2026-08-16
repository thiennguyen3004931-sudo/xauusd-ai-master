import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const token = requiredEnv("ZIQ_TELEGRAM_BOT_TOKEN");
const chatId = requiredEnv("ZIQ_TELEGRAM_CHAT_ID");
const apiBase = (process.env.ZIQ_PHASE7C_CONTROL_API_URL?.trim() || "http://127.0.0.1:3711").replace(/\/$/, "");
const intervalMs = Math.max(1000, Number(process.env.ZIQ_PHASE7C_CONTROL_INTERVAL_MS ?? "1500"));
const inheritedRuntimeState = process.env.ZIQ_PHASE7C_REGIME_STATE_FILE?.trim();
const defaultStatusFile = inheritedRuntimeState
  ? resolve(dirname(inheritedRuntimeState), "telegram-mode-status.json")
  : resolve(".runtime/phase7c-telegram-mode-status.json");
const statusFile = resolve(
  process.env.ZIQ_PHASE7C_TELEGRAM_MODE_STATUS_FILE?.trim() || defaultStatusFile,
);
const telegramBase = `https://api.telegram.org/bot${token}`;
const validModes = new Set(["AUTO", "TREND", "SIDEWAY", "PAUSE"]);
let updateOffset = 0;
let ready = false;
let initialPanelSent = false;
let lastMode = "UNKNOWN";
let nextStartupAttemptAt = 0;
let lastTelegramSuccessAt = 0;
let lastApiSuccessAt = 0;

console.log("PHASE7C_TELEGRAM_MODE_CONTROLLER=RUNNING");
console.log(`PHASE7C_CONTROL_API=${apiBase}`);
console.log(`PHASE7C_TELEGRAM_STATUS_FILE=${statusFile}`);
console.log("PHASE7C_MT5_ORDER_PERMISSION=NONE");
await writeStatus({
  ready: false,
  status: "STARTING",
  startedAt: Date.now(),
  pid: process.pid,
  lastTelegramSuccessAt: null,
  lastApiSuccessAt: null,
});

while (true) {
  const now = Date.now();

  if (!ready && now >= nextStartupAttemptAt) {
    try {
      const initial = await getBotMode();
      lastApiSuccessAt = Date.now();
      lastMode = initial.mode;
      await telegramRequest("getMe");
      lastTelegramSuccessAt = Date.now();
      if (!initialPanelSent) {
        await sendPanel(initial.mode, "Bảng điều khiển bot đã sẵn sàng.");
        lastTelegramSuccessAt = Date.now();
        initialPanelSent = true;
      }
      ready = true;
      const successAt = Date.now();
      await writeStatus({
        ready: true,
        status: "READY",
        pid: process.pid,
        mode: lastMode,
        lastApiSuccessAt,
        lastTelegramSuccessAt,
        updatedAt: successAt,
      });
      console.log(`PHASE7C_TELEGRAM_MODE_READY=PASS|MODE=${initial.mode}`);
    } catch (error) {
      const message = errorMessage(error);
      nextStartupAttemptAt = Date.now() + 10_000;
      await writeStatus({
        ready: false,
        status: "STARTUP_RETRY",
        pid: process.pid,
        mode: lastMode,
        lastApiSuccessAt: lastApiSuccessAt || null,
        lastTelegramSuccessAt: lastTelegramSuccessAt || null,
        lastError: message,
        retryAt: nextStartupAttemptAt,
        updatedAt: Date.now(),
      });
      console.error(`PHASE7C_TELEGRAM_MODE_STARTUP_RETRY=${message}`);
    }
  }

  try {
    await pollTelegram();
    lastTelegramSuccessAt = Date.now();
    await writeStatus({
      ready,
      status: ready ? "READY" : "WAITING_STARTUP",
      pid: process.pid,
      mode: lastMode,
      lastApiSuccessAt: lastApiSuccessAt || null,
      lastTelegramSuccessAt,
      updatedAt: lastTelegramSuccessAt,
    });
  } catch (error) {
    const message = errorMessage(error);
    await writeStatus({
      ready,
      status: ready ? "DEGRADED_RETRYING" : "WAITING_STARTUP",
      pid: process.pid,
      mode: lastMode,
      lastApiSuccessAt: lastApiSuccessAt || null,
      lastTelegramSuccessAt: lastTelegramSuccessAt || null,
      lastError: message,
      updatedAt: Date.now(),
    });
    console.error(`PHASE7C_TELEGRAM_CONTROL_ERROR=${message}`);
  }

  await sleep(intervalMs);
}

async function pollTelegram() {
  const query = new URLSearchParams({
    offset: String(updateOffset),
    timeout: "0",
    limit: "25",
    allowed_updates: JSON.stringify(["message", "callback_query"]),
  });
  const payload = await telegramRequest(`getUpdates?${query.toString()}`);
  const updates = Array.isArray(payload.result) ? payload.result : [];

  for (const update of updates) {
    updateOffset = Math.max(updateOffset, Number(update.update_id ?? 0) + 1);
    if (update.callback_query) {
      await handleCallback(update.callback_query);
      continue;
    }
    if (update.message) {
      await handleMessage(update.message);
    }
  }
}

async function handleCallback(callback) {
  const callbackId = String(callback.id ?? "");
  const callbackChatId = String(callback.message?.chat?.id ?? callback.from?.id ?? "");
  if (callbackChatId !== String(chatId)) {
    if (callbackId) await answerCallback(callbackId, "Không được phép.");
    return;
  }

  const data = String(callback.data ?? "");
  if (data === "p7c:REFRESH") {
    const current = await getBotMode();
    lastApiSuccessAt = Date.now();
    lastMode = current.mode;
    if (callbackId) await answerCallback(callbackId, `Mode hiện tại: ${current.mode}`);
    await editPanel(callback.message, current.mode, "Đã làm mới trạng thái.");
    return;
  }

  const mode = data.startsWith("p7c:") ? data.slice(4).toUpperCase() : "";
  if (!validModes.has(mode)) {
    if (callbackId) await answerCallback(callbackId, "Mode không hợp lệ.");
    return;
  }

  const state = await setBotMode(mode, "telegram");
  lastApiSuccessAt = Date.now();
  lastMode = state.mode;
  if (callbackId) await answerCallback(callbackId, `Đã chọn ${state.mode}`);
  await editPanel(callback.message, state.mode, `Đã chuyển sang ${state.mode}.`);
  console.log(`PHASE7C_MODE_CHANGED=${state.mode}|SOURCE=TELEGRAM`);
}

async function handleMessage(message) {
  const messageChatId = String(message.chat?.id ?? "");
  if (messageChatId !== String(chatId)) return;
  const raw = String(message.text ?? "").trim();
  if (!raw) return;
  const command = raw.split(/\s+/)[0].toLowerCase().replace(/@[^\s]+$/, "");

  const commands = {
    "/trend": "TREND",
    "/sideway": "SIDEWAY",
    "/auto": "AUTO",
    "/pause": "PAUSE",
  };

  if (command === "/mode" || command === "/bots") {
    const current = await getBotMode();
    lastApiSuccessAt = Date.now();
    lastMode = current.mode;
    await sendPanel(current.mode, "Chọn bot bạn muốn cho phép hoạt động.");
    return;
  }

  const mode = commands[command];
  if (!mode) return;
  const state = await setBotMode(mode, "telegram-command");
  lastApiSuccessAt = Date.now();
  lastMode = state.mode;
  await sendPanel(state.mode, `Đã chuyển sang ${state.mode}.`);
  console.log(`PHASE7C_MODE_CHANGED=${state.mode}|SOURCE=TELEGRAM_COMMAND`);
}

async function sendPanel(mode, note) {
  await telegramRequest("sendMessage", {
    chat_id: chatId,
    text: panelText(mode, note),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: keyboard(mode),
  });
  lastTelegramSuccessAt = Date.now();
}

async function editPanel(message, mode, note) {
  const messageId = message?.message_id;
  const panelChatId = message?.chat?.id;
  if (!messageId || panelChatId === undefined) {
    await sendPanel(mode, note);
    return;
  }
  try {
    await telegramRequest("editMessageText", {
      chat_id: panelChatId,
      message_id: messageId,
      text: panelText(mode, note),
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: keyboard(mode),
    });
    lastTelegramSuccessAt = Date.now();
  } catch (error) {
    if (!errorMessage(error).includes("message is not modified")) throw error;
  }
}

function panelText(mode, note) {
  const description = {
    TREND: "Chỉ Trend Bot được phép tạo chiến lược mới.",
    SIDEWAY: "Chỉ Sideway Bot (Supply/Demand mean-reversion) được phép tạo chiến lược mới.",
    AUTO: "Regime Engine tự chọn bot; REVERSAL/UNCERTAIN sẽ khuyến nghị PAUSE.",
    PAUSE: "Không bot nào được phép tạo plan giao dịch mới.",
  }[mode] ?? "Trạng thái không xác định.";

  return [
    "🎛 <b>XAUUSD AI MASTER · BOT MODE</b>",
    "",
    `Mode hiện tại: <b>${escapeHtml(mode)}</b>`,
    escapeHtml(description),
    "",
    `ℹ️ ${escapeHtml(note)}`,
    "🔒 Panel chỉ đổi mode qua API, không gửi lệnh trực tiếp tới MT5.",
  ].join("\n");
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
      [{ text: "🔄 Làm mới", callback_data: "p7c:REFRESH" }],
    ],
  };
}

async function getBotMode() {
  const response = await apiRequest("GET", "/api/v1/phase7c/bot-mode");
  return response.state ?? { mode: "PAUSE" };
}

async function setBotMode(mode, source) {
  const response = await apiRequest("POST", "/api/v1/phase7c/bot-mode", { mode, source });
  return response.state;
}

async function apiRequest(method, endpoint, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${apiBase}${endpoint}`, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Phase7C API ${response.status}: ${text}`);
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timeout);
  }
}

async function telegramRequest(method, body) {
  const url = `${telegramBase}/${method}`;
  const response = await fetch(url, body === undefined ? undefined : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(`Telegram ${method} failed: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function answerCallback(callbackQueryId, text) {
  await telegramRequest("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  });
  lastTelegramSuccessAt = Date.now();
}

async function writeStatus(next) {
  const now = Date.now();
  const payload = {
    version: 1,
    ...next,
    updatedAt: next.updatedAt ?? now,
    updatedAtIso: new Date(next.updatedAt ?? now).toISOString(),
  };
  await mkdir(dirname(statusFile), { recursive: true });
  const temporary = `${statusFile}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(temporary, statusFile);
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
