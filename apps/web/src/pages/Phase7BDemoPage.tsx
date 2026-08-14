import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import AccountCircleRounded from "@mui/icons-material/AccountCircleRounded";
import CandlestickChartRounded from "@mui/icons-material/CandlestickChartRounded";
import ReceiptLongRounded from "@mui/icons-material/ReceiptLongRounded";
import SmartToyRounded from "@mui/icons-material/SmartToyRounded";
import { useQuery } from "@tanstack/react-query";
import { dateTime, money, price } from "../format";
import { ErrorState, LoadingState } from "../ui/PageState";
import { MetricCard } from "../ui/MetricCard";
import { StatusChip } from "../ui/StatusChip";

type Side = "BUY" | "SELL";

type ManagedState = {
  ticket: string;
  side: Side;
  pattern: string;
  signalTimestamp: number;
  entry: number;
  initialVolume: number;
  expectedRemainingVolume: number;
  stopDistance: number;
  breakEvenApplied: boolean;
  partialApplied: boolean;
  lastStructuralStop: number | null;
};

type EntryDiagnostics = {
  closeTime: number;
  nextCloseTime: number;
  pattern: { matched: boolean; name: string | null; side: Side | null };
  trend: {
    m15Supertrend?: Side | null;
    m5Supertrend?: Side | null;
    m5FlipAgeBars?: number | null;
    m5FreshAligned?: boolean;
    matchedPatternSide: boolean;
  };
  fvg: { sameDirectionConfirmed: boolean; requiredForEntry: false };
  entry: {
    eligible: boolean;
    side: Side | null;
    rule: string;
    referenceEntry: number;
    stopDistance: number | null;
    reason: string;
  };
};

type Position = {
  ticket: string;
  side: "LONG" | "SHORT";
  volume: number;
  entry: number;
  stopLoss: number;
  profit: number;
};

type DemoEvent = {
  timestamp?: string;
  type?: string;
  side?: string;
  pattern?: string;
  [key: string]: unknown;
};

