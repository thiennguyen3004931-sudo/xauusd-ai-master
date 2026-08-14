import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import CandlestickChartRounded from "@mui/icons-material/CandlestickChartRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import ScheduleRounded from "@mui/icons-material/ScheduleRounded";
import ShowChartRounded from "@mui/icons-material/ShowChartRounded";
import { useQuery } from "@tanstack/react-query";
import { dateTime, price } from "../format";
import { ErrorState, LoadingState } from "../ui/PageState";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

type Side = "BUY" | "SELL";
type EntryDiagnostics = {
  source: string;
  closeTime: number;
  nextCloseTime: number;
  bar: { open: number; high: number; low: number; close: number };
  pattern: {
    matched: boolean;
    name: "ENGULFING" | "TWO_CANDLE_BODY_DOMINANCE" | null;
    side: Side | null;
    extreme: number | null;
  };
  trend: {
    m15Supertrend: Side | null;
    m5Supertrend: Side | null;
    m5FlipAgeBars: number | null;
    m5FreshAligned: boolean;
    matchedPatternSide: boolean;
    ma20?: number;
    ma50?: number;
    ma200?: number;
  };
  fvg: {
    buyConfirmed: boolean;
    sellConfirmed: boolean;
    sameDirectionConfirmed: boolean;
    requiredForEntry: false;
  };
  entry: {
    eligible: boolean;
    side: Side | null;
    rule: string;
    referenceEntry: number;
    structuralStopDistance: number | null;
    stopDistance: number | null;
    reason: string;
  };
};

type Snapshot = {
  readOnly: true;
  generatedAt: number;
  botStatus: string;
  runtime?: { alive?: boolean; armed?: boolean; heartbeatAgeMs?: number | null };
  strategy?: {
    name?: string;
    trigger?: string;
    trend?: string;
    fvg?: string;
    initialStop?: string;
    plus6?: string;
    plus10?: string;
    runner?: string;
  };
  entryDiagnostics: EntryDiagnostics | null;
  entryDiagnosticsError?: string | null;
  mt5?: {
    quote?: { bid?: number; ask?: number; timestamp?: number } | null;
    health?: { accountMode?: string; accountLogin?: number | null; server?: string | null } | null;
    positions?: Array<{ ticket?: string; side?: string; entry?: number; stopLoss?: number; volume?: number; profit?: number }>;
  };
};

async function getSnapshot(): Promise<Snapshot> {
  const response = await fetch(`${API_BASE}/api/v1/phase7b-demo`, { cache: "no-store" });
  const text = await response.text();
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {}
    throw new Error(message);
  }
  return JSON.parse(text) as Snapshot;
}

function StatusCard({
  label,
  value,
  pass,
  detail,
}: {
  label: string;
  value: string;
  pass: boolean | null;
  detail: string;
}) {
  const color = pass === true ? "success" : pass === false ? "warning" : "default";
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
          <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
          <Chip size="small" label={pass === true ? "PASS" : pass === false ? "WAIT" : "INFO"} color={color} variant="outlined" />
        </Stack>
        <Typography variant="h6" fontWeight={900} mt={1}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{detail}</Typography>
      </CardContent>
    </Card>
  );
}

