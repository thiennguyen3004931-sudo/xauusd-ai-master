export type Phase7CPanelStatus = Record<string, string>;

const PANEL_STATUS_PROXY_URL = "/api/v1/phase7c/decision-monitor/mt5?symbol=XAUUSD";
const PANEL_STATUS_DIRECT_URL = "http://127.0.0.1:3711/api/v1/phase7c/decision-monitor/mt5?symbol=XAUUSD";

function friendlyHttpMessage(status: number, source: string) {
  if (status === 502) return `${source} chưa phản hồi (HTTP 502). Trang sẽ thử nguồn trực tiếp.`;
  if (status === 503) return `${source} đang khởi động lại (HTTP 503). Trang sẽ tự thử lại.`;
  if (status === 504) return `${source} phản hồi quá thời gian (HTTP 504). Trang sẽ tự thử lại.`;
  return `${source} trả HTTP ${status}.`;
}

export function parsePanelStatus(text: string): Phase7CPanelStatus {
  const result: Phase7CPanelStatus = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    const key = line.slice(0, equals).trim();
    const value = line.slice(equals + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

async function requestPanelStatus(url: string, source: string): Promise<Phase7CPanelStatus> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { accept: "text/plain" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(friendlyHttpMessage(response.status, source));
  if (!text.trim()) throw new Error(`${source} trả dữ liệu rỗng. Trang sẽ tự thử lại.`);
  const payload = parsePanelStatus(text);
  if (payload.version !== "1") {
    throw new Error(`${source} trả payload chưa hợp lệ. Trang sẽ tự thử lại.`);
  }
  payload.__source = source;
  return payload;
}

export async function fetchPhase7CPanelStatus(): Promise<Phase7CPanelStatus> {
  try {
    return await requestPanelStatus(PANEL_STATUS_PROXY_URL, "Web proxy");
  } catch (proxyError) {
    try {
      return await requestPanelStatus(PANEL_STATUS_DIRECT_URL, "Decision Monitor trực tiếp");
    } catch (directError) {
      const proxyMessage = proxyError instanceof Error ? proxyError.message : "Web proxy lỗi không xác định.";
      const directMessage = directError instanceof Error ? directError.message : "Decision Monitor trực tiếp lỗi không xác định.";
      throw new Error(`${proxyMessage} ${directMessage}`);
    }
  }
}

export function raw(status: Phase7CPanelStatus | undefined, key: string) {
  return status?.[key]?.trim() ?? "";
}

export function clean(value: unknown, fallback = "Tạm thời chưa có dữ liệu") {
  const text = value === null || value === undefined ? "" : String(value).trim();
  if (!text || text === "n/a" || text === "N/A" || text === "null" || text === "undefined") return fallback;
  if (text === "true") return "Có";
  if (text === "false") return "Chưa";
  return text;
}

export function value(status: Phase7CPanelStatus | undefined, key: string, fallback = "Tạm thời chưa có dữ liệu") {
  return clean(raw(status, key), fallback);
}

export function shortValue(status: Phase7CPanelStatus | undefined, key: string) {
  return value(status, key, "Đang chờ dữ liệu");
}

export function modeDisplay(status: Phase7CPanelStatus | undefined) {
  const active = value(status, "activeMode", "Đang chờ dữ liệu");
  const effective = value(status, "effectiveStrategy", "Đang chờ dữ liệu");
  if (active !== "Đang chờ dữ liệu" && effective !== "Đang chờ dữ liệu" && active !== effective) return `${active} → ${effective}`;
  return active;
}

export function compactReason(input: string, fallback: string) {
  let text = clean(input, fallback);
  text = text
    .replaceAll("A confirmed CHOCH indicates a possible structural reversal.", "CHOCH xác nhận khả năng đảo chiều.")
    .replaceAll("Bollinger bandwidth is", "Bollinger bandwidth:")
    .replaceAll("panel does not have order permission", "panel chỉ đọc, không gửi lệnh")
    .replaceAll("panel không có quyền gửi lệnh", "panel chỉ đọc, không gửi lệnh")
    .replaceAll("No valid setup", "Chưa có setup hợp lệ")
    .replaceAll(" · ", "\n")
    .replaceAll(" | ", "\n")
    .replaceAll(" • ", "\n")
    .replaceAll("•", "\n")
    .replaceAll(". Bollinger", "\nBollinger");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export function stageTone(stage: string): "success" | "warning" | "error" | "default" {
  if (["READY", "APPROVED", "MANAGING"].includes(stage)) return "success";
  if (["BLOCKED", "PAUSE", "WAITING", "WAIT_SIGNAL"].includes(stage)) return "warning";
  if (["ERROR", "FAIL", "OFFLINE"].includes(stage)) return "error";
  return "default";
}
