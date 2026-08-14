export type Phase7BSide = "BUY" | "SELL";

export interface Phase7BDemoSnapshot {
  readOnly: true;
  botStatus: string;
  generatedAt: number;
  runtime: {
    status?: string;
    armed?: boolean;
    alive?: boolean;
    heartbeatAgeMs?: number | null;
  } | null;
  entryDiagnostics: {
    closeTime: number;
    nextCloseTime: number;
    bar: { open: number; high: number; low: number; close: number };
    pattern: {
      matched: boolean;
      name: "ENGULFING" | "TWO_CANDLE_BODY_DOMINANCE" | null;
      side: Phase7BSide | null;
      extreme: number | null;
    };
    trend: {
      ma20: number;
      ma50: number;
      ma200: number;
      buyAligned: boolean;
      sellAligned: boolean;
      matchedPatternSide: boolean;
    };
    fvg: {
      buyConfirmed: boolean;
      sellConfirmed: boolean;
      sameDirectionConfirmed: boolean;
      requiredForEntry: false;
    };
    entry: {
      eligible: boolean;
      side: Phase7BSide | null;
      referenceEntry: number;
      structuralStopDistance: number | null;
      stopDistance: number | null;
      reason: string;
    };
  } | null;
  state: {
    accountLogin: number | null;
    lastEvaluatedM15Close: number;
    managed: {
      ticket: string;
      side: Phase7BSide;
      pattern: string;
      signalTimestamp: number;
      signalEntry: number;
      entry: number;
      initialVolume: number;
      expectedRemainingVolume: number;
      stopDistance: number;
      breakEvenApplied: boolean;
      partialApplied: boolean;
      lastStructuralStop: number | null;
    } | null;
  } | null;
  recentEvents: Array<Record<string, unknown> & { timestamp?: string; type?: string }>;
  mt5: {
    reachable: boolean;
    status: string;
    health: {
      accountMode?: string;
      server?: string;
      tradingEnabled?: boolean;
      terminalTradeAllowed?: boolean;
      expertTradeAllowed?: boolean;
    } | null;
    quote: { bid: number; ask: number; spread: number; timestamp: number } | null;
    spec: {
      tickSize: number;
      point?: number;
      effectiveTickValuePerLot?: number;
      cashPerPriceUnitPerLot?: number;
      contractSize?: number;
      digits: number;
      minVolume: number;
      maxVolume: number;
      volumeStep: number;
      maxSpread: number;
      stopsLevelTicks: number;
    } | null;
    managedPosition: {
      ticket: string;
      side: "LONG" | "SHORT";
      volume: number;
      entry: number;
      stopLoss: number;
      profit: number;
    } | null;
  };
}

export interface Phase7CAccountRiskSnapshot {
  source: "MT5_DEMO_READ_ONLY";
  generatedAt: number;
  safety: {
    mode: "AUTO_LOT_SHADOW";
    executionMutation: false;
    phase7bFixedVolumeUnchanged: true;
    liveUnlockAvailable: false;
  };
  account: {
    connected: boolean;
    accountLogin: number | null;
    accountMode: string | null;
    accountBalance: number | null;
    accountEquity: number | null;
    accountMargin: number | null;
    accountFreeMargin: number | null;
    accountProfit: number | null;
    accountLeverage: number | null;
    accountCurrency: string | null;
    server: string | null;
    terminalVersion: string | null;
    tradingEnabled: boolean;
    terminalTradeAllowed: boolean;
    expertTradeAllowed: boolean;
  };
  quote: {
    bid: number;
    ask: number;
    spread: number;
    timestamp: number;
  };
  spec: {
    brokerSymbol: string;
    tickSize: number;
    point: number;
    effectiveTickValuePerLot: number;
    cashPerPriceUnitPerLot: number;
    riskValueSource: string;
    contractSize: number;
    digits: number;
    minVolume: number;
    maxVolume: number;
    volumeStep: number;
    maxSpread: number;
    stopsLevelTicks: number;
    freezeLevelTicks: number;
    fillingMode: number;
    executionMode: number;
  };
  configuration: {
    riskPercent: number;
    maxLot: number;
    currentFixedVolume: number;
    targetRiskUsd: number;
  };
  rows: Array<{
    stopDistance: number;
    targetRiskUsd: number;
    lossAtSlOneLot: number;
    rawLot: number;
    recommendedLot: number;
    estimatedRiskUsd: number;
    estimatedRiskPercent: number;
    approved: boolean;
    reason: string;
  }>;
}

export interface Phase7CBacktestRequest {
  from: string;
  to: string;
  fixedVolume: number;
}

export interface Phase7CBacktestSlice {
  trades: number;
  winRatePercent: number;
  netPnl: number;
  profitFactor: number | null;
  expectancy: number;
  averageR: number;
}

export interface Phase7CBacktestResult {
  source: "PHASE7C_MT5_BROKER_HISTORY";
  replayMode: "CLOSED_M15_WITH_M5_EXECUTION_APPROXIMATION";
  productionEquivalent: false;
  generatedAt: number;
  range: {
    from: string;
    to: string;
    days: number;
    tradingDays: number;
    m15Bars: number;
    m5Bars: number;
  };
  account: {
    login: number | null;
    mode: string | null;
    server: string | null;
    currency: string | null;
  };
  broker: {
    symbol: string;
    tickSize: number;
    cashPerPriceUnitPerLot: number;
    minVolume: number;
    volumeStep: number;
    fixedVolume: number;
  };
  rules: Record<string, string | number>;
  metrics: {
    signals: number;
    trades: number;
    skippedWhilePositionOpen: number;
    tradesPerTradingDay: number;
    winRatePercent: number;
    netPnl: number;
    profitFactor: number | null;
    expectancy: number;
    averageR: number;
    maxDrawdownUsd: number;
    averageHoldHours: number;
    breakEvenApplied: number;
    partialApplied: number;
    structuralTrailUpdates: number;
    exitReasons: Record<string, number>;
  };
  breakdown: {
    buy: Phase7CBacktestSlice;
    sell: Phase7CBacktestSlice;
    engulfing: Phase7CBacktestSlice;
    twoCandle: Phase7CBacktestSlice;
  };
  equityCurve: Array<{ timestamp: number; pnl: number; drawdown: number }>;
  trades: Array<{
    side: Phase7BSide;
    pattern: string;
    signalTimestamp: number;
    entryTime: number;
    entry: number;
    stopLoss: number;
    stopDistance: number;
    volume: number;
    exitTime: number;
    exit: number;
    pnl: number;
    rMultiple: number;
    holdHours: number;
    breakEvenApplied: boolean;
    partialApplied: boolean;
    partialVolume: number;
    partialPnl: number;
    structuralTrailUpdates: number;
    exitReason: string;
    fvgConfirmedAtEntry: boolean;
  }>;
  notes: string[];
}
