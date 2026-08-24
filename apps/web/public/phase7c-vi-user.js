(() => {
  "use strict";

  // Lớp Việt hóa cuối cùng chỉ tác động phần hiển thị. Không đổi giá trị máy/API.
  const exact = new Map([
    ["Bot Trend", "bot Trend"],
    ["BOT TREND", "bot Trend"],
    ["Trend Bot", "bot Trend"],
    ["Bot Sideway", "bot Sideway"],
    ["BOT SIDEWAY", "bot Sideway"],
    ["Sideway Bot", "bot Sideway"],
    ["FINAL", "BẢN HOÀN THIỆN"],
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
    ["READ ONLY", "CHỈ ĐỌC"],
    ["Order none", "Không có quyền đặt lệnh"],
    ["ORDER NONE", "KHÔNG CÓ QUYỀN ĐẶT LỆNH"],
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

  function translate(value) {
    if (!value || typeof value !== "string") return value;
    const trimmed = value.trim();
    if (exact.has(trimmed)) return value.replace(trimmed, exact.get(trimmed));
    let out = value;
    for (const [pattern, replacement] of phrases) out = out.replace(pattern, replacement);
    return out;
  }

  function translateElement(element) {
    if (!(element instanceof Element)) return;
    for (const attribute of ["title", "placeholder", "aria-label", "alt"]) {
      if (!element.hasAttribute(attribute)) continue;
      const before = element.getAttribute(attribute) || "";
      const after = translate(before);
      if (after !== before) element.setAttribute(attribute, after);
    }
  }

  function scan(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (node.parentElement && ["SCRIPT", "STYLE", "CODE", "PRE"].includes(node.parentElement.tagName)) continue;
      const before = node.nodeValue || "";
      const after = translate(before);
      if (after !== before) node.nodeValue = after;
    }
    if (root instanceof Element) translateElement(root);
    if (root.querySelectorAll) root.querySelectorAll("*").forEach(translateElement);
  }

  function run() {
    document.documentElement.lang = "vi";
    scan(document.body || document.documentElement);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        const node = mutation.target;
        const before = node.nodeValue || "";
        const after = translate(before);
        if (after !== before) node.nodeValue = after;
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          const before = node.nodeValue || "";
          const after = translate(before);
          if (after !== before) node.nodeValue = after;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          scan(node);
        }
      }
    }
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