function secondsLabel(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function Phase7BPatternCheckPage() {
  const [now, setNow] = useState(Date.now());
  const query = useQuery({
    queryKey: ["phase7b-live-entry-gate"],
    queryFn: getSnapshot,
    refetchInterval: 5_000,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const data = query.data;
  const diagnostics = data?.entryDiagnostics ?? null;
  const remainingMs = diagnostics ? diagnostics.nextCloseTime - now : 0;
  const progress = useMemo(() => {
    if (!diagnostics) return 0;
    const barMs = 15 * 60_000;
    return Math.max(0, Math.min(100, ((barMs - remainingMs) / barMs) * 100));
  }, [diagnostics, remainingMs]);

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !data) {
    return <ErrorState message={query.error instanceof Error ? query.error.message : "Không đọc được Live Entry Gate."} />;
  }

  if (!diagnostics) {
    return <ErrorState message={data.entryDiagnosticsError ?? "Entry diagnostics chưa sẵn sàng."} />;
  }

  const patternSide = diagnostics.pattern.side;
  const wanted = patternSide;
  const m15Pass = Boolean(wanted && diagnostics.trend.m15Supertrend === wanted);
  const m5Pass = Boolean(wanted && diagnostics.trend.m5Supertrend === wanted && diagnostics.trend.m5FreshAligned);
  const fvgText = diagnostics.fvg.sameDirectionConfirmed ? "CÓ FVG CÙNG HƯỚNG" : "KHÔNG CÓ / KHÔNG BẮT BUỘC";
  const quote = data.mt5?.quote;
  const mid = quote?.bid !== undefined && quote?.ask !== undefined ? (Number(quote.bid) + Number(quote.ask)) / 2 : null;
  const spread = quote?.bid !== undefined && quote?.ask !== undefined ? Number(quote.ask) - Number(quote.bid) : null;
  const livePosition = data.mt5?.positions?.[0] ?? null;

  return (
    <Stack spacing={2}>
      <Alert severity="info" icon={<CandlestickChartRounded />}>
        <b>Forward DEMO entry:</b> Engulfing hoặc Two-candle → Supertrend M15 cùng hướng → M5 cùng hướng với fresh flip trong tối đa 2 nến đóng. FVG chỉ là context, không chặn entry. MA/EMA không dùng để xác nhận vào lệnh.
      </Alert>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={800}>XAUUSD · DEMO LIVE</Typography>
                  <Typography variant="h4" fontWeight={950}>{mid === null ? "—" : price(mid)}</Typography>
                </Box>
                <Chip label={data.botStatus} color={data.botStatus === "MANAGING" ? "warning" : data.botStatus === "WAITING_SIGNAL" ? "success" : "default"} />
              </Stack>
              <Stack direction="row" spacing={3} mt={2}>
                <Box><Typography variant="caption" color="text.secondary">Bid</Typography><Typography fontWeight={800}>{quote?.bid === undefined ? "—" : price(Number(quote.bid))}</Typography></Box>
                <Box><Typography variant="caption" color="text.secondary">Ask</Typography><Typography fontWeight={800}>{quote?.ask === undefined ? "—" : price(Number(quote.ask))}</Typography></Box>
                <Box><Typography variant="caption" color="text.secondary">Spread</Typography><Typography fontWeight={800}>{spread === null ? "—" : price(spread)}</Typography></Box>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
                DEMO #{data.mt5?.health?.accountLogin ?? "—"} · {data.mt5?.health?.server ?? "—"}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center"><ScheduleRounded color="primary" /><Typography variant="caption" color="text.secondary" fontWeight={800}>M15 CANDLE</Typography></Stack>
              <Typography variant="h4" fontWeight={950} mt={1}>{secondsLabel(remainingMs)}</Typography>
              <Typography variant="caption" color="text.secondary">đến nến đóng tiếp theo</Typography>
              <LinearProgress variant="determinate" value={progress} sx={{ mt: 2, height: 8, borderRadius: 99 }} />
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>Nến vừa đóng: {dateTime(diagnostics.closeTime)}</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card variant="outlined" sx={{ height: "100%", borderColor: diagnostics.entry.eligible ? "success.main" : undefined }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Stack direction="row" spacing={1} alignItems="center"><CheckCircleRounded color={diagnostics.entry.eligible ? "success" : "disabled"} /><Typography variant="caption" color="text.secondary" fontWeight={800}>ENTRY STATUS</Typography></Stack>
                <Chip label={diagnostics.entry.eligible ? `${diagnostics.entry.side} READY` : "WAIT SIGNAL"} color={diagnostics.entry.eligible ? "success" : "default"} />
              </Stack>
              <Typography variant="body1" fontWeight={900} mt={2}>{diagnostics.entry.reason}</Typography>
              <Stack direction="row" spacing={2} mt={2} flexWrap="wrap" useFlexGap>
                <Typography variant="caption">Entry ref: <b>{price(diagnostics.entry.referenceEntry)}</b></Typography>
                <Typography variant="caption">SL distance: <b>{diagnostics.entry.stopDistance === null ? "—" : `${price(diagnostics.entry.stopDistance)} giá`}</b></Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Typography variant="h6" fontWeight={900}>Entry Gate · nến M15 vừa đóng</Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}><StatusCard label="1 · PATTERN" value={diagnostics.pattern.name ?? "NONE"} pass={diagnostics.pattern.matched} detail={diagnostics.pattern.side ? `Hướng ${diagnostics.pattern.side}` : "Chờ Engulfing / Two-candle"} /></Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}><StatusCard label="2 · M15 SUPERTREND" value={diagnostics.trend.m15Supertrend ?? "—"} pass={wanted ? m15Pass : null} detail={wanted ? `Cần cùng hướng ${wanted}` : "Chỉ đánh giá khi có pattern"} /></Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}><StatusCard label="3 · M5 FRESH ALIGNMENT" value={diagnostics.trend.m5Supertrend ?? "—"} pass={wanted ? m5Pass : null} detail={diagnostics.trend.m5FlipAgeBars === null ? "Chưa có fresh flip phù hợp" : `Flip age ${diagnostics.trend.m5FlipAgeBars} bar · yêu cầu ≤ 1 (M5_FLIP_2)`} /></Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}><StatusCard label="4 · FVG CONTEXT" value={fvgText} pass={null} detail="Context only · không phải entry gate" /></Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center"><ShowChartRounded color="primary" /><Typography variant="h6" fontWeight={900}>M15 OHLC</Typography></Stack>
              <Grid container spacing={2} mt={0.5}>
                <Grid size={3}><Typography variant="caption" color="text.secondary">Open</Typography><Typography fontWeight={800}>{price(diagnostics.bar.open)}</Typography></Grid>
                <Grid size={3}><Typography variant="caption" color="text.secondary">High</Typography><Typography fontWeight={800}>{price(diagnostics.bar.high)}</Typography></Grid>
                <Grid size={3}><Typography variant="caption" color="text.secondary">Low</Typography><Typography fontWeight={800}>{price(diagnostics.bar.low)}</Typography></Grid>
                <Grid size={3}><Typography variant="caption" color="text.secondary">Close</Typography><Typography fontWeight={800}>{price(diagnostics.bar.close)}</Typography></Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" fontWeight={900}>Forward Management</Typography>
              <Stack direction="row" spacing={1} mt={1.5} flexWrap="wrap" useFlexGap>
                <Chip label="SL 6–10 giá" variant="outlined" />
                <Chip label="+6 → BE" color="success" variant="outlined" />
                <Chip label="+10 → chốt 1/3" color="primary" variant="outlined" />
                <Chip label="2/3 → canonical runner" variant="outlined" />
                <Chip label="H1/H4 = context" variant="outlined" />
              </Stack>
              {livePosition && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  Đang quản lý position {String(livePosition.ticket ?? "")} · {String(livePosition.side ?? "")} · {String(livePosition.volume ?? "")} lot · Entry {livePosition.entry === undefined ? "—" : price(Number(livePosition.entry))}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