type Snapshot = {
  botStatus: string;
  generatedAt: number;
  runtime: { armed?: boolean; alive?: boolean; pid?: number | null } | null;
  entryDiagnostics: EntryDiagnostics | null;
  entryDiagnosticsError?: string | null;
  state: {
    accountLogin: number | null;
    managed: ManagedState | null;
  } | null;
  recentEvents: DemoEvent[];
  mt5: {
    reachable: boolean;
    health: {
      accountMode?: "demo" | "contest" | "real";
      accountLogin?: number | null;
      server?: string;
      tradingEnabled?: boolean;
      terminalTradeAllowed?: boolean;
      expertTradeAllowed?: boolean;
      accountProfit?: number;
      accountCurrency?: string;
    } | null;
    quote: { bid: number; ask: number; spread: number } | null;
    positions: Position[];
    managedPosition: Position | null;
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

function eventLabel(type?: string) {
  const labels: Record<string, string> = {
    ENTRY_SUBMIT: "Gửi lệnh",
    ENTRY_FILLED: "Khớp lệnh",
    ENTRY_REJECTED: "Từ chối entry",
    PLUS6_SL_TO_ENTRY: "+6 → BE",
    PLUS10_PARTIAL_ONE_THIRD: "+10 → chốt 1/3",
    STRUCTURAL_SL_TIGHTEN: "Dời SL",
    EXIT_EXECUTED: "Đóng lệnh",
    MANAGED_POSITION_CLOSED: "Position đã đóng",
    DEMO_GUARD_BLOCK: "DEMO guard block",
    CYCLE_ERROR: "Lỗi controller",
  };
  return labels[type ?? ""] ?? String(type ?? "—").replaceAll("_", " ");
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography fontWeight={850}>{value}</Typography>
    </Box>
  );
}

export function Phase7BDemoPage() {
  const query = useQuery({
    queryKey: ["phase7b-demo-simple"],
    queryFn: getSnapshot,
    refetchInterval: 3_000,
    retry: false,
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) {
    return <ErrorState message={query.error instanceof Error ? query.error.message : "Không đọc được Forward Monitor."} />;
  }

  const data = query.data;
  const health = data.mt5.health;
  const managed = data.state?.managed ?? null;
  const position = data.mt5.managedPosition;
  const diagnostics = data.entryDiagnostics;
  const currency = health?.accountCurrency ?? "USD";
  const currentPrice = managed?.side === "BUY" ? data.mt5.quote?.bid : managed?.side === "SELL" ? data.mt5.quote?.ask : null;
  const botAlive = Boolean(data.runtime?.alive && data.runtime?.armed);
  const guardPass = Boolean(
    data.mt5.reachable &&
    health?.accountMode === "demo" &&
    health?.tradingEnabled === true &&
    health?.terminalTradeAllowed === true &&
    health?.expertTradeAllowed === true,
  );
  const recent = data.recentEvents.slice(0, 12);

  return (
    <Stack spacing={2.2}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5} alignItems={{ md: "center" }}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={900}>XAUUSD · DEMO FORWARD</Typography>
          <Typography variant="h4" fontWeight={950}>Forward Monitor</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>Theo dõi bot DEMO, tín hiệu và lệnh đang quản lý.</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <StatusChip value={botAlive ? data.botStatus : "BOT STOPPED"} />
          <StatusChip value={guardPass ? "DEMO READY" : "DEMO BLOCKED"} />
        </Stack>
      </Stack>

      {health?.accountMode === "real" && <Alert severity="error">REAL account detected — Bot DEMO bị khóa.</Alert>}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <MetricCard
            label="DEMO account"
            value={String(health?.accountLogin ?? data.state?.accountLogin ?? "—")}
            detail={`${health?.server ?? "—"}`}
            icon={<AccountCircleRounded color="primary" />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <MetricCard
            label="XAUUSD"
            value={price(data.mt5.quote?.bid ?? null)}
            detail={`Ask ${price(data.mt5.quote?.ask ?? null)} · spread ${price(data.mt5.quote?.spread ?? null)}`}
            icon={<CandlestickChartRounded color="primary" />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <MetricCard
            label="Bot"
            value={botAlive ? data.botStatus : "STOPPED"}
            detail={botAlive ? `PID ${data.runtime?.pid ?? "—"}` : "Bật tại Bot & Telegram"}
            icon={<SmartToyRounded color="primary" />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <MetricCard
            label="Open P&L"
            value={money(position?.profit ?? health?.accountProfit ?? 0, currency)}
            detail={managed ? `${managed.side} · ${position?.volume ?? managed.expectedRemainingVolume} lot` : "No managed position"}
            icon={<ReceiptLongRounded color={position && position.profit >= 0 ? "success" : "primary"} />}
            tone={position ? (position.profit >= 0 ? "success.main" : "error.main") : "text.primary"}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, xl: 6 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                <Typography variant="h6" fontWeight={900}>Entry Gate</Typography>
                <Chip
                  label={diagnostics?.entry.eligible ? `${diagnostics.entry.side} READY` : "WAIT"}
                  color={diagnostics?.entry.eligible ? "success" : "default"}
                  variant="outlined"
                />
              </Stack>

              {!diagnostics ? (
                <Alert severity="warning" sx={{ mt: 2 }}>{data.entryDiagnosticsError ?? "Entry diagnostics chưa sẵn sàng."}</Alert>
              ) : (
                <>
                  <Grid container spacing={2} mt={0.3}>
                    <Grid size={6}><Info label="Pattern" value={diagnostics.pattern.name?.replaceAll("_", " ") ?? "NONE"} /></Grid>
                    <Grid size={6}><Info label="Hướng pattern" value={diagnostics.pattern.side ?? "—"} /></Grid>
                    <Grid size={6}><Info label="Supertrend M15" value={diagnostics.trend.m15Supertrend ?? "—"} /></Grid>
                    <Grid size={6}><Info label="Supertrend M5" value={diagnostics.trend.m5Supertrend ?? "—"} /></Grid>
                    <Grid size={6}><Info label="M5 flip age" value={diagnostics.trend.m5FlipAgeBars === null || diagnostics.trend.m5FlipAgeBars === undefined ? "—" : `${diagnostics.trend.m5FlipAgeBars} bar`} /></Grid>
                    <Grid size={6}><Info label="FVG context" value={diagnostics.fvg.sameDirectionConfirmed ? "YES" : "NO"} /></Grid>
                    <Grid size={6}><Info label="Entry ref" value={price(diagnostics.entry.referenceEntry)} /></Grid>
                    <Grid size={6}><Info label="SL dự kiến" value={diagnostics.entry.stopDistance === null ? "—" : `${diagnostics.entry.stopDistance.toFixed(2)} giá`} /></Grid>
                  </Grid>
                  <Alert severity={diagnostics.entry.eligible ? "success" : "info"} sx={{ mt: 2 }}>{diagnostics.entry.reason}</Alert>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, xl: 6 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                <Typography variant="h6" fontWeight={900}>Lệnh đang quản lý</Typography>
                <StatusChip value={managed ? managed.side : "NO POSITION"} />
              </Stack>

              {!managed ? (
                <Typography variant="body2" color="text.secondary" mt={2}>Chưa có lệnh. Bot chờ tín hiệu hợp lệ trên nến đóng.</Typography>
              ) : (
                <Grid container spacing={2} mt={0.3}>
                  <Grid size={6}><Info label="Ticket" value={managed.ticket} /></Grid>
                  <Grid size={6}><Info label="Pattern" value={managed.pattern.replaceAll("_", " ")} /></Grid>
                  <Grid size={6}><Info label="Entry" value={price(position?.entry ?? managed.entry)} /></Grid>
                  <Grid size={6}><Info label="Giá hiện tại" value={price(currentPrice ?? null)} /></Grid>
                  <Grid size={6}><Info label="Volume còn" value={`${position?.volume ?? managed.expectedRemainingVolume} lot`} /></Grid>
                  <Grid size={6}><Info label="SL hiện tại" value={price(position?.stopLoss ?? managed.lastStructuralStop)} /></Grid>
                  <Grid size={6}><Info label="+6 → BE" value={managed.breakEvenApplied ? "ĐÃ DỜI" : "CHƯA"} /></Grid>
                  <Grid size={6}><Info label="+10 → chốt 1/3" value={managed.partialApplied ? "ĐÃ CHỐT" : "CHƯA"} /></Grid>
                  <Grid size={12}><Info label="Floating P&L" value={money(position?.profit ?? 0, currency)} /></Grid>
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Alert severity={guardPass ? "success" : "warning"}>
        {guardPass
          ? "DEMO ready · Rule: Engulfing/Two-candle + Supertrend M15 + M5 fresh flip. FVG chỉ là context. +6 → BE · +10 → chốt 1/3."
          : "DEMO chưa đủ điều kiện. Kiểm tra MT5 Bridge / Algo Trading / Expert Trading."}
      </Alert>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" fontWeight={900}>Event gần đây</Typography>
          <TableContainer sx={{ mt: 1.5, maxHeight: 400 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow><TableCell>Thời gian</TableCell><TableCell>Sự kiện</TableCell><TableCell>Chi tiết</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {recent.length === 0 ? (
                  <TableRow><TableCell colSpan={3}>Chưa có event.</TableCell></TableRow>
                ) : recent.map((event, index) => (
                  <TableRow key={`${event.timestamp ?? "event"}-${index}`} hover>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{event.timestamp ? dateTime(Date.parse(event.timestamp)) : "—"}</TableCell>
                    <TableCell><Typography variant="body2" fontWeight={800}>{eventLabel(event.type)}</Typography></TableCell>
                    <TableCell><Typography variant="caption" color="text.secondary">{event.side ?? ""} {event.pattern ? String(event.pattern).replaceAll("_", " ") : ""}</Typography></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Stack>
  );
}
