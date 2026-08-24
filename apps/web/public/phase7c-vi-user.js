(() => {
  "use strict";

  // Final presentation-only Vietnamese normalization. Machine/API values remain unchanged.
  const exact = new Map([
    ["Bot Trend", "bot Trend"],
    ["BOT TREND", "bot Trend"],
    ["Trend Bot", "bot Trend"],
    ["Bot Sideway", "bot Sideway"],
    ["BOT SIDEWAY", "bot Sideway"],
    ["Sideway Bot", "bot Sideway"],
    ["FINAL", "Bản hoàn thiện"],
    ["Mode", "Chế độ"],
    ["Effective", "Đang áp dụng"],
    ["Recommended", "Khuyến nghị"],
    ["Stage", "Giai đoạn"],
    ["Strategy", "Chiến lược"],
    ["Side", "Hướng lệnh"],
    ["Entry", "Điểm vào lệnh"],
    ["Stoploss", "Cắt lỗ"],
    ["Stop Loss", "Cắt lỗ"],
    ["Risk", "Rủi ro"],
    ["Read only", "Chỉ đọc"],
    ["READ ONLY", "Chỉ đọc"],
    ["Order none", "Không có quyền đặt lệnh"],
    ["ORDER NONE", "Không có quyền đặt lệnh"],
    ["RỦI RO percent", "Tỷ lệ rủi ro"],
    ["RỦI RO PERCENT", "Tỷ lệ rủi ro"],
    ["MT5 CHO PHÉP GIAO DỊCH", "MT5 cho phép giao dịch"],
  ]);

  const phrases = [
    [/\bBot Trend\b/g, "bot Trend"],
    [/\bBOT TREND\b/g, "bot Trend"],
    [/\bTrend Bot\b/g, "bot Trend"],
    [/\bBot Sideway\b/g, "bot Sideway"],
    [/\bBOT SIDEWAY\b/g, "bot Sideway"],
    [/\bSideway Bot\b/g, "bot Sideway"],
    [/\bPhase 7C\b/g, "Giai đoạn 7C"],
    [/\bRead[- ]?only\b/gi, "chỉ đọc"],
    [/\bOrder permission\b/gi, "quyền đặt lệnh"],
    [/\bOrder none\b/gi, "không có quyền đặt lệnh"],
    [/\bNew positions only\b/gi, "chỉ áp dụng cho vị thế mới"],
    [/\bBreak even\b/gi, "hòa vốn"],
    [/\bPartial\b/gi, "chốt một phần"],
    [/\bFixed lot\b/gi, "khối lượng cố định"],
    [/\bFinal lot\b/gi, "khối lượng cuối cùng"],
    [/\bMax lot\b/gi, "khối lượng tối đa"],
    [/\bRisk percent\b/gi, "tỷ lệ rủi ro"],
    [/RỦI RO\s+percent/gi, "Tỷ lệ rủi ro"],
    [/\bCurrent price\b/gi, "giá hiện tại"],
    [/\bOpen positions?\b/gi, "vị thế đang mở"],
    [/\bEntry reason\b/gi, "lý do vào lệnh"],
    [/\bHold reason\b/gi, "lý do giữ lệnh"],
    [/\bExit reason\b/gi, "lý do đóng lệnh"],
    [/\bDecision reason\b/gi, "lý do quyết định"],
    [/\bSystem status\b/gi, "trạng thái hệ thống"],
    [/\bBot status\b/gi, "trạng thái bot"],
    [/\bAccount mode\b/gi, "chế độ tài khoản"],
    [/\bActive mode\b/gi, "chế độ hiện tại"],
    [/\bEffective strategy\b/gi, "chiến lược đang áp dụng"],
    [/\bRecommended mode\b/gi, "chế độ được khuyến nghị"],
    [/\bMarket regime\b/gi, "trạng thái thị trường"],
    [/\bConfidence\b/gi, "độ tin cậy"],
    [/\bLoading\b/gi, "đang tải"],
    [/\bRefresh\b/gi, "làm mới"],
    [/\bConnected\b/gi, "đã kết nối"],
    [/\bDisconnected\b/gi, "mất kết nối"],
  ];

  const technicalTerms = [
    "XAUUSD",
    "MT5",
    "M15",
    "M5",
    "FVG",
    "AI",
    "AUTO",
    "PAUSE",
    "DEMO",
    "LIVE",
    "SL",
    "TP",
    "API",
    "PnL",
  ];

  function protectTechnicalTerms(value) {
    const replacements = [];
    let out = value;
    for (const term of technicalTerms) {
      const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
      out = out.replace(pattern, () => {
        const token = `§${replacements.length}§`;
        replacements.push([token, term === "PnL" ? "PnL" : term.toUpperCase()]);
        return token;
      });
    }
    return { out, replacements };
  }

  function restoreTechnicalTerms(value, replacements) {
    let out = value;
    for (const [token, term] of replacements) out = out.split(token).join(term);
    return out;
  }

  function normalizeAllCapsVietnamese(value) {
    const trimmed = value.trim();
    if (!trimmed || !/[^\x00-\x7F]/u.test(trimmed)) return value;

    const uppercaseLetters = trimmed.match(/\p{Lu}/gu) || [];
    const lowercaseLetters = trimmed.match(/\p{Ll}/gu) || [];
    if (uppercaseLetters.length < 2 || lowercaseLetters.length > 0) return value;

    const { out: protectedValue, replacements } = protectTechnicalTerms(trimmed);
    let normalized = protectedValue.toLocaleLowerCase("vi-VN");
    normalized = normalized.replace(/\p{L}/u, (char) => char.toLocaleUpperCase("vi-VN"));
    normalized = restoreTechnicalTerms(normalized, replacements);
    return value.replace(trimmed, normalized);
  }

  function translate(value) {
    if (!value || typeof value !== "string") return value;
    const trimmed = value.trim();
    let out = exact.has(trimmed) ? value.replace(trimmed, exact.get(trimmed)) : value;
    for (const [pattern, replacement] of phrases) out = out.replace(pattern, replacement);
    out = out
      .replace(/\bbot\s+trend\b/gi, "bot Trend")
      .replace(/\bbot\s+sideway\b/gi, "bot Sideway");
    return normalizeAllCapsVietnamese(out);
  }

  function shouldSkip(node) {
    const parent = node.parentElement;
    if (!parent) return true;
    return Boolean(parent.closest("script,style,code,pre,textarea,[data-no-vi-localize]"));
  }

  function translateElement(element) {
    if (!(element instanceof Element)) return;
    if (element.matches("script,style,code,pre,textarea,[data-no-vi-localize]")) return;
    for (const attribute of ["title", "placeholder", "aria-label", "alt"]) {
      if (!element.hasAttribute(attribute)) continue;
      const before = element.getAttribute(attribute) || "";
      const after = translate(before);
      if (after !== before) element.setAttribute(attribute, after);
    }
  }

  function translateTextNode(node) {
    if (shouldSkip(node)) return;
    const before = node.nodeValue || "";
    const after = translate(before);
    if (after !== before) node.nodeValue = after;
  }

  function scan(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) translateTextNode(node);
    if (root instanceof Element) translateElement(root);
    if (root.querySelectorAll) root.querySelectorAll("*").forEach(translateElement);
  }

  function run() {
    document.documentElement.lang = "vi";
    scan(document.body || document.documentElement);
  }

  let queued = false;
  const observer = new MutationObserver((mutations) => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          translateTextNode(mutation.target);
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
          else if (node.nodeType === Node.ELEMENT_NODE) scan(node);
        }
      }
    });
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      run();
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }, { once: true });
  } else {
    run();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
})();
