import fs from "node:fs";
import path from "node:path";

const token = requiredEnv("ZIQ_TELEGRAM_BOT_TOKEN");
const chatId = requiredEnv("ZIQ_TELEGRAM_CHAT_ID");
const journalPath = requiredEnv("ZIQ_TELEGRAM_JOURNAL_PATH");
const statePath = requiredEnv("ZIQ_TELEGRAM_STATE_PATH");
const symbol = process.env.ZIQ_TELEGRAM_SYMBOL ?? "XAUUSD";
const intervalMs = Math.max(1000, Number(process.env.ZIQ_TELEGRAM_INTERVAL_MS ?? "2000"));
const messageThreadId = optionalNumber(process.env.ZIQ_TELEGRAM_MESSAGE_THREAD_ID);
const monitorUrl = process.env.ZIQ_TELEGRAM_MONITOR_URL?.trim() ?? "";
const sendStartup = /^(1|true|yes|on)$/i.test(process.env.ZIQ_TELEGRAM_SEND_STARTUP ?? "true");
const replayExisting = /^(1|true|yes|on)$/i.test(process.env.ZIQ_TELEGRAM_REPLAY_EXISTING ?? "false");
const once = /^(1|true|yes|on)$/i.test(process.env.ZIQ_TELEGRAM_ONCE ?? "false");
const sendTest = /^(1|true|yes|on)$/i.test(process.env.ZIQ_TELEGRAM_SEND_TEST ?? "false");

const interestingEvents = new Set([
  "ENTRY_SUBMIT",
  "ENTRY_FILLED",
  "ENTRY_REJECTED",
  "ENTRY_ACCEPTED_POSITION_NOT_RESOLVED",
  "PLUS6_SL_TO_ENTRY",
  "PLUS6_SL_REJECTED",
  "PLUS10_PARTIAL_ONE_THIRD",
  "PLUS10_PARTIAL_REJECTED",
  "STRUCTURAL_SL_TIGHTEN",
  "STRUCTURAL_SL_REJECTED",
  "FVG_HOLD_CONFIRMED",
  "FVG_ADDON_SIGNAL_SHADOW",
  "EXIT_EXECUTED",
  "EXIT_REJECTED",
  "MANAGED_POSITION_CLOSED",
  "DEMO_GUARD_BLOCK",
  "UNMANAGED_POSITION_PRESENT",
  "UNEXPECTED_ADDITIONAL_POSITION",
  "CYCLE_ERROR",
]);

fs.mkdirSync(path.dirname(statePath), { recursive: true });
if (!fs.existsSync(journalPath)) fs.writeFileSync(journalPath, "", "utf8");
let state = loadState();

if (sendTest) {
  await sendHtml([
    "🧪 <b>XAUUSD AI MASTER · TELEGRAM TEST</b>",
    "",
    `📊 <b>${esc(symbol)}</b> · Phase 7B DEMO`,
    "✅ Kết nối Telegram thành công",
    "🔒 Notifier chỉ đọc journal, không có quyền đặt lệnh",
  ].join("\n"));
  console.log("PHASE7B_TELEGRAM_TEST=PASS");
  process.exit(0);
}

if (!state.initialized) {
  state = {
    version: 1,
    initialized: true,
    offset: replayExisting ? 0 : fs.statSync(journalPath).size,
    sent: 0,
    lastEventAt: null,
  };
  saveState();
  if (sendStartup) {
    await sendHtml([
      "🤖 <b>XAUUSD AI MASTER · TELEGRAM ONLINE</b>",
      "",
      `📊 <b>${esc(symbol)}</b> · Phase 7B DEMO`,
      "🟢 Đang chờ tín hiệu Pattern + MA trên M15",
      "🧩 FVG: xác nhận bổ sung, không bắt buộc entry",
      "🔒 Read-only journal notifier · không điều khiển MT5",
    ].join("\n"));
  }
}

console.log("PHASE7B_TELEGRAM_NOTIFIER=RUNNING");
console.log(`PHASE7B_TELEGRAM_JOURNAL=${journalPath}`);
console.log(`PHASE7B_TELEGRAM_STATE=${statePath}`);
console.log(`PHASE7B_TELEGRAM_INTERVAL_MS=${intervalMs}`);
console.log("PHASE7B_TELEGRAM_ORDER_PERMISSION=NONE_READ_ONLY_JOURNAL");

while (true) {
  try {
    await poll();
  } catch (error) {
    console.error(`PHASE7B_TELEGRAM_ERROR=${errorMessage(error)}`);
  }
  if (once) break;
  await sleep(intervalMs);
}

