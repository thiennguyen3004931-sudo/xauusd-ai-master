import { getMt5Telemetry } from "./mt5.service";

const TREND_MAGIC_NUMBER = Number(
  process.env.MT5_MAGIC_NUMBER ?? "270713",
);

const SIDEWAY_MAGIC_NUMBER = Number(
  process.env.ZIQ_PHASE7C_SIDEWAY_MAGIC_NUMBER ?? "270714",
);

const DAILY_RECOVERY_MIN_TP_DISTANCE = 6;
const DAILY_RECOVERY_MAX_TP_DISTANCE = 10;
const DAILY_RECOVERY_TARGET_NET_USD = 1;

interface BridgeDayBoundary {
  currentStartTime?: number;
}

interface BridgeDeal {
  isTradingDeal?: boolean;
  magic?: number | string;
  netPnl?: number | string;
}

function bridgeBaseUrl(): string {
  return (
    process.env.MT5_BRIDGE_BASE_URL ??
    "http://127.0.0.1:8765"
  )
    .trim()
    .replace(/\/$/, "");
}

function bridgeApiKey(): string {
  return (
    process.env.MT5_BRIDGE_API_KEY?.trim() ||
    process.env.MT5_API_KEY?.trim() ||
    ""
  );
}

async function bridgeGet<T>(requestPath: string): Promise<T> {
  const apiKey = bridgeApiKey();

  if (!apiKey) {
    throw new Error(
      "MT5 bridge API key is unavailable for Daily Recovery view.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(
      `${bridgeBaseUrl()}${requestPath}`,
      {
        headers: {
          "x-mt5-api-key": apiKey,
        },
        signal: controller.signal,
      },
    );

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `MT5 bridge Daily Recovery request failed ${response.status}: ${text}`,
      );
    }

    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function validMagicNumbers(): Set<number> {
  if (
    ![TREND_MAGIC_NUMBER, SIDEWAY_MAGIC_NUMBER].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  ) {
    throw new Error(
      "Daily Recovery magic-number configuration is invalid.",
    );
  }

  return new Set([
    TREND_MAGIC_NUMBER,
    SIDEWAY_MAGIC_NUMBER,
  ]);
}

export async function getPhase7CDailyRecoveryView(
  symbol = "XAUUSD",
  previewVolume = 0.03,
) {
  const normalizedSymbol =
    symbol.trim().toUpperCase() || "XAUUSD";

  if (
    !Number.isFinite(previewVolume) ||
    previewVolume <= 0
  ) {
    throw new Error(
      "Daily Recovery preview volume must be positive.",
    );
  }

  const telemetry =
    await getMt5Telemetry(normalizedSymbol);

  if (
    !telemetry.reachable ||
    telemetry.health?.accountMode !== "demo" ||
    !telemetry.quote ||
    !telemetry.spec
  ) {
    throw new Error(
      "Daily Recovery view requires connected MT5 DEMO telemetry.",
    );
  }

  const boundary = await bridgeGet<BridgeDayBoundary>(
    `/v1/session/day-boundary/${encodeURIComponent(normalizedSymbol)}`,
  );

  const dayStartTime =
    Number(boundary?.currentStartTime);

  const historyEndTime =
    Number(telemetry.quote.timestamp);

  if (
    !Number.isFinite(dayStartTime) ||
    dayStartTime <= 0 ||
    !Number.isFinite(historyEndTime) ||
    historyEndTime <= dayStartTime
  ) {
    throw new Error(
      "Daily Recovery broker day boundary is invalid.",
    );
  }

  const deals = await bridgeGet<BridgeDeal[]>(
    `/v1/history/deals?fromMs=${dayStartTime}&toMs=${historyEndTime}&symbol=${encodeURIComponent(normalizedSymbol)}`,
  );

  if (!Array.isArray(deals)) {
    throw new Error(
      "Daily Recovery deal history is invalid.",
    );
  }

  const magicNumbers = validMagicNumbers();

  const botDeals = deals.filter(
    (deal) =>
      deal?.isTradingDeal === true &&
      magicNumbers.has(Number(deal?.magic)),
  );

  const dailyNetPnl = botDeals.reduce(
    (sum, deal) =>
      sum + Number(deal?.netPnl || 0),
    0,
  );

  const cashPerPriceUnitPerLot =
    Number(
      telemetry.spec.cashPerPriceUnitPerLot,
    ) > 0
      ? Number(
          telemetry.spec.cashPerPriceUnitPerLot,
        )
      : Number(telemetry.spec.tickSize) > 0 &&
          Number(
            telemetry.spec.effectiveTickValuePerLot,
          ) > 0
        ? Number(
            telemetry.spec.effectiveTickValuePerLot,
          ) /
          Number(telemetry.spec.tickSize)
        : 0;

  const recoveryActive = dailyNetPnl < 0;

  if (
    recoveryActive &&
    !(cashPerPriceUnitPerLot > 0)
  ) {
    throw new Error(
      "Daily Recovery cannot determine cash per price unit.",
    );
  }

  const requiredUsd = recoveryActive
    ? Math.abs(dailyNetPnl) +
      DAILY_RECOVERY_TARGET_NET_USD
    : 0;

  const cashPerPriceUnit =
    cashPerPriceUnitPerLot * previewVolume;

  const rawTpDistance =
    recoveryActive
      ? requiredUsd / cashPerPriceUnit
      : null;

  const tpDistance =
    rawTpDistance === null
      ? null
      : Math.min(
          DAILY_RECOVERY_MAX_TP_DISTANCE,
          Math.max(
            DAILY_RECOVERY_MIN_TP_DISTANCE,
            rawTpDistance,
          ),
        );

  const canRecoverInOneTrade =
    rawTpDistance === null
      ? true
      : rawTpDistance <=
        DAILY_RECOVERY_MAX_TP_DISTANCE +
          1e-9;

  return {
    source: "MT5_DEMO_READ_ONLY" as const,
    readOnly: true as const,
    generatedAt: Date.now(),

    symbol: normalizedSymbol,

    dayStartTime,
    historyEndTime,
    dealCount: botDeals.length,

    dailyNetPnl,

    dailyMode: recoveryActive
      ? ("RECOVERY_TP" as const)
      : ("NORMAL" as const),

    nextEntryManagement: recoveryActive
      ? ("FULL_POSITION_ADAPTIVE_TP_6_TO_10" as const)
      : ("REGIME_NATIVE" as const),

    preview: {
      volume: previewVolume,
      cashPerPriceUnitPerLot:
        cashPerPriceUnitPerLot > 0
          ? cashPerPriceUnitPerLot
          : null,
      requiredUsd,
      rawTpDistance,
      tpDistance,
      canRecoverInOneTrade,
    },

    strategy: {
      trendMagicNumber:
        TREND_MAGIC_NUMBER,
      sidewayMagicNumber:
        SIDEWAY_MAGIC_NUMBER,
      targetNetUsd:
        DAILY_RECOVERY_TARGET_NET_USD,
      minTpDistance:
        DAILY_RECOVERY_MIN_TP_DISTANCE,
      maxTpDistance:
        DAILY_RECOVERY_MAX_TP_DISTANCE,
      lotEscalation: false as const,
      forcedEntry: false as const,
      forceRegime: false as const,
      newPositionsOnly: true as const,
    },
  };
}
