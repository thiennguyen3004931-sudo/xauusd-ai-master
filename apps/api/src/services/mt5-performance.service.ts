import {
  defaultMt5BrokerConfig,
  type Mt5BridgeDeal,
} from "@xauusd/mt5-broker";
import { getMt5DealHistory } from "./mt5-market.service";
import { getMt5Telemetry } from "./mt5.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_RECOMMENDATION_SAMPLE = 30;

export interface Mt5PerformanceMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  winRatePercent: number;
  profitFactor: number | null;
  expectancy: number;
  averageWin: number;
  averageLoss: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  maxConsecutiveLosses: number;
}

export interface Mt5PerformanceTrade {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  ownership: "SYSTEM" | "VALIDATION" | "OTHER";
  strategy: "TREND" | "SIDEWAY" | "OTHER";
  openedAt: number;
  closedAt: number;
  durationMinutes: number;
  volume: number;
  entry: number;
  exit: number;
  netPnl: number;
  session: string;
  brokerHour: number;
  weekday: string;
  exitReason: "UNKNOWN";
}

export interface Mt5PerformanceBucket {
  key: string;
  label: string;
  totalTrades: number;
  netPnl: number;
  winRatePercent: number;
  profitFactor: number | null;
}

export interface Mt5PerformanceRecommendation {
  severity: "INFO" | "WATCH" | "ACTION";
  title: string;
  evidence: string;
  suggestion: string;
  autoApply: false;
}

export interface Mt5PerformanceSnapshot {
  source: "MT5_ACCOUNT_READ_ONLY";
  symbol: string;
  currency: string;
  days: number;
  generatedAt: number;
  account: {
    accountMode: "DEMO" | "LIVE";
    brokerMode: "demo" | "real";
    login: number | null;
    server: string | null;
  };
  safety: {
    accountMode: "DEMO" | "LIVE";
    bridgeTradingEnabled: boolean;
    readOnly: true;
    strategyAutoChange: false;
    liveUnlockAvailable: false;
  };
  accountWide: {
    metrics: Mt5PerformanceMetrics;
    equityCurve: Array<{
      timestamp: number;
      balance: number;
      drawdownPercent: number;
    }>;
  };
  systemOwned: {
    metrics: Mt5PerformanceMetrics;
    minimumRecommendationSample: number;
    sampleReady: boolean;
    recent20: Mt5PerformanceMetrics | null;
    previous20: Mt5PerformanceMetrics | null;
  };
  trades: Mt5PerformanceTrade[];
  breakdown: {
    strategy: Mt5PerformanceBucket[];
    side: Mt5PerformanceBucket[];
    session: Mt5PerformanceBucket[];
    weekday: Mt5PerformanceBucket[];
    hour: Mt5PerformanceBucket[];
    ownership: Mt5PerformanceBucket[];
  };
  recommendations: Mt5PerformanceRecommendation[];
  notes: string[];
}

const WEEKDAYS = [
  "Chủ nhật",
  "Thứ 2",
  "Thứ 3",
  "Thứ 4",
  "Thứ 5",
  "Thứ 6",
  "Thứ 7",
] as const;

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function validationComment(comment: string): boolean {
  const value = comment.toLowerCase();
  return value.includes("gate2") || value.includes("gate3");
}

function strategyOf(
  opening: Mt5BridgeDeal,
  trendMagic: number,
  sidewayMagic: number,
): Mt5PerformanceTrade["strategy"] {
  const magic = Number(opening.magic);

  if (magic === sidewayMagic) return "SIDEWAY";
  if (magic === trendMagic) return "TREND";

  const comment = String(opening.comment ?? "").toLowerCase();
  if (comment.includes("phase7c-sideway") || comment.includes("p7c-sideway")) return "SIDEWAY";
  if (comment.includes("phase7b-demo") || comment.includes("p7b-")) return "TREND";
  return "OTHER";
}

function ownershipOf(
  opening: Mt5BridgeDeal,
  trendMagic: number,
  sidewayMagic: number,
): Mt5PerformanceTrade["ownership"] {
  if (validationComment(opening.comment ?? "")) return "VALIDATION";
  return strategyOf(opening, trendMagic, sidewayMagic) === "OTHER" ? "OTHER" : "SYSTEM";
}

function sessionFromHour(hour: number): string {
  if (hour >= 0 && hour < 8) return "ASIAN";
  if (hour >= 8 && hour < 13) return "LONDON";
  if (hour >= 13 && hour < 17) return "OVERLAP";
  if (hour >= 17 && hour < 22) return "NEW_YORK";
  return "CLOSED";
}

