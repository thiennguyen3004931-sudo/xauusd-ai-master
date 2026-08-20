export interface Mt5BridgeHealth {
  status: "ok" | "degraded";
  connected: boolean;
  tradingEnabled: boolean;
  terminalTradeAllowed: boolean;
  expertTradeAllowed: boolean;
  accountLogin?: number;
  accountMode?: "demo" | "contest" | "real";
  accountBalance?: number;
  accountEquity?: number;
  accountMargin?: number;
  accountFreeMargin?: number;
  accountProfit?: number;
  accountLeverage?: number;
  accountCurrency?: string;
  server?: string;
  terminalVersion?: string;
  lastError?: string;
  reconnectCount?: number;
  lastReconnectAt?: number;
  reconnecting?: boolean;
  timestamp: number;
}