async function poll() {
  const stat = fs.statSync(journalPath);
  if (stat.size < state.offset) {
    state.offset = 0;
    saveState();
  }
  if (stat.size === state.offset) return;

  const fd = fs.openSync(journalPath, "r");
  try {
    const length = stat.size - state.offset;
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, state.offset);
    const lastNewline = buffer.lastIndexOf(0x0a);
    if (lastNewline < 0) return;

    const complete = buffer.subarray(0, lastNewline + 1);
    const lines = complete.toString("utf8").split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      const type = String(event.type ?? "");
      if (!interestingEvents.has(type)) continue;
      const html = formatEvent(event);
      if (!html) continue;
      await sendHtml(html);
      state.sent += 1;
      state.lastEventAt = String(event.timestamp ?? new Date().toISOString());
      saveState();
    }
    state.offset += lastNewline + 1;
    saveState();
  } finally {
    fs.closeSync(fd);
  }
}

function formatEvent(event) {
  const type = String(event.type ?? "");
  const time = telegramTime(event.timestamp);

  if (type === "ENTRY_SUBMIT") {
    const side = String(event.side ?? "?");
    return card(side === "BUY" ? "🟢" : "🔴", `${side} SIGNAL · ${symbol}`, [
      line("⏱", "M15", time),
      line("🧠", "Pattern", event.pattern),
      line("🎯", "Giá tham chiếu", event.marketEntry ?? event.signalEntry),
      line("🛡", "SL", event.stopLoss),
      line("📦", "Volume", event.volume),
      line("🧩", "FVG", event.fvgConfirmedAtEntry ? "CONFIRMED" : "OPTIONAL / NO CONFIRM"),
      "",
      "<b>Trạng thái:</b> đang gửi lệnh DEMO…",
    ]);
  }

  if (type === "ENTRY_FILLED") {
    const position = event.position ?? {};
    const side = position.side === "LONG" ? "BUY" : position.side === "SHORT" ? "SELL" : "TRADE";
    return card(side === "BUY" ? "✅🟢" : "✅🔴", `${side} FILLED · ${symbol}`, [
      line("🎫", "Ticket", position.ticket),
      line("💵", "Entry", position.entry ?? event.fillPrice),
      line("📦", "Volume", position.volume),
      line("🛡", "SL", position.stopLoss),
      line("🧩", "FVG tại entry", event.fvgConfirmedAtEntry ? "YES" : "NO · entry vẫn hợp lệ"),
      "",
      "<b>Quản lý:</b> +6 → BE · +10 → close 1/3 · runner M15 structure",
    ]);
  }

  if (type === "ENTRY_REJECTED" || type === "ENTRY_ACCEPTED_POSITION_NOT_RESOLVED") {
    return card("⚠️", `ENTRY WARNING · ${symbol}`, [
      line("📝", "Sự kiện", type),
      line("💬", "Message", event.message ?? "Position chưa resolve"),
      line("🔢", "Retcode", event.retcode),
    ]);
  }

  if (type === "PLUS6_SL_TO_ENTRY") {
    return card("🛡", `+6 · SL → ENTRY`, [
      line("🎫", "Ticket", event.ticket),
      line("📈", "Favorable", event.favorable),
      line("🔒", "SL mới", event.stopLoss),
      "",
      "✅ Rủi ro ban đầu đã được đưa về hòa vốn theo rule.",
    ]);
  }

  if (type === "PLUS10_PARTIAL_ONE_THIRD") {
    return card("💰", `+10 · CHỐT 1/3`, [
      line("🎫", "Ticket", event.ticket),
      line("📈", "Favorable", event.favorable),
      line("📤", "Đã đóng", event.closedVolume),
      line("📦", "Còn lại", event.remainingVolume),
      "",
      "🏃 Runner tiếp tục theo cấu trúc swing M15.",
    ]);
  }

  if (type === "STRUCTURAL_SL_TIGHTEN") {
    return card("🔒", `RUNNER · STRUCTURE TRAIL`, [
      line("🎫", "Ticket", event.ticket),
      line("🛡", "SL mới", event.stopLoss),
      line("⏱", "M15 close", telegramTimeMs(event.m15CloseTime)),
    ]);
  }

  if (type === "FVG_HOLD_CONFIRMED") {
    return card("🧩", `FVG CONFIRM · HOLD`, [
      line("🎫", "Ticket", event.ticket),
      line("↕️", "Side", event.side),
      line("📈", "Favorable", event.favorable),
      line("📐", "MA20 / 50 / 200", `${value(event.ma20)} / ${value(event.ma50)} / ${value(event.ma200)}`),
      "",
      "✅ FVG cùng hướng xác nhận tiếp tục HOLD.",
    ]);
  }

  if (type === "FVG_ADDON_SIGNAL_SHADOW") {
    return card("👀", `ADD-ON SIGNAL · SHADOW ONLY`, [
      line("🎫", "Ticket", event.ticket),
      line("↕️", "Side", event.side),
      line("📈", "Favorable", event.favorable),
      line("📦", "Reference volume", event.referenceVolume),
      "",
      "⚠️ <b>KHÔNG mở thêm lot.</b> Chỉ ghi nhận tín hiệu add-on để nghiên cứu.",
    ]);
  }

  if (type === "EXIT_EXECUTED") {
    return card("🏁", `EXIT EXECUTED · ${symbol}`, [
      line("🎫", "Ticket", event.ticket),
      line("📤", "Volume", event.volume),
      line("🧠", "Lý do", event.reason),
      "",
      "✅ Position Phase 7B đã được đóng.",
    ]);
  }

  if (type === "MANAGED_POSITION_CLOSED") {
    return card("🏁", `POSITION CLOSED · ${symbol}`, [
      line("🎫", "Ticket", event.ticket),
      "ℹ️ Bot xác nhận position được quản lý không còn mở trên MT5.",
    ]);
  }

  if (["DEMO_GUARD_BLOCK", "UNMANAGED_POSITION_PRESENT", "UNEXPECTED_ADDITIONAL_POSITION", "CYCLE_ERROR"].includes(type)) {
    return card("🚨", `PHASE 7B SYSTEM ALERT`, [
      line("📝", "Sự kiện", type),
      line("💬", "Chi tiết", event.message ?? event.reason ?? "Kiểm tra web System / journal"),
      "",
      "🔒 Bot giữ nguyên nguyên tắc fail-closed trên DEMO.",
    ]);
  }

  if (type.endsWith("_REJECTED")) {
    return card("⚠️", `PHASE 7B ACTION REJECTED`, [
      line("📝", "Sự kiện", type),
      line("🎫", "Ticket", event.ticket),
      line("💬", "Chi tiết", event.message ?? event.response?.message ?? "Xem journal để audit"),
    ]);
  }

  return null;
}

