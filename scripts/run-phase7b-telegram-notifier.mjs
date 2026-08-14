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
const monitorApiBase = (process.env.ZIQ_TELEGRAM_MONITOR_API_URL?.trim() || "http://127.0.0.1:3711").replace(/\/$/, "");
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
    "🔒 Notifier chỉ đọc journal/API monitor, không có quyền đặt lệnh",
  ].join("\n"));
  console.log("PHASE7B_TELEGRAM_TEST=PASS");
  process.exit(0);
}

if (!state.initialized) {
  state = {
    version: 2,
    initialized: true,
    offset: replayExisting ? 0 : fs.statSync(journalPath).size,
    sent: 0,
    lastEventAt: null,
    trade: null,
  };
  saveState();
  if (sendStartup) {
    await sendHtml([
      "🤖 <b>XAUUSD AI MASTER · TELEGRAM ONLINE</b>",
      "",
      `📊 <b>${esc(symbol)}</b> · Phase 7B DEMO`,
      "🟢 Đang chờ tín hiệu Pattern + MA trên M15",
      "🧩 FVG: xác nhận bổ sung, không bắt buộc entry",
      "🔒 Read-only notifier · không điều khiển MT5",
    ].join("\n"));
  }
}

console.log("PHASE7B_TELEGRAM_NOTIFIER=RUNNING");
console.log(`PHASE7B_TELEGRAM_JOURNAL=${journalPath}`);
console.log(`PHASE7B_TELEGRAM_STATE=${statePath}`);
console.log(`PHASE7B_TELEGRAM_INTERVAL_MS=${intervalMs}`);
console.log(`PHASE7B_TELEGRAM_MONITOR_API=${monitorApiBase}`);
console.log("PHASE7B_TELEGRAM_ORDER_PERMISSION=NONE_READ_ONLY_JOURNAL_AND_MONITOR");

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
    for (const rawLine of lines) {
      let event;
      try {
        event = JSON.parse(rawLine);
      } catch {
        continue;
      }
      const type = String(event.type ?? "");
      if (!interestingEvents.has(type)) continue;

      const enrichment = await buildEnrichment(event);
      const html = await formatEvent(event, enrichment);
      if (!html) continue;
      await sendHtml(html);
      applyEventState(event, enrichment);
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

async function buildEnrichment(event) {
  const type = String(event.type ?? "");
  const needsLive = [
    "PLUS6_SL_TO_ENTRY",
    "PLUS10_PARTIAL_ONE_THIRD",
    "STRUCTURAL_SL_TIGHTEN",
    "FVG_HOLD_CONFIRMED",
    "FVG_ADDON_SIGNAL_SHADOW",
  ].includes(type);

  const live = needsLive ? await getDemoSnapshot() : null;
  const metrics = live ? liveMetrics(live, event) : fallbackMetrics(event);

  let closedTrade = null;
  if (type === "EXIT_EXECUTED" || type === "MANAGED_POSITION_CLOSED") {
    closedTrade = await findClosedTradeWithRetry(event);
  }

  let partialPnlEstimate = null;
  if (type === "PLUS10_PARTIAL_ONE_THIRD") {
    partialPnlEstimate = estimatePnlFromPriceMove(
      numberOrNull(event.favorable),
      numberOrNull(event.closedVolume),
      live?.mt5?.spec,
    );
  }

  return { live, metrics, closedTrade, partialPnlEstimate };
}

async function formatEvent(event, enrichment) {
  const type = String(event.type ?? "");
  const time = telegramTime(event.timestamp);

  if (type === "ENTRY_SUBMIT") {
    const side = normalizeSide(event.side);
    return fullCard(sideIcon(side), `${side} SIGNAL · ${symbol}`, [
      line("⏱", "M15", time),
      line("🧠", "Pattern", event.pattern),
      line("🎯", "Entry", event.marketEntry ?? event.signalEntry),
      line("🛡", "SL", `${fmtPrice(event.stopLoss)} · ${fmtSignedPrice(-Math.abs(Number(event.stopDistance ?? 0)))} giá`),
      line("📦", "Volume", `${value(event.volume)} lot`),
      line("🧩", "FVG", event.fvgConfirmedAtEntry ? "CONFIRMED" : "OPTIONAL"),
    ]);
  }

  if (type === "ENTRY_FILLED") {
    const position = event.position ?? {};
    const side = position.side === "LONG" ? "BUY" : position.side === "SHORT" ? "SELL" : normalizeSide(event.side);
    const entry = numberOrNull(position.entry ?? event.fillPrice);
    const sl = numberOrNull(position.stopLoss);
    const slDistance = entry !== null && sl !== null ? sidePriceMove(side, entry, sl) : null;
    return fullCard(side === "BUY" ? "✅🟢" : "✅🔴", `${side} FILLED · ${symbol}`, [
      line("💵", "Entry", fmtPrice(entry)),
      line("📦", "Volume", `${value(position.volume)} lot`),
      line("🛡", "SL", `${fmtPrice(sl)} · ${fmtSignedPrice(slDistance)} giá`),
      line("🧩", "FVG", event.fvgConfirmedAtEntry ? "YES" : "NO · vẫn hợp lệ"),
      "",
      "<b>Rule:</b> +6 → BE · +10 → chốt 1/3 · runner swing M15",
    ]);
  }

  if (type === "PLUS6_SL_TO_ENTRY") {
    const side = currentSide(event, enrichment);
    const m = enrichment.metrics;
    return compactTradeCard("🛡", side, "+6 → BE", [
      compactStats(m),
      `🔒 <b>SL:</b> <code>${fmtPrice(m.stopLoss)}</code> · khóa <code>${fmtSignedPrice(m.slPriceMove)} giá</code> · <code>${fmtMoney(m.lockedPnlUsd, true)}</code>`,
    ]);
  }

  if (type === "PLUS10_PARTIAL_ONE_THIRD") {
    const side = currentSide(event, enrichment);
    const m = enrichment.metrics;
    const partial = enrichment.partialPnlEstimate;
    return compactTradeCard("💰", side, "CHỐT 1/3", [
      `📈 <b>Chốt tại:</b> <code>${fmtSignedPrice(numberOrNull(event.favorable))} giá</code> · <b>Lãi:</b> <code>${fmtMoney(partial, true, true)}</code>`,
      `📤 <b>Đóng:</b> <code>${value(event.closedVolume)} lot</code> · còn <code>${value(event.remainingVolume)} lot</code>`,
      `🛡 <b>SL:</b> <code>${fmtPrice(m.stopLoss)}</code> · khóa <code>${fmtSignedPrice(m.slPriceMove)} giá</code> · <code>${fmtMoney(m.lockedPnlUsd, true)}</code>`,
      m.profitUsd === null ? "" : `💵 <b>P&L runner:</b> <code>${fmtMoney(m.profitUsd, true)}</code>`,
    ].filter(Boolean));
  }

  if (type === "FVG_HOLD_CONFIRMED") {
    const side = currentSide(event, enrichment);
    const m = enrichment.metrics;
    return compactTradeCard("🧩", side, "HOLD", [
      compactStats(m),
      `🛡 <b>SL khóa:</b> <code>${fmtSignedPrice(m.slPriceMove)} giá</code> · <code>${fmtMoney(m.lockedPnlUsd, true)}</code>`,
      "✅ FVG cùng hướng · tiếp tục giữ.",
    ]);
  }

  if (type === "STRUCTURAL_SL_TIGHTEN") {
    const side = currentSide(event, enrichment);
    const m = enrichment.metrics;
    return compactTradeCard("🔒", side, "TRAIL SL", [
      `🛡 <b>SL mới:</b> <code>${fmtPrice(m.stopLoss)}</code> · khóa <code>${fmtSignedPrice(m.slPriceMove)} giá</code> · <code>${fmtMoney(m.lockedPnlUsd, true)}</code>`,
      compactStats(m),
    ]);
  }

  if (type === "FVG_ADDON_SIGNAL_SHADOW") {
    const side = currentSide(event, enrichment);
    const m = enrichment.metrics;
    return compactTradeCard("👀", side, "ADD-ON SHADOW", [
      compactStats(m),
      "⚠️ Chỉ ghi nhận tín hiệu · <b>không mở thêm lot</b>.",
    ]);
  }

  if (type === "EXIT_EXECUTED" || type === "MANAGED_POSITION_CLOSED") {
    const closed = enrichment.closedTrade;
    const side = normalizeSide(closed?.side ?? state.trade?.side ?? event.side);
    const pnl = numberOrNull(closed?.netPnl);
    const averageMove = closed ? sidePriceMove(side, Number(closed.entry), Number(closed.exit)) : null;
    const reason = type === "EXIT_EXECUTED" ? event.reason : "MT5 / SL đóng position";
    const icon = pnl !== null && pnl < 0 ? "🛑" : "🏁";
    return compactTradeCard(icon, side, pnl !== null && pnl < 0 ? "CLOSED / STOP" : "CHỐT LỆNH", [
      closed ? `💵 <b>P&L tổng:</b> <code>${fmtMoney(pnl, true)}</code>` : "💵 <b>P&L:</b> <code>đang đồng bộ MT5</code>",
      closed ? `📈 <b>Biến động TB:</b> <code>${fmtSignedPrice(averageMove)} giá</code>` : "",
      closed ? `🎯 <b>Exit TB:</b> <code>${fmtPrice(closed.exit)}</code>` : "",
      `🧠 <b>Lý do:</b> ${esc(reasonLabel(reason))}`,
    ].filter(Boolean));
  }

  if (type === "ENTRY_REJECTED" || type === "ENTRY_ACCEPTED_POSITION_NOT_RESOLVED") {
    return warningCard("⚠️ ENTRY", event.message ?? "Position chưa resolve", event.retcode);
  }

  if (type.endsWith("_REJECTED")) {
    return warningCard("⚠️ ACTION REJECTED", event.message ?? event.response?.message ?? type, event.response?.retcode ?? event.retcode);
  }

  if (["DEMO_GUARD_BLOCK", "UNMANAGED_POSITION_PRESENT", "UNEXPECTED_ADDITIONAL_POSITION", "CYCLE_ERROR"].includes(type)) {
    return warningCard("🚨 SYSTEM", event.message ?? event.reason ?? type, null);
  }

  return null;
}

function applyEventState(event, enrichment) {
  const type = String(event.type ?? "");
  if (type === "ENTRY_FILLED") {
    const position = event.position ?? {};
    const side = position.side === "LONG" ? "BUY" : position.side === "SHORT" ? "SELL" : normalizeSide(event.side);
    state.trade = {
      ticket: String(position.ticket ?? event.ticket ?? ""),
      side,
      entry: numberOrNull(position.entry ?? event.fillPrice),
      initialVolume: numberOrNull(position.volume),
      remainingVolume: numberOrNull(position.volume),
      stopLoss: numberOrNull(position.stopLoss),
      openedAt: Date.parse(String(event.timestamp ?? new Date().toISOString())),
      realizedPnlEstimate: 0,
    };
    return;
  }

  if (!state.trade) return;

  if (type === "PLUS6_SL_TO_ENTRY" || type === "STRUCTURAL_SL_TIGHTEN") {
    const stop = numberOrNull(event.stopLoss ?? enrichment.metrics?.stopLoss);
    if (stop !== null) state.trade.stopLoss = stop;
  }

  if (type === "PLUS10_PARTIAL_ONE_THIRD") {
    state.trade.remainingVolume = numberOrNull(event.remainingVolume) ?? state.trade.remainingVolume;
    if (enrichment.partialPnlEstimate !== null) {
      state.trade.realizedPnlEstimate = Number(state.trade.realizedPnlEstimate ?? 0) + enrichment.partialPnlEstimate;
    }
  }

  if (type === "EXIT_EXECUTED" || type === "MANAGED_POSITION_CLOSED") {
    state.trade = null;
  }
}

function currentSide(event, enrichment) {
  return normalizeSide(
    enrichment.live?.state?.managed?.side ??
    state.trade?.side ??
    event.side,
  );
}

function liveMetrics(snapshot, event) {
  const managed = snapshot?.mt5?.managedPosition ?? null;
  const managedState = snapshot?.state?.managed ?? null;
  const side = normalizeSide(managedState?.side ?? state.trade?.side ?? event.side);
  const entry = numberOrNull(managed?.entry ?? managedState?.entry ?? state.trade?.entry);
  const quote = snapshot?.mt5?.quote ?? null;
  const market = side === "BUY" ? numberOrNull(quote?.bid) : numberOrNull(quote?.ask);
  const stopLoss = numberOrNull(managed?.stopLoss ?? managedState?.lastStructuralStop ?? event.stopLoss ?? state.trade?.stopLoss);
  const volume = numberOrNull(managed?.volume ?? managedState?.expectedRemainingVolume ?? state.trade?.remainingVolume);
  const priceMove = entry !== null && market !== null ? sidePriceMove(side, entry, market) : numberOrNull(event.favorable);
  const slPriceMove = entry !== null && stopLoss !== null ? sidePriceMove(side, entry, stopLoss) : null;
  const lockedPnlUsd = estimatePnlFromPriceMove(slPriceMove, volume, snapshot?.mt5?.spec);
  return {
    side,
    entry,
    market,
    stopLoss,
    volume,
    priceMove,
    slPriceMove,
    profitUsd: numberOrNull(managed?.profit),
    lockedPnlUsd,
  };
}

function fallbackMetrics(event) {
  const side = normalizeSide(state.trade?.side ?? event.side);
  const entry = numberOrNull(state.trade?.entry);
  const stopLoss = numberOrNull(event.stopLoss ?? state.trade?.stopLoss);
  return {
    side,
    entry,
    market: null,
    stopLoss,
    volume: numberOrNull(state.trade?.remainingVolume),
    priceMove: numberOrNull(event.favorable),
    slPriceMove: entry !== null && stopLoss !== null ? sidePriceMove(side, entry, stopLoss) : null,
    profitUsd: null,
    lockedPnlUsd: null,
  };
}

async function getDemoSnapshot() {
  return fetchJson(`${monitorApiBase}/api/v1/phase7b-demo`, 1800).catch(() => null);
}

async function findClosedTradeWithRetry(event) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const performance = await fetchJson(`${monitorApiBase}/api/v1/mt5/performance?symbol=${encodeURIComponent(symbol)}&days=7`, 3000).catch(() => null);
    const trade = matchClosedTrade(performance?.trades ?? [], event);
    if (trade) return trade;
    if (attempt < 3) await sleep(650);
  }
  return null;
}