function reconstructTrades(
  deals: readonly Mt5BridgeDeal[],
  trendMagic: number,
  sidewayMagic: number,
): Mt5PerformanceTrade[] {
  const groups = new Map<string, Mt5BridgeDeal[]>();

  for (const deal of deals) {
    if (!deal.isTradingDeal || !deal.positionId || deal.positionId === "0") continue;
    const group = groups.get(deal.positionId) ?? [];
    group.push(deal);
    groups.set(deal.positionId, group);
  }

  const trades: Mt5PerformanceTrade[] = [];
  for (const [positionId, group] of groups) {
    group.sort((left, right) => left.timestamp - right.timestamp);
    const opens = group.filter((deal) => deal.entry === "IN" && deal.side !== null);
    const closes = group.filter((deal) => deal.entry === "OUT" || deal.entry === "OUT_BY" || deal.entry === "INOUT");
    const firstOpen = opens.at(0);
    const lastClose = closes.at(-1);
    if (!firstOpen || !lastClose || firstOpen.side === null) continue;

    const openVolume = opens.reduce((sum, deal) => sum + deal.volume, 0);
    const closeVolume = closes.reduce((sum, deal) => sum + deal.volume, 0);
    if (openVolume <= 0 || closeVolume <= 0 || closeVolume + 1e-8 < openVolume) continue;

    const entry = opens.reduce((sum, deal) => sum + deal.price * deal.volume, 0) / openVolume;
    const exit = closes.reduce((sum, deal) => sum + deal.price * deal.volume, 0) / closeVolume;
    const netPnl = group.reduce((sum, deal) => sum + deal.netPnl, 0);
    const hour = new Date(firstOpen.timestamp).getUTCHours();
    const day = new Date(firstOpen.timestamp).getUTCDay();
    const strategy = strategyOf(firstOpen, trendMagic, sidewayMagic);

    trades.push({
      id: `mt5-${positionId}`,
      symbol: firstOpen.symbol || "XAUUSD",
      side: firstOpen.side,
      ownership: ownershipOf(firstOpen, trendMagic, sidewayMagic),
      strategy,
      openedAt: firstOpen.timestamp,
      closedAt: lastClose.timestamp,
      durationMinutes: round(Math.max(0, lastClose.timestamp - firstOpen.timestamp) / 60_000, 1),
      volume: round(openVolume, 2),
      entry: round(entry, 2),
      exit: round(exit, 2),
      netPnl: round(netPnl, 2),
      session: sessionFromHour(hour),
      brokerHour: hour,
      weekday: WEEKDAYS[day] ?? String(day),
      exitReason: "UNKNOWN",
    });
  }

  return trades.sort((left, right) => right.closedAt - left.closedAt);
}

function calculateMetrics(
  trades: readonly Mt5PerformanceTrade[],
  startingBalance?: number,
): Mt5PerformanceMetrics {
  const chronological = [...trades].sort((left, right) => left.closedAt - right.closedAt);
  const wins = chronological.filter((trade) => trade.netPnl > 0);
  const losses = chronological.filter((trade) => trade.netPnl < 0);
  const breakeven = chronological.length - wins.length - losses.length;
  const grossProfit = wins.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.netPnl, 0));
  const netPnl = chronological.reduce((sum, trade) => sum + trade.netPnl, 0);

  let streak = 0;
  let maxConsecutiveLosses = 0;
  for (const trade of chronological) {
    if (trade.netPnl < 0) {
      streak += 1;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, streak);
    } else {
      streak = 0;
    }
  }

  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  if (typeof startingBalance === "number" && Number.isFinite(startingBalance) && startingBalance > 0) {
    let balance = startingBalance;
    let peak = startingBalance;
    for (const trade of chronological) {
      balance += trade.netPnl;
      peak = Math.max(peak, balance);
      const drawdown = peak - balance;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
      maxDrawdownPercent = Math.max(maxDrawdownPercent, peak > 0 ? (drawdown / peak) * 100 : 0);
    }
  }

  return {
    totalTrades: chronological.length,
    wins: wins.length,
    losses: losses.length,
    breakeven,
    netPnl: round(netPnl),
    grossProfit: round(grossProfit),
    grossLoss: round(grossLoss),
    winRatePercent: chronological.length > 0 ? round((wins.length / chronological.length) * 100) : 0,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 3) : grossProfit > 0 ? null : 0,
    expectancy: chronological.length > 0 ? round(netPnl / chronological.length) : 0,
    averageWin: wins.length > 0 ? round(grossProfit / wins.length) : 0,
    averageLoss: losses.length > 0 ? round(grossLoss / losses.length) : 0,
    maxDrawdown: round(maxDrawdown),
    maxDrawdownPercent: round(maxDrawdownPercent),
    maxConsecutiveLosses,
  };
}

