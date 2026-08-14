const token = requiredEnv("ZIQ_TELEGRAM_BOT_TOKEN");
const chatId = requiredEnv("ZIQ_TELEGRAM_CHAT_ID");
const symbol = process.env.ZIQ_TELEGRAM_SYMBOL ?? "XAUUSD";
const messageThreadId = optionalNumber(process.env.ZIQ_TELEGRAM_MESSAGE_THREAD_ID);
const monitorUrl = process.env.ZIQ_TELEGRAM_MONITOR_URL?.trim() ?? "";
const delayMs = Math.max(250, Number(process.env.ZIQ_TELEGRAM_PREVIEW_DELAY_MS ?? "650"));

const previewTag = "🧪 <b>PREVIEW · KHÔNG PHẢI LỆNH THẬT</b>";
const ticketBuy = "PREVIEW-BUY-270713";
const ticketSell = "PREVIEW-SELL-270714";

const messages = [
  [
    previewTag,
    "",
    `🟢 <b>BUY SIGNAL · ${esc(symbol)}</b>`,
    "<code>PHASE 7B · DEMO ONLY</code>",
    "",
    line("⏱", "M15", "14/08/2026 10:15"),
    line("🧠", "Pattern", "ENGULFING"),
    line("📐", "Trend", "MA20 > MA50 > MA200"),
    line("🎯", "Giá tham chiếu", "4324.15"),
    line("🛡", "SL", "4316.15"),
    line("📦", "Volume", "0.03"),
    line("🧩", "FVG", "OPTIONAL / NO CONFIRM"),
    "",
    "<b>Trạng thái:</b> đang gửi lệnh BUY DEMO…",
  ].join("\n"),

  [
    previewTag,
    "",
    `✅🟢 <b>BUY FILLED · ${esc(symbol)}</b>`,
    "<code>PHASE 7B · DEMO ONLY</code>",
    "",
    line("🎫", "Ticket", ticketBuy),
    line("💵", "Entry", "4324.20"),
    line("📦", "Volume", "0.03"),
    line("🛡", "SL", "4316.20"),
    line("🧩", "FVG tại entry", "NO · entry vẫn hợp lệ"),
    "",
    "<b>Quản lý:</b> +6 → BE · +10 → close 1/3 · runner theo swing M15",
  ].join("\n"),

  [
    previewTag,
    "",
    "🛡 <b>+6 · SL → ENTRY</b>",
    "<code>PHASE 7B · DEMO ONLY</code>",
    "",
    line("🎫", "Ticket", ticketBuy),
    line("📈", "Favorable", "+6.00 giá"),
    line("🔒", "SL mới", "4324.20"),
    "",
    "✅ Rủi ro ban đầu đã được đưa về hòa vốn theo rule.",
  ].join("\n"),

  [
    previewTag,
    "",
    "💰 <b>+10 · CHỐT 1/3</b>",
    "<code>PHASE 7B · DEMO ONLY</code>",
    "",
    line("🎫", "Ticket", ticketBuy),
    line("📈", "Favorable", "+10.00 giá"),
    line("📤", "Đã đóng", "0.01 lot"),
    line("📦", "Còn lại", "0.02 lot"),
    "",
    "🏃 Runner tiếp tục theo cấu trúc swing M15.",
  ].join("\n"),

  [
    previewTag,
    "",
    "🧩 <b>FVG CONFIRM · HOLD</b>",
    "<code>PHASE 7B · DEMO ONLY</code>",
    "",
    line("🎫", "Ticket", ticketBuy),
    line("↕️", "Side", "BUY"),
    line("📈", "Favorable", "+12.40 giá"),
    line("📐", "MA20 / 50 / 200", "4331.20 / 4318.60 / 4295.10"),
    "",
    "✅ FVG cùng hướng xác nhận tiếp tục HOLD.",
  ].join("\n"),

  [
    previewTag,
    "",
    "🔒 <b>RUNNER · STRUCTURE TRAIL</b>",
    "<code>PHASE 7B · DEMO ONLY</code>",
    "",
    line("🎫", "Ticket", ticketBuy),
    line("🛡", "SL mới", "4330.80"),
    line("⏱", "M15 close", "14/08/2026 11:00"),
    "",
    "📌 Stop chỉ được siết chặt theo swing M15 đã xác nhận.",
  ].join("\n"),

  [
    previewTag,
    "",
    `🏁 <b>EXIT EXECUTED · ${esc(symbol)}</b>`,
    "<code>PHASE 7B · DEMO ONLY</code>",
    "",
    line("🎫", "Ticket", ticketBuy),
    line("📤", "Volume", "0.02 lot"),
    line("💵", "Exit", "4338.70"),
    line("🧠", "Lý do", "MA20 REVERSAL / RUNNER EXIT"),
    "",
    "✅ Position BUY Phase 7B đã được đóng.",
  ].join("\n"),

  [
    previewTag,
    "",
    `🔴 <b>SELL SIGNAL · ${esc(symbol)}</b>`,
    "<code>PHASE 7B · DEMO ONLY</code>",
    "",
    line("⏱", "M15", "14/08/2026 13:30"),
    line("🧠", "Pattern", "TWO_CANDLE_BODY_DOMINANCE"),
    line("📐", "Trend", "MA20 < MA50 < MA200"),
    line("🎯", "Giá tham chiếu", "4312.60"),
    line("🛡", "SL", "4320.60"),
    line("📦", "Volume", "0.03"),
    line("🧩", "FVG", "CONFIRMED"),
    "",
    "<b>Trạng thái:</b> đang gửi lệnh SELL DEMO…",
  ].join("\n"),

  [
    previewTag,
    "",
    `✅🔴 <b>SELL FILLED · ${esc(symbol)}</b>`,
    "<code>PHASE 7B · DEMO ONLY</code>",
    "",
    line("🎫", "Ticket", ticketSell),
    line("💵", "Entry", "4312.55"),
    line("📦", "Volume", "0.03"),
    line("🛡", "SL", "4320.55"),
    line("🧩", "FVG tại entry", "YES"),
    "",
    "<b>Quản lý:</b> +6 → BE · +10 → close 1/3 · runner theo swing M15",
  ].join("\n"),

  [
    previewTag,
    "",
    `🏁 <b>REVERSAL EXIT · ${esc(symbol)}</b>`,
    "<code>PHASE 7B · DEMO ONLY</code>",
    "",
    line("🎫", "Ticket", ticketSell),
    line("📤", "Volume", "0.02 lot"),
    line("💵", "Exit", "4298.40"),
    line("🧩", "Tín hiệu đảo chiều", "Opposing M15 FVG + rejection sau +10"),
    "",
    "✅ Runner SELL đã đóng theo rule reversal exit.",
  ].join("\n"),

  [
    previewTag,
    "",
    "⚠️ <b>PHASE 7B ACTION REJECTED</b>",
    "<code>PHASE 7B · DEMO ONLY</code>",
    "",
    line("📝", "Sự kiện", "PLUS6_SL_REJECTED"),
    line("🎫", "Ticket", "PREVIEW-ERROR-001"),
    line("💬", "Chi tiết", "Broker bridge từ chối sửa SL — bot giữ fail-closed và ghi audit"),
    "",
    "🚨 Đây là mẫu cảnh báo khi một hành động quản lý lệnh không thực hiện được.",
  ].join("\n"),
];

console.log(`PHASE7B_TELEGRAM_PREVIEW_COUNT=${messages.length}`);
console.log("PHASE7B_TELEGRAM_PREVIEW_ORDER_PERMISSION=NONE");
console.log("PHASE7B_TELEGRAM_PREVIEW_JOURNAL_MUTATION=false");
console.log("PHASE7B_TELEGRAM_PREVIEW_MT5_MUTATION=false");

for (let index = 0; index < messages.length; index += 1) {
  await sendHtml(messages[index]);
  console.log(`PHASE7B_TELEGRAM_PREVIEW_SENT=${index + 1}/${messages.length}`);
  if (index < messages.length - 1) await sleep(delayMs);
}

console.log("PHASE7B_TELEGRAM_PREVIEW=PASS");

function line(icon, label, raw) {
  return `${icon} <b>${esc(label)}:</b> <code>${esc(raw)}</code>`;
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

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env ${name}`);
  return value;
}

function optionalNumber(raw) {
  if (!raw?.trim()) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function esc(raw) {
  return String(raw ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
