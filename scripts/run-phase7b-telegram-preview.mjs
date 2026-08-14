const token = requiredEnv("ZIQ_TELEGRAM_BOT_TOKEN");
const chatId = requiredEnv("ZIQ_TELEGRAM_CHAT_ID");
const symbol = process.env.ZIQ_TELEGRAM_SYMBOL ?? "XAUUSD";
const messageThreadId = optionalNumber(process.env.ZIQ_TELEGRAM_MESSAGE_THREAD_ID);
const monitorUrl = process.env.ZIQ_TELEGRAM_MONITOR_URL?.trim() ?? "";
const delayMs = Math.max(250, Number(process.env.ZIQ_TELEGRAM_PREVIEW_DELAY_MS ?? "650"));

const previewTag = "🧪 <b>PREVIEW · KHÔNG PHẢI LỆNH THẬT</b>";

const messages = [
  [
    previewTag,
    "",
    `🟢 <b>BUY SIGNAL · ${esc(symbol)}</b>`,
    "<code>PHASE 7B · DEMO ONLY</code>",
    "",
    line("🧠", "Pattern", "ENGULFING"),
    line("🎯", "Entry", "4324.15"),
    line("🛡", "SL", "4316.15 · −8.00 giá"),
    line("📦", "Volume", "0.03 lot"),
    line("🧩", "FVG", "OPTIONAL"),
  ].join("\n"),

  [
    previewTag,
    "",
    `✅🟢 <b>BUY FILLED · ${esc(symbol)}</b>`,
    "<code>PHASE 7B · DEMO ONLY</code>",
    "",
    line("💵", "Entry", "4324.20"),
    line("📦", "Volume", "0.03 lot"),
    line("🛡", "SL", "4316.20 · −8.00 giá"),
    "",
    "<b>Rule:</b> +6 → BE · +10 → chốt 1/3 · runner swing M15",
  ].join("\n"),

  compact("🛡", "🟢", "BUY · +6 → BE", [
    "📈 <b>Hiện:</b> <code>+6.15 giá</code> · 💵 <code>+$18.45</code>",
    "🔒 <b>SL:</b> <code>4324.20</code> · khóa <code>+0.00 giá</code> · <code>$0.00</code>",
  ]),

  compact("💰", "🟢", "BUY · CHỐT 1/3", [
    "📈 <b>Chốt tại:</b> <code>+10.10 giá</code> · <b>Lãi:</b> <code>≈ +$10.10</code>",
    "📤 <b>Đóng:</b> <code>0.01 lot</code> · còn <code>0.02 lot</code>",
    "🛡 <b>SL:</b> <code>4324.20</code> · khóa <code>+0.00 giá</code> · <code>$0.00</code>",
    "💵 <b>P&L runner:</b> <code>+$20.20</code>",
  ]),

  compact("🧩", "🟢", "BUY · HOLD", [
    "📈 <b>Hiện:</b> <code>+12.40 giá</code> · 💵 <code>+$24.80</code>",
    "🛡 <b>SL khóa:</b> <code>+0.00 giá</code> · <code>$0.00</code>",
    "✅ FVG cùng hướng · tiếp tục giữ.",
  ]),

  compact("🔒", "🟢", "BUY · TRAIL SL", [
    "🛡 <b>SL mới:</b> <code>4330.80</code> · khóa <code>+6.60 giá</code> · <code>≈ +$13.20</code>",
    "📈 <b>Hiện:</b> <code>+14.50 giá</code> · 💵 <code>+$29.00</code>",
  ]),

  compact("🏁", "🟢", "BUY · CHỐT LỆNH", [
    "💵 <b>P&L tổng:</b> <code>+$39.10</code>",
    "📈 <b>Biến động TB:</b> <code>+13.03 giá</code>",
    "🎯 <b>Exit TB:</b> <code>4337.23</code>",
    "🧠 <b>Lý do:</b> đóng M15 phá MA20",
  ]),

  [
    previewTag,
    "",
    `🔴 <b>SELL SIGNAL · ${esc(symbol)}</b>`,
    "<code>PHASE 7B · DEMO ONLY</code>",
    "",
    line("🧠", "Pattern", "TWO_CANDLE_BODY_DOMINANCE"),
    line("🎯", "Entry", "4312.60"),
    line("🛡", "SL", "4320.60 · −8.00 giá"),
    line("📦", "Volume", "0.03 lot"),
    line("🧩", "FVG", "CONFIRMED"),
  ].join("\n"),

  [
    previewTag,
    "",
    `✅🔴 <b>SELL FILLED · ${esc(symbol)}</b>`,
    "<code>PHASE 7B · DEMO ONLY</code>",
    "",
    line("💵", "Entry", "4312.55"),
    line("📦", "Volume", "0.03 lot"),
    line("🛡", "SL", "4320.55 · −8.00 giá"),
    "",
    "<b>Rule:</b> +6 → BE · +10 → chốt 1/3 · runner swing M15",
  ].join("\n"),

  compact("💰", "🔴", "SELL · CHỐT 1/3", [
    "📈 <b>Chốt tại:</b> <code>+10.30 giá</code> · <b>Lãi:</b> <code>≈ +$10.30</code>",
    "📤 <b>Đóng:</b> <code>0.01 lot</code> · còn <code>0.02 lot</code>",
    "🛡 <b>SL:</b> <code>4312.55</code> · khóa <code>+0.00 giá</code> · <code>$0.00</code>",
    "💵 <b>P&L runner:</b> <code>+$20.60</code>",
  ]),

  compact("🏁", "🔴", "SELL · CHỐT LỆNH", [
    "💵 <b>P&L tổng:</b> <code>+$38.75</code>",
    "📈 <b>Biến động TB:</b> <code>+12.92 giá</code>",
    "🎯 <b>Exit TB:</b> <code>4299.63</code>",
    "🧠 <b>Lý do:</b> FVG ngược hướng + rejection sau +10",
  ]),

  compact("🛑", "🔴", "SELL · CLOSED / STOP", [
    "💵 <b>P&L tổng:</b> <code>−$24.00</code>",
    "📉 <b>Biến động TB:</b> <code>−8.00 giá</code>",
    "🎯 <b>Exit:</b> <code>4320.55</code>",
    "🧠 <b>Lý do:</b> STOPLOSS",
  ]),

  [
    previewTag,
    "",
    "⚠️ <b>ACTION REJECTED</b>",
    "<code>Broker từ chối sửa SL · bot giữ fail-closed</code>",
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

function compact(icon, sideMarker, title, lines) {
  return [
    previewTag,
    "",
    `${icon} ${sideMarker} <b>${esc(title)}</b>`,
    "<code>PHASE 7B · DEMO</code>",
    ...lines,
  ].join("\n");
}

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