function matchClosedTrade(trades, event) {
  if (!Array.isArray(trades) || trades.length === 0) return null;
  const ticket = String(event.ticket ?? state.trade?.ticket ?? "");
  const side = normalizeSide(state.trade?.side ?? event.side);
  const eventAt = Date.parse(String(event.timestamp ?? new Date().toISOString()));

  const exact = ticket
    ? trades.find((trade) => String(trade.id ?? "").endsWith(ticket) && trade.ownership === "SYSTEM")
    : null;
  if (exact) return exact;

  return trades.find((trade) =>
    trade.ownership === "SYSTEM" &&
    normalizeSide(trade.side) === side &&
    Math.abs(Number(trade.closedAt ?? 0) - eventAt) <= 10 * 60_000,
  ) ?? null;
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function compactStats(metrics) {
  const move = metrics?.priceMove === null || metrics?.priceMove === undefined ? "—" : fmtSignedPrice(metrics.priceMove);
  const pnl = metrics?.profitUsd === null || metrics?.profitUsd === undefined ? "—" : fmtMoney(metrics.profitUsd, true);
  return `📈 <b>Hiện:</b> <code>${move} giá</code> · 💵 <code>${pnl}</code>`;
}

function compactTradeCard(icon, side, action, lines) {
  const sideMarker = side === "BUY" ? "🟢" : "🔴";
  return [
    `${icon} ${sideMarker} <b>${esc(side)} · ${esc(action)}</b>`,
    "<code>PHASE 7B · DEMO</code>",
    ...lines,
  ].join("\n");
}

function fullCard(icon, title, lines) {
  return [
    `${icon} <b>${esc(title)}</b>`,
    "<code>PHASE 7B · DEMO ONLY</code>",
    "",
    ...lines,
  ].join("\n");
}

function warningCard(title, message, retcode) {
  return [
    `⚠️ <b>${esc(title)}</b>`,
    `<code>${esc(String(message ?? "Kiểm tra journal"))}</code>`,
    retcode === null || retcode === undefined ? "" : `Retcode: <code>${esc(value(retcode))}</code>`,
  ].filter(Boolean).join("\n");
}

function line(icon, label, raw) {
  return `${icon} <b>${esc(label)}:</b> <code>${esc(value(raw))}</code>`;
}

async function sendHtml(text) {
  const highContrastText = String(text)
    .replaceAll("<code>", "<b>")
    .replaceAll("</code>", "</b>");
  const payload = {
    chat_id: chatId,
    text: highContrastText.slice(0, 4096),
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
  const blank = { version: 2, initialized: false, offset: 0, sent: 0, lastEventAt: null, trade: null };
  if (!fs.existsSync(statePath)) return blank;
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8").replace(/^\uFEFF/, ""));
    return {
      version: 2,
      initialized: Boolean(parsed.initialized),
      offset: Number.isFinite(parsed.offset) ? parsed.offset : 0,
      sent: Number.isFinite(parsed.sent) ? parsed.sent : 0,
      lastEventAt: parsed.lastEventAt ?? null,
      trade: parsed.trade && typeof parsed.trade === "object" ? parsed.trade : null,
    };
  } catch {
    return blank;
  }
}

function saveState() {
  const temp = `${statePath}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  fs.renameSync(temp, statePath);
}

function estimatePnlFromPriceMove(priceMove, volume, spec) {
  const move = numberOrNull(priceMove);
  const lots = numberOrNull(volume);
  const tickSize = numberOrNull(spec?.tickSize);
  const tickValue = numberOrNull(spec?.effectiveTickValuePerLot);
  if (move === null || lots === null || tickSize === null || tickValue === null || tickSize <= 0) return null;
  return move / tickSize * tickValue * lots;
}

function sidePriceMove(side, entry, price) {
  if (![entry, price].every(Number.isFinite)) return null;
  return side === "SELL" ? entry - price : price - entry;
}

function normalizeSide(raw) {
  const value = String(raw ?? state.trade?.side ?? "BUY").toUpperCase();
  return value === "SELL" || value === "SHORT" ? "SELL" : "BUY";
}

function sideIcon(side) {
  return side === "BUY" ? "🟢" : "🔴";
}

function fmtPrice(raw) {
  const number = numberOrNull(raw);
  return number === null ? "—" : number.toFixed(2);
}

function fmtSignedPrice(raw) {
  const number = numberOrNull(raw);
  if (number === null) return "—";
  const sign = number > 0 ? "+" : number < 0 ? "−" : "";
  return `${sign}${Math.abs(number).toFixed(2)}`;
}

function fmtMoney(raw, signed = false, approximate = false) {
  const number = numberOrNull(raw);
  if (number === null) return "—";
  const sign = signed ? (number > 0 ? "+" : number < 0 ? "−" : "") : "";
  return `${approximate ? "≈ " : ""}${sign}$${Math.abs(number).toFixed(2)}`;
}

function reasonLabel(raw) {
  const value = String(raw ?? "UNKNOWN");
  if (value === "REVERSAL_FVG_REJECTION") return "FVG ngược hướng + rejection sau +10";
  if (value === "TREND_MA20") return "đóng M15 phá MA20";
  return value.replaceAll("_", " ");
}

function numberOrNull(raw) {
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
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

function esc(raw) {
  return String(raw ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function optionalNumber(raw) {
  if (!raw?.trim()) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) throw new Error("ZIQ_TELEGRAM_MESSAGE_THREAD_ID must be an integer when provided.");
  return parsed;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env ${name}`);
  return value;
}

function errorMessage(error) { return error instanceof Error ? error.message : String(error); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
