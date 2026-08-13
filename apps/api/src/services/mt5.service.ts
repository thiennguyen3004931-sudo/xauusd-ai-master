import {
  defaultMt5BrokerConfig,
  HttpMt5Transport,
  Mt5BridgeClient,
  Mt5BrokerConfigValidator,
  type Mt5BridgeHealth,
  type Mt5BridgePosition,
  type Mt5BridgeQuote,
  type Mt5BridgeSymbolSpec,
  type Mt5BrokerConfig,
} from "@xauusd/mt5-broker";
import type {
  DashboardServiceStatus,
  DashboardTradingMode,
} from "../types/dashboard";

export interface Mt5TelemetrySnapshot {
  enabled: boolean;
  configured: boolean;
  reachable: boolean;
  status: DashboardServiceStatus;
  message: string;
  latencyMs: number | null;
  bridgeBaseUrl: string;
  health: Omit<Mt5BridgeHealth, "accountLogin"> | null;
  quote: Mt5BridgeQuote | null;
  spec: Mt5BridgeSymbolSpec | null;
  positions: Mt5BridgePosition[];
  checkedAt: number;
}

interface CachedClient {
  signature: string;
  client: Mt5BridgeClient;
}

let cachedClient: CachedClient | null = null;

function readBoolean(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw.trim().toLowerCase() === "true";
}

function readPositiveInteger(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? fallback);
  return Number.isInteger(raw) && raw > 0 ? raw : fallback;
}

function bridgeBaseUrl(): string {
  return (process.env.MT5_BRIDGE_BASE_URL ?? "http://127.0.0.1:8765").trim();
}

function createConfig(): Mt5BrokerConfig {
  return {
    ...defaultMt5BrokerConfig,
    bridgeBaseUrl: bridgeBaseUrl(),
    apiKey: (process.env.MT5_BRIDGE_API_KEY ?? "").trim(),
    requestTimeoutMs: readPositiveInteger("MT5_BRIDGE_REQUEST_TIMEOUT_MS", 3_000),
    healthTimeoutMs: readPositiveInteger("MT5_BRIDGE_HEALTH_TIMEOUT_MS", 1_500),
    retryAttempts: 0,
    requireTradingEnabled: false,
  };
}

function getClient(config: Mt5BrokerConfig): Mt5BridgeClient {
  const signature = [
    config.bridgeBaseUrl,
    config.apiKey,
    config.requestTimeoutMs,
    config.healthTimeoutMs,
  ].join("|");

  if (cachedClient?.signature === signature) {
    return cachedClient.client;
  }

  new Mt5BrokerConfigValidator().validate(config);
  const transport = new HttpMt5Transport(config);
  const client = new Mt5BridgeClient(transport, config.healthTimeoutMs);
  cachedClient = { signature, client };
  return client;
}

function sanitizeHealth(
  health: Mt5BridgeHealth,
): Omit<Mt5BridgeHealth, "accountLogin"> {
  const { accountLogin: _accountLogin, ...safe } = health;
  return safe;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "MT5 bridge request failed.";
}

export async function getMt5Telemetry(
  symbol = "XAUUSD",
): Promise<Mt5TelemetrySnapshot> {
  const checkedAt = Date.now();
  const enabled = readBoolean("MT5_BRIDGE_ENABLED", false);
  const baseUrl = bridgeBaseUrl();

  if (!enabled) {
    return {
      enabled: false,
      configured: false,
      reachable: false,
      status: "DEGRADED",
      message: "MT5 telemetry integration is disabled in apps/api.",
      latencyMs: null,
      bridgeBaseUrl: baseUrl,
      health: null,
      quote: null,
      spec: null,
      positions: [],
      checkedAt,
    };
  }

  const config = createConfig();
  if (!config.apiKey) {
    return {
      enabled: true,
      configured: false,
      reachable: false,
      status: "OFFLINE",
      message: "MT5_BRIDGE_API_KEY is not configured for apps/api.",
      latencyMs: null,
      bridgeBaseUrl: baseUrl,
      health: null,
      quote: null,
      spec: null,
      positions: [],
      checkedAt,
    };
  }

  const start = performance.now();

  try {
    const client = getClient(config);
    const health = await client.health();

    if (!health.connected) {
      return {
        enabled: true,
        configured: true,
        reachable: false,
        status: "OFFLINE",
        message: health.lastError || "MT5 bridge reports disconnected terminal.",
        latencyMs: Math.max(0, Math.round(performance.now() - start)),
        bridgeBaseUrl: baseUrl,
        health: sanitizeHealth(health),
        quote: null,
        spec: null,
        positions: [],
        checkedAt,
      };
    }

    const [quote, spec, positions] = await Promise.all([
      client.quote(symbol),
      client.symbolSpec(symbol),
      client.openPositions(symbol),
    ]);

    let status: DashboardServiceStatus = "HEALTHY";
    let message = `MT5 ${health.accountMode ?? "unknown"} connected · ${positions.length} ${symbol} position(s).`;

    if (health.accountMode === "real") {
      status = "DEGRADED";
      message = "REAL account detected. Phase 7B DEMO must not execute on this account; apps/api remains telemetry-only.";
    } else if (health.accountMode === "contest") {
      status = "DEGRADED";
      message = "Contest account detected. Phase 7B requires accountMode=demo.";
    } else if (health.accountMode === "demo" && health.tradingEnabled) {
      status = "HEALTHY";
      message = `MT5 demo connected · Bridge trading enabled for the separate Phase 7B controller · apps/api remains read-only · ${positions.length} ${symbol} position(s).`;
    } else if (health.accountMode === "demo") {
      status = "DEGRADED";
      message = "MT5 demo connected but Bridge trading is disabled; Phase 7B cannot auto-execute until its dedicated bridge is armed.";
    }

    return {
      enabled: true,
      configured: true,
      reachable: true,
      status,
      message,
      latencyMs: Math.max(0, Math.round(performance.now() - start)),
      bridgeBaseUrl: baseUrl,
      health: sanitizeHealth(health),
      quote,
      spec,
      positions,
      checkedAt,
    };
  } catch (error) {
    return {
      enabled: true,
      configured: true,
      reachable: false,
      status: "OFFLINE",
      message: errorMessage(error),
      latencyMs: Math.max(0, Math.round(performance.now() - start)),
      bridgeBaseUrl: baseUrl,
      health: null,
      quote: null,
      spec: null,
      positions: [],
      checkedAt,
    };
  }
}

export async function getMt5SystemService(
  controlMode: DashboardTradingMode,
  checkedAt = Date.now(),
) {
  const telemetry = await getMt5Telemetry("XAUUSD");

  let message = telemetry.message;
  if (telemetry.reachable && telemetry.health) {
    if (controlMode === "SHADOW") {
      message = `Legacy SHADOW control · ${telemetry.message}`;
    } else if (controlMode === "DEMO") {
      message = `Legacy DEMO control selected · ${telemetry.message}`;
    }
  }

  return {
    id: "execution",
    name: "Execution / MT5",
    status: telemetry.status,
    latencyMs: telemetry.latencyMs,
    message,
    checkedAt,
  } as const;
}
