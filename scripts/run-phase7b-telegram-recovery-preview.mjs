import fs from "node:fs";
import path from "node:path";

const envFile = path.resolve(process.argv[2] || ".env.phase7b-telegram");
if (!fs.existsSync(envFile)) throw new Error(`Telegram env file not found: ${envFile}`);

for (const raw of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const index = line.indexOf("=");
  const name = line.slice(0, index).trim().replace(/^\uFEFF/, "");
  const value = line.slice(index + 1).trim().replace(/^['\"]|['\"]$/g, "");
  if (name && process.env[name] === undefined) process.env[name] = value;
}

const token = requiredEnv("ZIQ_TELEGRAM_BOT_TOKEN");
const chatId = requiredEnv("ZIQ_TELEGRAM_CHAT_ID");
const symbol = process.env.ZIQ_TELEGRAM_SYMBOL?.trim() || "XAUUSD";
const messageThreadId = optionalNumber(process.env.ZIQ_TELEGRAM_MESSAGE_THREAD_ID);
const monitorUrl = process.env.ZIQ_TELEGRAM_MONITOR_URL?.trim() || "";
const previewTag = "🧪 <b>PREVIEW · KHÔNG PHẢI LỆNH THẬT</b>";

const entry = 4330.20;
const stopLoss = 4322.20;
const recoveryTarget = 4337.70;
const recoveryMove = recoveryTarget - entry;
const dailyPnlBefore = -20.00;
const estimatedTradePnl = 22.50;

const messages = [
  [
    previewTag,
    "",
    `🟢 <b>MUA ${esc(symbol)} · HỒI PHỤC NGÀY</b>`,
    "<b>PHASE 7B · DEMO ONLY</b>",
    "",
    `💵 Giá vào: <b>${entry.toFixed(2)}</b>`,
    `🛡 SL thực tế: <b>${stopLoss.toFixed(2)}</b> · −${Math.abs(entry - stopLoss).toFixed(2)} giá`,
    `🎯 TP hồi phục: <b>${recoveryTarget.toFixed(2)}</b> · +${recoveryMove.toFixed(2)} giá · <b>CHỐT TOÀN BỘ</b>`,
    "📦 Khối lượng: <b>0.03 lot</b>",
    "",
    `📉 P&L ngày trước lệnh: <b>−$${Math.abs(dailyPnlBefore).toFixed(2)}</b>`,
    "🎯 Mục tiêu: đưa kết quả ngày trở lại vùng dương theo mức hồi phục đã tính.",
    "",
    "📝 <b>Lý do vào lệnh:</b>",
    "• Mô hình nến hợp lệ hướng MUA.",
    "• Supertrend M15 = MUA.",
    "• Supertrend M5 = MUA.",
    "• SL cấu trúc hợp lệ 8.00 giá.",
    "• Chế độ quản lý = HỒI PHỤC NGÀY.",
    "",
    "⚠️ Ngày hồi phục: không áp dụng +10 chốt 1/3.",
    "✅ Đạt TP hồi phục → chốt TOÀN BỘ vị thế.",
  ].join("\n"),
  [
    previewTag,
    "",
    "🏁 🟢 <b>MUA · CHỐT LỜI HỒI PHỤC NGÀY</b>",
    "<b>PHASE 7B · DEMO ONLY</b>",
    "",
    `📈 Chốt: <b>+${recoveryMove.toFixed(2)} giá</b>`,
    `💰 Lãi lệnh: <b>≈ +$${estimatedTradePnl.toFixed(2)}</b>`,
    "📤 Đóng: <b>0.03 lot · TOÀN BỘ</b>",
    "",
    `💵 Giá vào: <b>${entry.toFixed(2)}</b>`,
    `🎯 Giá thoát: <b>${recoveryTarget.toFixed(2)}</b>`,
    "",
    "🧠 Lý do: <b>TP hồi phục ngày</b>",
    "✅ Mục tiêu hồi phục đã đạt.",
  ].join("\n"),
];

console.log(`PHASE7B_TELEGRAM_RECOVERY_PREVIEW_COUNT=${messages.length}`);
console.log("PHASE7B_TELEGRAM_RECOVERY_PREVIEW_ORDER_PERMISSION=NONE");
console.log("PHASE7B_TELEGRAM_RECOVERY_PREVIEW_JOURNAL_MUTATION=false");
console.log("PHASE7B_TELEGRAM_RECOVERY_PREVIEW_MT5_MUTATION=false");

for (let index = 0; index < messages.length; index += 1) {
  await sendHtml(messages[index]);
  console.log(`PHASE7B_TELEGRAM_RECOVERY_PREVIEW_SENT=${index + 1}/${messages.length}`);
  if (index < messages.length - 1) await sleep(650);
}

console.log("PHASE7B_TELEGRAM_RECOVERY_PREVIEW=PASS");

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
