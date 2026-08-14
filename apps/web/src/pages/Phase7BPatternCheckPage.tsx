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
import { useQuery } from "@tanstack/react-query";
import { dateTime, price } from "../format";
import { ErrorState, LoadingState } from "../ui/PageState";

type Side = "BUY" | "SELL";
type EntryDiagnostics = {
  closeTime: number;
  nextCloseTime: number;
  pattern: { matched: boolean; name: string | null; side: Side | null };
  trend: {
    m15Supertrend: Side | null;
    m5Supertrend: Side | null;
    m5FlipAgeBars: number | null;
    m5FreshAligned: boolean;
  };
  fvg: { sameDirectionConfirmed: boolean; requiredForEntry: false };
  entry: {
    eligible: boolean;
    side: Side | null;
    referenceEntry: number;
    stopDistance: number | null;
    reason: string;
  };
};

type Snapshot = {
  botStatus: string;
  entryDiagnostics: EntryDiagnostics | null;
  entryDiagnosticsError?: string | null;
  mt5?: {
    quote?: { bid?: number; ask?: number } | null;
    health?: { accountMode?: string; accountLogin?: number | null; server?: string | null } | null;
  };
};

async function getSnapshot(): Promise<Snapshot> {
  const response = await fetch("/api/v1/phase7b-demo", { cache: "no-store" });
  const text = await response.text();
  if (!response.ok) {
    try {
      const parsed = JSON.parse(text) as { error?: string };
      throw new Error(parsed.error || `HTTP ${response.status}`);
    } catch (error) {
      if (error instanceof Error && error.message !== text) throw error;
      throw new Error(text || `HTTP ${response.status}`);
    }
  }
  return JSON.parse(text) as Snapshot;
}

function GateCard({ label, value, status, detail }: { label: string; value: string; status: "PASS" | "WAIT" | "INFO"; detail: string }) {
  const color = status === "PASS" ? "success" : status === "WAIT" ? "warning" : "default";
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
          <Typography variant="caption" color="text.secondary" fontWeight={900}>{label}</Typography>
          <Chip size="small" label={status} color={color} variant="outlined" />
        </Stack>
        <Typography variant="h6" fontWeight={950} mt={1}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{detail}</Typography>
      </CardContent>
    </Card>
  );
}

function countdown(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function Phase7BPatternCheckPage() {
  const [now, setNow] = useState(Date.now());
  const query = useQuery({ queryKey: ["phase7b-live-entry-gate"], queryFn: getSnapshot, refetchInterval: 3_000, retry: false });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const d = query.data?.entryDiagnostics ?? null;
  const remainingMs = d ? d.nextCloseTime - now : 0;
  const progress = useMemo(() => d ? Math.max(0, Math.min(100, ((15 * 60_000 - remainingMs) / (15 * 60_000)) * 100)) : 0, [d, remainingMs]);

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState message={query.error instanceof Error ? query.error.message : "Không đọc được Live Entry Gate."} />;
  if (!d) return <ErrorState message={query.data.entryDiagnosticsError ?? "Entry diagnostics chưa sẵn sàng."} />;

  const wanted = d.pattern.side;
  const m15Pass = Boolean(wanted && d.trend.m15Supertrend === wanted);
  const m5Pass = Boolean(wanted && d.trend.m5Supertrend === wanted && d.trend.m5FreshAligned);
  const quote = query.data.mt5?.quote;
  const mid = quote?.bid !== undefined && quote?.ask !== undefined ? (Number(quote.bid) + Number(quote.ask)) / 2 : null;

  return (
    <Stack spacing={2.2}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5} alignItems={{ md: "center" }}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={900}>ENTRY CHECK</Typography>
          <Typography variant="h4" fontWeight={950}>Live Entry Gate</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>Chỉ dùng dữ liệu nến đã đóng.</Typography>
        </Box>
        <Chip label={d.entry.eligible ? `${d.entry.side} READY` : "WAIT SIGNAL"} color={d.entry.eligible ? "success" : "default"} sx={{ fontWeight: 900 }} />
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined"><CardContent>
            <Typography variant="caption" color="text.secondary" fontWeight={900}>XAUUSD</Typography>
            <Typography variant="h4" fontWeight={950}>{mid === null ? "—" : price(mid)}</Typography>
            <Typography variant="caption" color="text.secondary">Bid {quote?.bid === undefined ? "—" : price(Number(quote.bid))} · Ask {quote?.ask === undefined ? "—" : price(Number(quote.ask))}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined"><CardContent>
            <Typography variant="caption" color="text.secondary" fontWeight={900}>M15 CLOSE IN</Typography>
            <Typography variant="h4" fontWeight={950}>{countdown(remainingMs)}</Typography>
            <LinearProgress value={progress} variant="determinate" sx={{ mt: 1.5, height: 7, borderRadius: 99 }} />
            <Typography variant="caption" color="text.secondary" display="block" mt={1}>Nến vừa đóng: {dateTime(d.closeTime)}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ borderColor: d.entry.eligible ? "success.main" : undefined }}><CardContent>
            <Typography variant="caption" color="text.secondary" fontWeight={900}>ENTRY PREVIEW</Typography>
            <Typography variant="h6" fontWeight={950}>{d.entry.eligible ? `${d.entry.side} READY` : "WAIT"}</Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>Entry {price(d.entry.referenceEntry)} · SL {d.entry.stopDistance === null ? "—" : `${d.entry.stopDistance.toFixed(2)} giá`}</Typography>
          </CardContent></Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <GateCard label="1 · PATTERN" value={d.pattern.name?.replaceAll("_", " ") ?? "NONE"} status={d.pattern.matched ? "PASS" : "WAIT"} detail={d.pattern.side ? `Hướng ${d.pattern.side}` : "Chờ Engulfing / Two-candle"} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <GateCard label="2 · SUPERTREND M15" value={d.trend.m15Supertrend ?? "—"} status={wanted ? (m15Pass ? "PASS" : "WAIT") : "INFO"} detail={wanted ? `Cần cùng hướng ${wanted}` : "Đánh giá khi có pattern"} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <GateCard label="3 · M5 FRESH FLIP" value={d.trend.m5Supertrend ?? "—"} status={wanted ? (m5Pass ? "PASS" : "WAIT") : "INFO"} detail={d.trend.m5FlipAgeBars === null ? "Chưa có fresh flip" : `Flip age ${d.trend.m5FlipAgeBars} bar · 2 nến đóng gần nhất`} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <GateCard label="4 · FVG" value={d.fvg.sameDirectionConfirmed ? "CONTEXT YES" : "CONTEXT NO"} status="INFO" detail="Không phải entry gate" />
        </Grid>
      </Grid>

      <Alert severity={d.entry.eligible ? "success" : "info"}>{d.entry.reason}</Alert>
      <Alert severity="info">Management: SL 6–10 giá · +6 → BE · +10 → chốt 1/3 · phần còn lại tiếp tục runner.</Alert>
    </Stack>
  );
}
