import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import AccountCircleRounded from "@mui/icons-material/AccountCircleRounded";
import CandlestickChartRounded from "@mui/icons-material/CandlestickChartRounded";
import ReceiptLongRounded from "@mui/icons-material/ReceiptLongRounded";
import SmartToyRounded from "@mui/icons-material/SmartToyRounded";
import TelegramRounded from "@mui/icons-material/Telegram";
import HubRounded from "@mui/icons-material/HubRounded";
import { useQuery } from "@tanstack/react-query";
import { safeReadJson } from "../api";
import { price } from "../format";
import { LoadingState } from "../ui/PageState";
import { MetricCard } from "../ui/MetricCard";
import { StatusChip } from "../ui/StatusChip";

type Side = "BUY" | "SELL";

type DemoSnapshot = {
  botStatus?: string;
  generatedAt?: number;
  runtime?: { armed?: boolean; alive?: boolean; pid?: number | null } | null;
  entryDiagnostics?: {
    entry?: {
      eligible?: boolean;
      side?: Side | null;
      action?: string;
      reason?: string;
      referenceEntry?: number | null;
      stopDistance?: number | null;
      structuralStopDistance?: number | null;
    };
  } | null;
  entryDiagnosticsError?: string | null;
  state?: {
    accountLogin?: number | null;
    managed?: {
      ticket?: string;
      side?: Side;
      pattern?: string;
      entry?: number;
      expectedRemainingVolume?: number;
      stopDistance?: number;
      breakEvenApplied?: boolean;
      partialApplied?: boolean;
      lastStructuralStop?: number | null;
    } | null;
  } | null;
  mt5?: {
    reachable?: boolean;
    health?: {
      accountMode?: string;
      accountLogin?: number | null;
      server?: string | null;
      tradingEnabled?: boolean;
      terminalTradeAllowed?: boolean;
      expertTradeAllowed?: boolean;
      accountCurrency?: string;
      accountProfit?: number;
    } | null;
    quote?: { bid?: number; ask?: number; spread?: number } | null;
    positions?: Array<{ ticket?: string; side?: string; volume?: number; entry?: number; stopLoss?: number; profit?: number }>;
    managedPosition?: { ticket?: string; side?: string; volume?: number; entry?: number; stopLoss?: number; profit?: number } | null;
  };
};

type RegimeSnapshot = {
  regime?: string;
  recommendedMode?: string;
  confidence?: number;
  supplyDemandRange?: unknown;
};

type DecisionSnapshot = {
  preTrade?: {
    strategy?: string;
    stage?: string;
    side?: string | null;
    setup?: string | null;
    entry?: number | null;
    stopLoss?: number | null;
    stopDistance?: number | null;
    tp1?: number | null;
    tp2?: number | null;
    finalLot?: number | null;
    estimatedRiskUsd?: number | null;
    entryReason?: string;
    holdReason?: string;
  };
  safety?: { mt5PanelOrderPermission?: string };
};

type LotSnapshot = {
  state?: { trendFixedLot?: number; sidewayRiskPercent?: number; sidewayMaxLot?: number };
  active?: { armed?: boolean; supervisorPid?: number | null };
  activeAlive?: boolean;
  restartRequired?: boolean;
  appliesTo?: string;
  safety?: { demoOnly?: boolean; existingPositionMutation?: boolean; martingale?: boolean; recoveryLotEscalation?: boolean };
};

type BotModeSnapshot = { state?: { mode?: string } };

type UnifiedStatus = {
  demo?: DemoSnapshot;
  regime?: RegimeSnapshot;
  decision?: DecisionSnapshot;
  lot?: LotSnapshot;
  botMode?: BotModeSnapshot;
  errors: string[];
};

async function load<T>(url: string, label: string): Promise<{ data?: T; error?: string }> {
  try {
    const data = await safeReadJson<T>(await fetch(url, { cache: "no-store" }), label);
    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : `${label} chưa sẵn sàng.` };
  }
}

async function getUnifiedStatus(): Promise<UnifiedStatus> {
  const [demo, regime, decision, lot, botMode] = await Promise.all([
    load<DemoSnapshot>("/api/v1/phase7b-demo", "Tổng quan DEMO"),
    load<RegimeSnapshot>("/api/v1/phase7c/live-regime?symbol=XAUUSD", "Regime Phase7C"),
    load<DecisionSnapshot>("/api/v1/phase7c/decision-monitor?symbol=XAUUSD", "Decision monitor"),
    load<LotSnapshot>("/api/v1/phase7c/lot-settings", "Lot settings"),
    load<BotModeSnapshot>("/api/v1/phase7c/bot-mode", "Bot mode"),
  ]);

  return {
    demo: demo.data,
    regime: regime.data,
    decision: decision.data,
    lot: lot.data,
    botMode: botMode.data,
    errors: [demo.error, regime.error, decision.error, lot.error, botMode.error].filter(Boolean) as string[],
  };
}

function dash(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "n/a") return "Chưa có";
  return String(value);
}