function buildEquityCurve(
  trades: readonly Mt5PerformanceTrade[],
  startingBalance: number,
) {
  const chronological = [...trades].sort((left, right) => left.closedAt - right.closedAt);
  let balance = startingBalance;
  let peak = startingBalance;

  return chronological.map((trade) => {
    balance += trade.netPnl;
    peak = Math.max(peak, balance);
    return {
      timestamp: trade.closedAt,
      balance: round(balance),
      drawdownPercent: round(peak > 0 ? ((peak - balance) / peak) * 100 : 0),
    };
  });
}

function bucket(
  trades: readonly Mt5PerformanceTrade[],
  keyOf: (trade: Mt5PerformanceTrade) => string,
): Mt5PerformanceBucket[] {
  const groups = new Map<string, Mt5PerformanceTrade[]>();
  for (const trade of trades) {
    const key = keyOf(trade);
    const group = groups.get(key) ?? [];
    group.push(trade);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const metrics = calculateMetrics(group);
      return {
        key,
        label: key,
        totalTrades: metrics.totalTrades,
        netPnl: metrics.netPnl,
        winRatePercent: metrics.winRatePercent,
        profitFactor: metrics.profitFactor,
      };
    })
    .sort((left, right) => right.totalTrades - left.totalTrades || left.label.localeCompare(right.label));
}

function recommendations(
  systemTrades: readonly Mt5PerformanceTrade[],
  accountMode: "DEMO" | "LIVE",
): Mt5PerformanceRecommendation[] {
  if (systemTrades.length < MIN_RECOMMENDATION_SAMPLE) {
    return [{
      severity: "INFO",
      title: `Đang thu thập mẫu ${accountMode}`,
      evidence: `Mới có ${systemTrades.length}/${MIN_RECOMMENDATION_SAMPLE} system-owned trade đã đóng trên tài khoản hiện tại.`,
      suggestion: "Tiếp tục thu thập dữ liệu; chưa retune và không tự động thay đổi chiến lược từ trang hiệu suất.",
      autoApply: false,
    }];
  }

  const output: Mt5PerformanceRecommendation[] = [];
  const all = calculateMetrics(systemTrades);
  const buys = systemTrades.filter((trade) => trade.side === "BUY");
  const sells = systemTrades.filter((trade) => trade.side === "SELL");

  if ((all.profitFactor ?? 0) < 1 && all.winRatePercent < 40) {
    output.push({
      severity: "WATCH",
      title: "Forward sample đang yếu",
      evidence: `PF ${String(all.profitFactor ?? "∞")} · Win rate ${all.winRatePercent.toFixed(1)}% · ${all.totalTrades} trades.`,
      suggestion: "Review riêng Pattern + Supertrend + quản lý +6/+10 sau khi đủ mẫu; không tự động thay đổi tham số.",
      autoApply: false,
    });
  }

  if (buys.length >= 10 && sells.length >= 10) {
    const buyMetrics = calculateMetrics(buys);
    const sellMetrics = calculateMetrics(sells);
    if (Math.abs(buyMetrics.winRatePercent - sellMetrics.winRatePercent) >= 15) {
      const weak = buyMetrics.winRatePercent < sellMetrics.winRatePercent ? "BUY" : "SELL";
      output.push({
        severity: "WATCH",
        title: `${weak} đang yếu hơn trong forward sample`,
        evidence: `BUY ${buyMetrics.winRatePercent.toFixed(1)}% vs SELL ${sellMetrics.winRatePercent.toFixed(1)}%.`,
        suggestion: `Giữ nguyên rule trong lúc thu mẫu; đánh dấu ${weak} để review sau.`,
        autoApply: false,
      });
    }
  }

  if (output.length === 0) {
    output.push({
      severity: "INFO",
      title: "Chưa có lý do thay đổi chiến lược",
      evidence: `${all.totalTrades} system-owned trades chưa kích hoạt cảnh báo review.`,
      suggestion: "Tiếp tục theo dõi; không auto-fit và không tự động đổi chiến lược.",
      autoApply: false,
    });
  }

  return output;
}

function resolveAccountMode(brokerMode: unknown): { accountMode: "DEMO" | "LIVE"; brokerMode: "demo" | "real" } {
  if (brokerMode === "demo") return { accountMode: "DEMO", brokerMode: "demo" };
  if (brokerMode === "real") return { accountMode: "LIVE", brokerMode: "real" };
  throw new Error(`MT5 performance analytics supports DEMO or LIVE only. Actual=${String(brokerMode ?? "unknown")}`);
}

