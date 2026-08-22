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
import { useQuery } from "@tanstack/react-query";
import { safeReadJson } from "../api";
import { LoadingState } from "../ui/PageState";

type Side = "BUY" | "SELL";

type DemoSnapshot = {
  entryDiagnostics?: {
    pattern?: { matched?: boolean; name?: string | null; side?: Side | null };
    trend?: {
      m15Supertrend?: Side | null;
      m5Supertrend?: Side | null;
      confidenceScore?: number | null;
      confidenceLevel?: string;
    };
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
  mt5?: { quote?: { bid?: number; ask?: number } | null };
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
    breakEvenApplied?: boolean;
    partialApplied?: boolean;
  };
  safety?: { mt5PanelOrderPermission?: string };
};

type BotModeSnapshot = { state?: { mode?: string } };

type Status = {
  demo?: DemoSnapshot;
  regime?: RegimeSnapshot;
  decision?: DecisionSnapshot;
  botMode?: BotModeSnapshot;
  errors: string[];
};

async function load<T>(url: string, label: string): Promise<{ data?: T; error?: string }> {
  try {
    return { data: await safeReadJson<T>(await fetch(url, { cache: "no-store" }), label) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : `${label} chưa sẵn sàng.` };
  }
}

async function getStatus(): Promise<Status> {
  const [demo, regime, decision, botMode] = await Promise.all([
    load<DemoSnapshot>("/api/v1/phase7b-demo", "Điều kiện nến"),
    load<RegimeSnapshot>("/api/v1/phase7c/live-regime?symbol=XAUUSD", "Regime Phase7C"),
    load<DecisionSnapshot>("/api/v1/phase7c/decision-monitor?symbol=XAUUSD", "Decision monitor"),
    load<BotModeSnapshot>("/api/v1/phase7c/bot-mode", "Bot mode"),
  ]);

  return {
    demo: demo.data,
    regime: regime.data,
    decision: decision.data,
    botMode: botMode.data,
    errors: [demo.error, regime.error, decision.error, botMode.error].filter(Boolean) as string[],
  };
}

function dash(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "n/a") return "Chưa có";
  return String(value);
}

function num(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) return "Chưa có";
  return `${Number(value).toFixed(2)}${suffix}`;
}

function sideVi(value?: string | null) {
  if (value === "BUY" || value === "LONG") return "MUA";
  if (value === "SELL" || value === "SHORT") return "BÁN";
  return "Chưa có";
}

function setupName(value?: string | null) {
  if (!value) return "Chưa có";
  if (value === "ENGULFING") return "Nến nhấn chìm";
  if (value === "TWO_CANDLE_BODY_DOMINANCE") return "Hai nến thân chiếm ưu thế";
  if (value === "THREE_CANDLE_BODY_DOMINANCE") return "Ba nến B+C+D > A";
  return value.replaceAll("_", " ");
}

function modeDisplay(mode?: string, effective?: string) {
  if (!mode) return "Chưa rõ";
  if (effective && effective !== mode) return `${mode} → ${effective}`;
  return mode;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" gap={2}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="caption" fontWeight={900} textAlign="right">{value}</Typography>
    </Stack>
  );
}

function ReasonPanel({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="h6" fontWeight={950}>{title}</Typography>
        <Stack spacing={1} mt={1.2}>
          {lines.map((line) => <Typography key={line} variant="body2" color="text.secondary">• {line}</Typography>)}
        </Stack>
      </CardContent>
    </Card>
  );
}

function GateCard({ label, value, detail, ok }: { label: string; value: string; detail: string; ok?: boolean }) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
          <Typography variant="caption" color="text.secondary" fontWeight={900}>{label}</Typography>
          <Chip size="small" label={ok ? "ĐẠT" : "CHỜ"} color={ok ? "success" : "warning"} variant="outlined" />
        </Stack>
        <Typography variant="h6" fontWeight={950} mt={1}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{detail}</Typography>
      </CardContent>
    </Card>
  );
}