function yesNo(value: boolean | undefined | null) {
  if (value === true) return "Có";
  if (value === false) return "Không";
  return "Chưa rõ";
}

function sideVi(value?: string | null) {
  if (value === "BUY" || value === "LONG") return "MUA";
  if (value === "SELL" || value === "SHORT") return "BÁN";
  return "Chưa có";
}

function modeDisplay(mode?: string, effective?: string) {
  if (!mode) return "Chưa rõ";
  if (effective && effective !== mode) return `${mode} → ${effective}`;
  return mode;
}

function num(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) return "Chưa có";
  return `${Number(value).toFixed(2)}${suffix}`;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" gap={2}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="caption" fontWeight={900} textAlign="right">{value}</Typography>
    </Stack>
  );
}

function ReasonBox({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="subtitle1" fontWeight={950}>{title}</Typography>
        <Stack spacing={1} mt={1.4}>
          {lines.map((line) => <Typography key={line} variant="body2" color="text.secondary">• {line}</Typography>)}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function Phase7BDemoPage() {
  const query = useQuery({
    queryKey: ["phase7c-unified-overview"],
    queryFn: getUnifiedStatus,
    refetchInterval: 3_000,
    retry: false,
  });

  if (query.isLoading) return <LoadingState />;

  const data = query.data;
  const demo = data?.demo;
  const health = demo?.mt5?.health;
  const quote = demo?.mt5?.quote;
  const position = demo?.mt5?.managedPosition;
  const managed = demo?.state?.managed;
  const mode = data?.botMode?.state?.mode;
  const decision = data?.decision?.preTrade;
  const regime = data?.regime;
  const lot = data?.lot;
  const effective = decision?.strategy ?? regime?.recommendedMode;
  const botAlive = Boolean(demo?.runtime?.alive || lot?.activeAlive);
  const telegramReady = data?.errors.some((error) => error.includes("Telegram")) ? false : undefined;
  const openPositions = demo?.mt5?.positions?.length ?? 0;

  const entryReasons = [
    decision?.entryReason,
    regime?.regime ? `Regime hiện tại: ${regime.regime}.` : undefined,
    regime?.recommendedMode ? `Hệ thống khuyến nghị: ${regime.recommendedMode}.` : undefined,
    decision?.stage === "BLOCKED" ? "Decision engine đang chặn lệnh để bảo toàn an toàn." : undefined,
    decision?.stopDistance && decision.stopDistance > 10 ? "SL lớn hơn 10 giá: chờ pullback sau nến M15 xác nhận." : undefined,
  ].filter(Boolean) as string[];

  const holdReasons = [
    decision?.holdReason,
    openPositions === 0 ? "Không có vị thế XAUUSD đang quản lý." : `Đang có ${openPositions} vị thế XAUUSD.` ,
    `MT5 panel chỉ đọc: ORDER ${data?.decision?.safety?.mt5PanelOrderPermission ?? "NONE"}.`,
    "Quy tắc giữ lệnh: BE +6 giá, chốt 1/3 tại +10 giá.",
  ].filter(Boolean) as string[];

  return (
    <Stack spacing={2.2}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5} alignItems={{ md: "center" }}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={900}>XAUUSD · MT5 DEMO</Typography>
          <Typography variant="h4" fontWeight={950}>Tổng quan giao dịch DEMO</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>Đồng bộ trạng thái AUTO/PAUSE, regime, lot, executor, Telegram và kế hoạch lệnh với panel MT5.</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <StatusChip value={modeDisplay(mode, effective)} />
          <StatusChip value={decision?.stage ?? "ĐANG CHỜ"} />
          <StatusChip value={health?.accountMode === "demo" ? "CHỈ DEMO" : dash(health?.accountMode)} />
        </Stack>
      </Stack>

      {data?.errors.length ? (
        <Alert severity="warning">
          Một vài section chưa lấy được dữ liệu, nhưng trang vẫn giữ phần còn lại: {data.errors.slice(0, 2).join(" · ")}
        </Alert>
      ) : null}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <MetricCard label="Bot Mode" value={modeDisplay(mode, effective)} detail={`Regime ${dash(regime?.regime)} · Conf ${dash(regime?.confidence)}`} icon={<SmartToyRounded color="primary" />} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <MetricCard label="XAUUSD" value={price(quote?.bid ?? null)} detail={`Ask ${price(quote?.ask ?? null)} · spread ${price(quote?.spread ?? null)}`} icon={<CandlestickChartRounded color="primary" />} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <MetricCard label="Executor" value={botAlive ? "ĐANG CHẠY" : "CHƯA SẴN SÀNG"} detail={`Lot active ${yesNo(lot?.activeAlive)} · restart ${yesNo(lot?.restartRequired)}`} icon={<HubRounded color={botAlive ? "success" : "disabled"} />} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <MetricCard label="Tài khoản" value={String(health?.accountLogin ?? demo?.state?.accountLogin ?? "—")} detail={`${health?.server ?? "—"} · ${health?.accountMode ?? "—"}`} icon={<AccountCircleRounded color="primary" />} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                <Typography variant="h6" fontWeight={950}>Kế hoạch lệnh kế tiếp</Typography>
                <Chip label={decision?.stage ?? "ĐANG CHỜ"} color={decision?.stage === "BLOCKED" ? "warning" : decision?.stage === "READY" ? "success" : "default"} variant="outlined" />
              </Stack>
              <Grid container spacing={1.4} mt={1}>
                <Grid size={6}><Info label="Điểm vào" value={num(decision?.entry)} /></Grid>
                <Grid size={6}><Info label="TP1" value={num(decision?.tp1)} /></Grid>
                <Grid size={6}><Info label="Stoploss" value={num(decision?.stopLoss)} /></Grid>
                <Grid size={6}><Info label="TP2" value={num(decision?.tp2)} /></Grid>
                <Grid size={6}><Info label="Khoảng SL" value={num(decision?.stopDistance, " giá")} /></Grid>
                <Grid size={6}><Info label="Hướng" value={sideVi(decision?.side)} /></Grid>
                <Grid size={6}><Info label="Lot" value={num(decision?.finalLot ?? lot?.state?.trendFixedLot)} /></Grid>
                <Grid size={6}><Info label="Setup" value={dash(decision?.setup)} /></Grid>
                <Grid size={6}><Info label="Risk USD" value={num(decision?.estimatedRiskUsd, " USD")} /></Grid>
                <Grid size={6}><Info label="BE / Partial" value="+6 giá / +10 chốt 1/3" /></Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                <Typography variant="h6" fontWeight={950}>Vị thế đang quản lý</Typography>
                <StatusChip value={managed ? sideVi(managed.side) : "KHÔNG CÓ LỆNH"} />
              </Stack>
              <Grid container spacing={1.4} mt={1}>
                <Grid size={6}><Info label="Ticket" value={dash(managed?.ticket ?? position?.ticket)} /></Grid>
                <Grid size={6}><Info label="Volume" value={dash(position?.volume ?? managed?.expectedRemainingVolume)} /></Grid>
                <Grid size={6}><Info label="Entry" value={num(position?.entry ?? managed?.entry)} /></Grid>
                <Grid size={6}><Info label="SL hiện tại" value={num(position?.stopLoss ?? managed?.lastStructuralStop)} /></Grid>
                <Grid size={6}><Info label="P/L" value={num(position?.profit ?? health?.accountProfit, ` ${health?.accountCurrency ?? "USD"}`)} /></Grid>
                <Grid size={6}><Info label="BE +6" value={yesNo(managed?.breakEvenApplied)} /></Grid>
                <Grid size={6}><Info label="Partial +10" value={yesNo(managed?.partialApplied)} /></Grid>
                <Grid size={6}><Info label="Panel" value={`READ ONLY · ORDER ${data?.decision?.safety?.mt5PanelOrderPermission ?? "NONE"}`} /></Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <ReasonBox title="Lý do vào lệnh" lines={entryReasons.length ? entryReasons : ["Chưa có setup hợp lệ để vào lệnh.", "Đang chờ nến M15/M5 đóng và đủ điều kiện."]} />
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <ReasonBox title="Lý do giữ / chờ lệnh" lines={holdReasons.length ? holdReasons : ["Không có vị thế đang quản lý.", "Panel MT5 chỉ đọc, không gửi lệnh."]} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined"><CardContent>
            <Typography variant="caption" color="text.secondary" fontWeight={900}>LOT / RISK</Typography>
            <Stack spacing={1.2} mt={1.2}>
              <Info label="Trend fixed lot" value={dash(lot?.state?.trendFixedLot)} />
              <Info label="Sideway risk" value={`${dash(lot?.state?.sidewayRiskPercent)}%`} />
              <Info label="Sideway max lot" value={dash(lot?.state?.sidewayMaxLot)} />
              <Info label="Applies to" value={dash(lot?.appliesTo)} />
            </Stack>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined"><CardContent>
            <Typography variant="caption" color="text.secondary" fontWeight={900}>TELEGRAM / MODE</Typography>
            <Stack spacing={1.2} mt={1.2}>
              <Info label="Active mode" value={dash(mode)} />
              <Info label="Recommended" value={dash(regime?.recommendedMode)} />
              <Info label="Telegram" value={telegramReady === false ? "Đang kiểm tra" : "Theo dõi tại Hệ thống & Telegram"} />
              <Info label="Supervisor PID" value={dash(lot?.active?.supervisorPid ?? demo?.runtime?.pid)} />
            </Stack>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined"><CardContent>
            <Typography variant="caption" color="text.secondary" fontWeight={900}>SAFETY</Typography>
            <Stack spacing={1.2} mt={1.2}>
              <Info label="Demo only" value={yesNo(lot?.safety?.demoOnly)} />
              <Info label="Trading enabled" value={yesNo(health?.tradingEnabled)} />
              <Info label="Existing mutation" value={yesNo(lot?.safety?.existingPositionMutation)} />
              <Info label="Martingale" value={yesNo(lot?.safety?.martingale)} />
            </Stack>
          </CardContent></Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
