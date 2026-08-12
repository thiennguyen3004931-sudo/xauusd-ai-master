import type {
  BacktestResultDto,
  BacktestRunRequest,
  DashboardSnapshot,
  Mt5TelemetrySnapshot,
  TradingMode,
} from "./types";
import type { Mt5PerformanceSnapshot } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function read<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export async function getDashboard(): Promise<DashboardSnapshot> {
  return read<DashboardSnapshot>(
    await fetch(`${API_BASE}/api/v1/dashboard`, { cache: "no-store" }),
  );
}

export async function getMt5Telemetry(
  symbol = "XAUUSD",
): Promise<Mt5TelemetrySnapshot> {
  const response = await fetch(
    `${API_BASE}/api/v1/mt5/status?symbol=${encodeURIComponent(symbol)}`,
    { cache: "no-store" },
  );

  const payload = (await response.json()) as Mt5TelemetrySnapshot;

  // The API intentionally returns HTTP 503 when MT5 is offline.
  // Preserve that telemetry payload so the Dashboard can render OFFLINE
  // rather than hiding the useful diagnostic state behind a generic error.
  if (
    payload &&
    typeof payload === "object" &&
    typeof payload.enabled === "boolean" &&
    typeof payload.reachable === "boolean" &&
    typeof payload.status === "string"
  ) {
    return payload;
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return payload;
}

export async function setTradingMode(
  mode: Exclude<TradingMode, "LIVE_LOCKED">,
): Promise<DashboardSnapshot["control"]> {
  return read<DashboardSnapshot["control"]>(
    await fetch(`${API_BASE}/api/v1/control/mode`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode }),
    }),
  );
}

export async function runBacktest(
  input: BacktestRunRequest,
): Promise<BacktestResultDto> {
  return read<BacktestResultDto>(
    await fetch(`${API_BASE}/api/v1/backtest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}
export async function getMt5Performance(
  days = 90,
): Promise<Mt5PerformanceSnapshot> {
  return read<Mt5PerformanceSnapshot>(
    await fetch(
      `${API_BASE}/api/v1/mt5/performance?symbol=XAUUSD&days=${days}`,
      { cache: "no-store" },
    ),
  );
}