function card(icon, title, lines) {
  return [
    `${icon} <b>${esc(title)}</b>`,
    "<code>PHASE 7B · DEMO ONLY</code>",
    "",
    ...lines,
  ].join("\n");
}

function line(icon, label, raw) {
  return `${icon} <b>${esc(label)}:</b> <code>${esc(value(raw))}</code>`;
}

async function sendHtml(text) {
  const payload = {
    chat_id: chatId,
    text: text.slice(0, 4096),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(messageThreadId === null ? {} : { message_thread_id: messageThreadId }),
    ...(monitorUrl ? {
      reply_markup: {
        inline_keyboard: [[{ text: "📊 Mở Phase 7B Monitor", url: monitorUrl }]],
      },
    } : {}),
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Telegram sendMessage ${response.status}: ${body}`);
    const parsed = JSON.parse(body);
    if (!parsed.ok) throw new Error(`Telegram sendMessage failed: ${body}`);
  } finally {
    clearTimeout(timeout);
  }
}

function loadState() {
  if (!fs.existsSync(statePath)) return { version: 1, initialized: false, offset: 0, sent: 0, lastEventAt: null };
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8").replace(/^\uFEFF/, ""));
    return {
      version: 1,
      initialized: Boolean(parsed.initialized),
      offset: Number.isFinite(parsed.offset) ? parsed.offset : 0,
      sent: Number.isFinite(parsed.sent) ? parsed.sent : 0,
      lastEventAt: parsed.lastEventAt ?? null,
    };
  } catch {
    return { version: 1, initialized: false, offset: 0, sent: 0, lastEventAt: null };
  }
}

function saveState() {
  const temp = `${statePath}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  fs.renameSync(temp, statePath);
}

function value(raw) {
  if (raw === null || raw === undefined || raw === "") return "—";
  if (typeof raw === "number") return Number.isInteger(raw) ? String(raw) : String(Math.round(raw * 100000) / 100000);
  if (typeof raw === "object") return JSON.stringify(raw);
  return String(raw);
}

function telegramTime(raw) {
  if (!raw) return "—";
  const timestamp = Date.parse(String(raw));
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : String(raw);
}
function telegramTimeMs(raw) {
  const timestamp = Number(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "—";
}
function esc(raw) {
  return String(raw ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function optionalNumber(raw) {
  if (!raw?.trim()) return null;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error("ZIQ_TELEGRAM_MESSAGE_THREAD_ID must be an integer when provided.");
  return value;
}
function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env ${name}`);
  return value;
}
function errorMessage(error) { return error instanceof Error ? error.message : String(error); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