export async function getMt5PerformanceSnapshot(
  days = 90,
  symbol = "XAUUSD",
): Promise<Mt5PerformanceSnapshot> {
  if (!Number.isInteger(days) || days < 7 || days > 365) {
    throw new Error("days must be an integer between 7 and 365.");
  }

  const normalizedSymbol = symbol.trim().toUpperCase();
  if (normalizedSymbol !== "XAUUSD") {
    throw new Error("MT5 performance page currently supports XAUUSD only.");
  }

  const telemetry = await getMt5Telemetry(normalizedSymbol);
  if (!telemetry.reachable || !telemetry.health?.connected) {
    throw new Error(`MT5 telemetry unavailable: ${telemetry.message}`);
  }

  const account = resolveAccountMode(telemetry.health.accountMode);

  // This endpoint only reads telemetry/deal history. It never exposes order or
  // position mutation routes, including while the selected runtime is LIVE.
  const bridgeTradingEnabled = Boolean(telemetry.health.tradingEnabled);
  const brokerNow = telemetry.quote?.timestamp ?? Date.now();
  const fromMs = Math.max(0, brokerNow - days * DAY_MS);

  const deals = (
    await getMt5DealHistory(fromMs, brokerNow, normalizedSymbol)
  ).filter((deal) => deal.isTradingDeal && deal.symbol === normalizedSymbol);

  const trendMagic = Number(process.env.MT5_MAGIC_NUMBER ?? defaultMt5BrokerConfig.magicNumber);
  const sidewayMagic = Number(process.env.ZIQ_PHASE7C_SIDEWAY_MAGIC_NUMBER ?? 270714);

  if (!Number.isInteger(trendMagic) || trendMagic <= 0) {
    throw new Error("Configured Trend magic is invalid.");
  }
  if (!Number.isInteger(sidewayMagic) || sidewayMagic <= 0) {
    throw new Error("Configured Sideway magic is invalid.");
  }
  if (trendMagic === sidewayMagic) {
    throw new Error("Trend and Sideway magic numbers must be distinct.");
  }

  const trades = reconstructTrades(deals, trendMagic, sidewayMagic);
  const currentBalance = telemetry.health.accountBalance;
  const accountWindowPnl = trades.reduce((sum, trade) => sum + trade.netPnl, 0);
  const startingBalance =
    typeof currentBalance === "number" && Number.isFinite(currentBalance) && currentBalance > 0
      ? Math.max(0.01, currentBalance - accountWindowPnl)
      : 10_000;

  const systemTrades = trades.filter((trade) => trade.ownership === "SYSTEM");
  const systemMetrics = calculateMetrics(systemTrades);
  const recent20 = systemTrades.length >= 20 ? calculateMetrics(systemTrades.slice(0, 20)) : null;
  const previous20 = systemTrades.length >= 40 ? calculateMetrics(systemTrades.slice(20, 40)) : null;

  return {
    source: "MT5_ACCOUNT_READ_ONLY",
    symbol: normalizedSymbol,
    currency: telemetry.health.accountCurrency ?? "USD",
    days,
    generatedAt: brokerNow,
    account: {
      accountMode: account.accountMode,
      brokerMode: account.brokerMode,
      login: Number.isFinite(Number(telemetry.health.accountLogin)) ? Number(telemetry.health.accountLogin) : null,
      server: telemetry.health.server ?? null,
    },
    safety: {
      accountMode: account.accountMode,
      bridgeTradingEnabled,
      readOnly: true,
      strategyAutoChange: false,
      liveUnlockAvailable: false,
    },
    accountWide: {
      metrics: calculateMetrics(trades, startingBalance),
      equityCurve: buildEquityCurve(trades, startingBalance),
    },
    systemOwned: {
      metrics: systemMetrics,
      minimumRecommendationSample: MIN_RECOMMENDATION_SAMPLE,
      sampleReady: systemTrades.length >= MIN_RECOMMENDATION_SAMPLE,
      recent20,
      previous20,
    },
    trades: trades.slice(0, 250),
    breakdown: {
      side: bucket(trades, (trade) => trade.side),
      session: bucket(trades, (trade) => trade.session),
      weekday: bucket(trades, (trade) => trade.weekday),
      hour: bucket(trades, (trade) => `${String(trade.brokerHour).padStart(2, "0")}:00`),
      strategy: (["TREND", "SIDEWAY"] as const).map((strategy) => {
        const metrics = calculateMetrics(systemTrades.filter((trade) => trade.strategy === strategy));
        return {
          key: strategy,
          label: strategy,
          totalTrades: metrics.totalTrades,
          netPnl: metrics.netPnl,
          winRatePercent: metrics.winRatePercent,
          profitFactor: metrics.profitFactor,
        };
      }),
      ownership: bucket(trades, (trade) => trade.ownership),
    },
    recommendations: recommendations(systemTrades, account.accountMode),
    notes: [
      `Đang đọc lịch sử tài khoản ${account.accountMode} hiện tại theo chế độ read-only.`,
      "Account-wide metrics có thể gồm lệnh manual/external/validation.",
      `SYSTEM ownership dùng Trend magic ${trendMagic} và Sideway magic ${sidewayMagic}.`,
      "Khuyến nghị chỉ mang tính quan sát; trang hiệu suất không đổi strategy, không gửi order và không mutate position.",
    ],
  };
}