export function Phase7BPatternCheckPage() {
  const query = useQuery({
    queryKey: ["phase7c-signal-decision-sync"],
    queryFn: getStatus,
    refetchInterval: 3_000,
    retry: false,
  });

  if (query.isLoading) return <LoadingState />;

  const data = query.data;
  const diag = data?.demo?.entryDiagnostics;
  const decision = data?.decision?.preTrade;
  const regime = data?.regime;
  const mode = data?.botMode?.state?.mode;
  const effective = decision?.strategy ?? regime?.recommendedMode;
  const quote = data?.demo?.mt5?.quote;
  const mid = quote?.bid !== undefined && quote?.ask !== undefined ? (Number(quote.bid) + Number(quote.ask)) / 2 : null;
  const patternMatched = Boolean(diag?.pattern?.matched);
  const wanted = diag?.pattern?.side;
  const m15Ok = Boolean(wanted && diag?.trend?.m15Supertrend === wanted);
  const m5Ok = Boolean(wanted && diag?.trend?.m5Supertrend === wanted);
  const entryEligible = Boolean(diag?.entry?.eligible || decision?.stage === "READY");
  const waitPullback = diag?.entry?.action === "WAIT_PULLBACK" || (decision?.stopDistance ?? 0) > 10;

  const entryReasons = [
    decision?.entryReason,
    patternMatched ? `Mô hình ${setupName(diag?.pattern?.name)} theo hướng ${sideVi(wanted)} đã xuất hiện.` : "Chưa có mô hình nến bắt buộc trên nến đã đóng.",
    m15Ok ? `Supertrend M15 cùng hướng ${sideVi(wanted)}.` : "Supertrend M15 chưa xác nhận cùng hướng.",
    m5Ok ? `Supertrend M5 cùng hướng ${sideVi(wanted)}.` : "Supertrend M5 chưa xác nhận cùng hướng.",
    waitPullback ? "SL lớn hơn 10 giá: setup phải chờ pullback sau nến M15 xác nhận." : undefined,
    regime?.recommendedMode === "PAUSE" ? `Regime ${regime.regime} khuyến nghị PAUSE.` : undefined,
  ].filter(Boolean) as string[];

  const holdReasons = [
    decision?.holdReason,
    decision?.stage === "BLOCKED" ? "AUTO đang bật nhưng decision engine đang chặn lệnh." : undefined,
    "Quy tắc sideway: BE tại +6 giá; +10 giá chốt 1/3 vị thế.",
    `MT5 panel chỉ đọc: ORDER ${data?.decision?.safety?.mt5PanelOrderPermission ?? "NONE"}.`,
  ].filter(Boolean) as string[];

  return (
    <Stack spacing={2.2}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5} alignItems={{ md: "center" }}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={900}>TÍN HIỆU & QUYẾT ĐỊNH</Typography>
          <Typography variant="h4" fontWeight={950}>Điều kiện tín hiệu</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>Đồng bộ với panel MT5: Entry, TP, Stoploss, lý do vào lệnh và lý do giữ/chờ lệnh.</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label={modeDisplay(mode, effective)} color={mode === "AUTO" ? "success" : "warning"} sx={{ fontWeight: 900 }} />
          <Chip label={decision?.stage ?? "ĐANG CHỜ"} color={decision?.stage === "BLOCKED" ? "warning" : decision?.stage === "READY" ? "success" : "default"} variant="outlined" sx={{ fontWeight: 900 }} />
          <Chip label={`CONF ${dash(regime?.confidence ?? diag?.trend?.confidenceScore)}`} variant="outlined" sx={{ fontWeight: 900 }} />
        </Stack>
      </Stack>

      {data?.errors.length ? <Alert severity="warning">Một vài nguồn dữ liệu chưa sẵn sàng: {data.errors.slice(0, 2).join(" · ")}</Alert> : null}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 3 }}><GateCard label="GIÁ XAUUSD" value={num(mid)} detail={`Bid ${num(quote?.bid)} · Ask ${num(quote?.ask)}`} ok={mid !== null} /></Grid>
        <Grid size={{ xs: 12, md: 3 }}><GateCard label="REGIME" value={dash(regime?.regime)} detail={`Khuyến nghị ${dash(regime?.recommendedMode)} · Conf ${dash(regime?.confidence)}`} ok={regime?.recommendedMode !== "PAUSE"} /></Grid>
        <Grid size={{ xs: 12, md: 3 }}><GateCard label="MÔ HÌNH" value={setupName(diag?.pattern?.name)} detail={`Hướng ${sideVi(diag?.pattern?.side)}`} ok={patternMatched} /></Grid>
        <Grid size={{ xs: 12, md: 3 }}><GateCard label="ENTRY GATE" value={entryEligible ? "ĐỦ ĐIỀU KIỆN" : waitPullback ? "CHỜ PULLBACK" : "CHỜ TÍN HIỆU"} detail={diag?.entry?.reason ?? decision?.entryReason ?? "Đang chờ setup hợp lệ."} ok={entryEligible} /></Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6" fontWeight={950}>Kế hoạch lệnh</Typography>
              <Grid container spacing={1.4} mt={1}>
                <Grid size={6}><Info label="Điểm vào" value={num(decision?.entry ?? diag?.entry?.referenceEntry)} /></Grid>
                <Grid size={6}><Info label="TP1" value={num(decision?.tp1)} /></Grid>
                <Grid size={6}><Info label="Stoploss" value={num(decision?.stopLoss)} /></Grid>
                <Grid size={6}><Info label="TP2" value={num(decision?.tp2)} /></Grid>
                <Grid size={6}><Info label="Khoảng SL" value={num(decision?.stopDistance ?? diag?.entry?.stopDistance ?? diag?.entry?.structuralStopDistance, " giá")} /></Grid>
                <Grid size={6}><Info label="Hướng" value={sideVi(decision?.side ?? diag?.entry?.side)} /></Grid>
                <Grid size={6}><Info label="Lot cuối" value={num(decision?.finalLot)} /></Grid>
                <Grid size={6}><Info label="Setup" value={setupName(decision?.setup ?? diag?.pattern?.name)} /></Grid>
                <Grid size={6}><Info label="Risk USD" value={num(decision?.estimatedRiskUsd, " USD")} /></Grid>
                <Grid size={6}><Info label="BE / Partial" value="+6 / +10 chốt 1/3" /></Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="h6" fontWeight={950}>Decision Summary</Typography>
              <Stack spacing={1.2} mt={1.2}>
                <Info label="Mode" value={modeDisplay(mode, effective)} />
                <Info label="Regime" value={`${dash(regime?.regime)} · Confidence ${dash(regime?.confidence)}`} />
                <Info label="Stage" value={dash(decision?.stage)} />
                <Info label="Strategy" value={dash(decision?.strategy)} />
                <Info label="Supply/Demand range" value={regime?.supplyDemandRange ? "Có" : "Không"} />
                <Info label="Panel permission" value={`ORDER ${data?.decision?.safety?.mt5PanelOrderPermission ?? "NONE"}`} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}><ReasonPanel title="Lý do vào lệnh" lines={entryReasons.length ? entryReasons : ["Chưa có setup hợp lệ để vào lệnh."]} /></Grid>
        <Grid size={{ xs: 12, lg: 6 }}><ReasonPanel title="Lý do giữ / chờ lệnh" lines={holdReasons.length ? holdReasons : ["Không có vị thế đang quản lý.", "Panel MT5 chỉ đọc, không có quyền gửi lệnh."]} /></Grid>
      </Grid>
    </Stack>
  );
}
