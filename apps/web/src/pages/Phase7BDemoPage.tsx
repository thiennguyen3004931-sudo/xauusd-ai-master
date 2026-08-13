import {
  Alert,
  Box,
  Card,
  CardContent,
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

type ManagedState = {
  ticket: string;
  side: "BUY" | "SELL";
  pattern: string;
  signalTimestamp: number;
  signalEntry: number;
  entry: number;
  initialVolume: number;
  expectedRemainingVolume: number;
  stopDistance: number;
  breakEvenApplied: boolean;
  partialApplied: boolean;
  partialActivatedAt: number | null;
  lastStructuralStop: number | null;
};

type BotState = {
  version: number;
  accountLogin: number | null;
  lastEvaluatedM15Close: number;
  managed: ManagedState | null;
};

type Position = {
  ticket: string;
  side: "LONG" | "SHORT";
  volume: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  profit: number;
  swap: number;
  openedAt: number;
};

type DemoEvent = {
  timestamp?: string;
  type?: string;
  [key: string]: unknown;
};

type Snapshot = {
  readOnly: boolean;
  botStatus: string;
  generatedAt: number;
  source: {
    demoDir: string | null;
    statePath: string | null;
    journalPath: string | null;
  };
  strategy: {
    name: string;
    trigger: string;
    trend: string;
    fvg: string;
    initialStop: string;
    plus6: string;
    plus10: string;
    runner: string;
    reversalExit: string;
  };
  state: BotState | null;
  latestEvent: DemoEvent | null;
  latestEventAt: number | null;
  activityAgeMs: number | null;
  recentEventCounts: Record<string, number>;
  recentEvents: DemoEvent[];
  mt5: {
    enabled: boolean;
    configured: boolean;
    reachable: boolean;
    status: string;
    message: string;
    checkedAt: number;
    health: {
      accountMode?: "demo" | "contest" | "real";
      server?: string;
      tradingEnabled?: boolean;
      terminalTradeAllowed?: boolean;
      expertTradeAllowed?: boolean;
      accountBalance?: number;
      accountEquity?: number;
      accountProfit?: number;
      accountCurrency?: string;
    } | null;
    quote: { bid: number; ask: number; spread: number } | null;
    positions: Position[];
    managedPosition: Position | null;
  };
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function getPhase7BDemo(): Promise<Snapshot> {
  const response = await fetch(`${API_BASE}/api/v1/phase7b-demo`, { cache: "no-store" });
  const payload = (await response.json()) as Snapshot | { error?: string };
  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : `HTTP ${response.status}`);
  }
  return payload as Snapshot;
}

export function Phase7BDemoPage() {
  const query = useQuery({
    queryKey: ["phase7b-demo"],
    queryFn: getPhase7BDemo,
    refetchInterval: 5_000,
    retry: false,
  });

  if (query.isLoading) return <LoadingState />;
  if (!query.data) {
    return <ErrorState message={query.error instanceof Error ? query.error.message : "Không đọc được Phase 7B DEMO."} />;
  }

  const data = query.data;
  const health = data.mt5.health;
  const managed = data.state?.managed ?? null;
  const position = data.mt5.managedPosition;
  const currency = health?.accountCurrency ?? "USD";
  const currentPrice = managed?.side === "BUY"
    ? data.mt5.quote?.bid
    : managed?.side === "SELL"
      ? data.mt5.quote?.ask
      : null;

  const currentGuardPass = Boolean(
    data.mt5.reachable &&
      health?.accountMode === "demo" &&
      health.tradingEnabled === true &&
      health.terminalTradeAllowed === true &&
      health.expertTradeAllowed === true,
  );
  const failures = guardFailures(data);

  return (
    <Stack spacing={2}>
      <Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Typography variant="overline" color="primary" fontWeight={800}>PHASE 7B FORWARD</Typography>
          <StatusChip value="DEMO" />
          <StatusChip value={data.botStatus} />
          <StatusChip value={currentGuardPass ? "GUARD PASS" : "GUARD BLOCKED"} />
          <StatusChip value="READ ONLY" />
        </Stack>
        <Typography variant="h5" fontWeight={800}>Phase 7B Demo Monitor</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Theo dõi tài khoản DEMO, trạng thái bot, lệnh đang gồng và nhật ký quản lý lệnh. Trang này không có nút đặt, sửa hoặc đóng lệnh.
        </Typography>
      </Box>

      {health?.accountMode === "real" ? (
        <Alert severity="error">REAL account detected. Không sử dụng Phase 7B DEMO trên tài khoản này.</Alert>
      ) : (
        <Alert severity="info">
          Entry: Engulfing hoặc 2 nến cùng màu thắng thân nến ngược trước đó + MA20/50/200 đúng trend. FVG không còn bắt buộc để vào lệnh; FVG cùng hướng dùng để xác nhận giữ lệnh và phát add-on SHADOW, không tăng lot thật. +6 về Entry · +10 chốt 1/3 · runner theo cấu trúc M15.
        </Alert>
      )}

      <Alert severity={currentGuardPass ? "success" : "error"}>
        {currentGuardPass
          ? "CURRENT GUARD: PASS — MT5 DEMO đang kết nối, Bridge trading bật, Terminal Algo và Expert Trading đều được phép. Các DEMO_GUARD_BLOCK cũ bên dưới chỉ là lịch sử."
          : `CURRENT GUARD: BLOCKED — ${failures.length > 0 ? failures.join(" · ") : "chưa đủ điều kiện vận hành DEMO"}`}
      </Alert>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <MetricCard
            label="DEMO account"
            value={data.state?.accountLogin ? String(data.state.accountLogin) : "—"}
            detail={`${health?.accountMode?.toUpperCase() ?? "UNKNOWN"} · ${health?.server ?? "no server"}`}
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
            label="Bot state"
            value={data.botStatus}
            detail={data.latestEvent?.type ? `Gần nhất: ${eventLabel(data.latestEvent.type, currentGuardPass)}` : "Chưa có event"}
            icon={<SmartToyRounded color="primary" />}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <MetricCard
            label="Open P&L"
            value={money(position?.profit ?? health?.accountProfit ?? 0, currency)}
            detail={`${data.mt5.positions.length} XAUUSD position(s)`}
            icon={<ReceiptLongRounded color={position && position.profit >= 0 ? "success" : "primary"} />}
            tone={position ? (position.profit >= 0 ? "success.main" : "error.main") : "text.primary"}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, xl: 7 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" gap={2} alignItems="center">
                <Typography fontWeight={800}>Lệnh Phase 7B đang quản lý</Typography>
                <StatusChip value={managed ? managed.side : "NO POSITION"} />
              </Stack>

              {!managed ? (
                <Box className="mini-card" sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Chưa có lệnh do Phase 7B quản lý. Bot chờ cây M15 đóng đủ Pattern + MA20/50/200 đúng trend. FVG là xác nhận bổ sung, không chặn entry.
                  </Typography>
                </Box>
              ) : (
                <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
                  <Value label="Ticket" value={managed.ticket} />
                  <Value label="Pattern" value={managed.pattern.replaceAll("_", " ")} />
                  <Value label="Entry thực tế" value={price(position?.entry ?? managed.entry)} />
                  <Value label="Giá hiện tại" value={price(currentPrice ?? null)} />
                  <Value label="Volume còn lại" value={`${position?.volume ?? managed.expectedRemainingVolume} lot`} />
                  <Value label="SL hiện tại" value={price(position?.stopLoss ?? managed.lastStructuralStop)} />
                  <Value label="SL ban đầu" value={`${managed.stopDistance.toFixed(2)} giá`} />
                  <Value label="+6 → Entry" value={managed.breakEvenApplied ? "ĐÃ DỜI" : "CHƯA"} />
                  <Value label="+10 → chốt 1/3" value={managed.partialApplied ? "ĐÃ CHỐT" : "CHƯA"} />
                  <Value label="FVG add-on" value="SHADOW ONLY" />
                  <Value label="Runner" value={managed.partialApplied ? "STRUCTURE M15" : "CHỜ +10"} />
                  <Value label="Floating P&L" value={money(position?.profit ?? 0, currency)} />
                  <Value label="Signal time" value={safeDateTime(managed.signalTimestamp)} />
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, xl: 5 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" gap={2} alignItems="center">
                <Typography fontWeight={800}>DEMO / MT5 Guard</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="caption" color="text.secondary">CURRENT GUARD</Typography>
                  <StatusChip value={currentGuardPass ? "PASS" : "BLOCKED"} />
                </Stack>
              </Stack>
              <Stack spacing={1.2} sx={{ mt: 2 }}>
                <Info label="MT5 reachable" value={data.mt5.reachable ? "YES" : "NO"} />
                <Info label="Account mode" value={health?.accountMode?.toUpperCase() ?? "UNKNOWN"} />
                <Info label="Bridge trading" value={health?.tradingEnabled ? "ENABLED" : "DISABLED"} />
                <Info label="Terminal algo" value={health?.terminalTradeAllowed ? "ALLOWED" : "BLOCKED"} />
                <Info label="Expert trading" value={health?.expertTradeAllowed ? "ALLOWED" : "BLOCKED"} />
                <Info label="Balance" value={health?.accountBalance === undefined ? "—" : money(health.accountBalance, currency)} />
                <Info label="Equity" value={health?.accountEquity === undefined ? "—" : money(health.accountEquity, currency)} />
                <Info label="Last M15 evaluated" value={safeDateTime(data.state?.lastEvaluatedM15Close ?? null)} />
                <Info label="Latest journal event" value={data.latestEventAt ? safeDateTime(data.latestEventAt) : "—"} />
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2, lineHeight: 1.6 }}>
                {data.mt5.message}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography fontWeight={800}>Rule đang chạy</Typography>
          <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
            <Value label="Trigger" value="Engulfing OR Two-candle body dominance" />
            <Value label="Trend" value="MA20 > MA50 > MA200 / reverse SELL" />
            <Value label="Entry gate" value="Pattern + MA" />
            <Value label="FVG" value="Optional entry · HOLD + ADD-ON SHADOW" />
            <Value label="Add-on thật" value="OFF" />
            <Value label="DCA khi âm" value="OFF" />
            <Value label="Initial SL" value="6–10 giá" />
            <Value label="+6" value="SL → Entry" />
            <Value label="+10" value="Close 1/3" />
            <Value label="Runner" value="M15 swing structure" />
            <Value label="Reversal exit" value="Opposing FVG + rejection sau +10" />
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
            <Box>
              <Typography fontWeight={800}>Nhật ký Phase 7B DEMO</Typography>
              <Typography variant="caption" color="text.secondary">
                40 event gần nhất · mới nhất ở trên · event cũ không đại diện cho guard hiện tại
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">Polling 5s</Typography>
          </Stack>
          <TableContainer sx={{ mt: 2, maxHeight: 520 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Thời gian</TableCell>
                  <TableCell>Sự kiện</TableCell>
                  <TableCell>Chi tiết</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.recentEvents.length === 0 ? (
                  <TableRow><TableCell colSpan={3}>Chưa có journal event.</TableCell></TableRow>
                ) : data.recentEvents.map((event, index) => {
                  const historicalGuardBlock = event.type === "DEMO_GUARD_BLOCK" && currentGuardPass;
                  return (
                    <TableRow key={`${event.timestamp ?? "event"}-${index}`} hover>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {event.timestamp ? safeDateTime(Date.parse(event.timestamp)) : "—"}
                      </TableCell>
                      <TableCell>
                        <Stack spacing={0.5} alignItems="flex-start">
                          <Typography variant="caption" fontWeight={800}>
                            {eventLabel(event.type, currentGuardPass)}
                          </Typography>
                          <Typography variant="caption" color="text.disabled">
                            {String(event.type ?? "UNKNOWN")}
                          </Typography>
                          {historicalGuardBlock ? <StatusChip value="HISTORY" /> : null}
                          {event.type === "FVG_ADDON_SIGNAL_SHADOW" ? <StatusChip value="SHADOW ONLY" /> : null}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace", overflowWrap: "anywhere" }}>
                          {eventDetails(event)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Typography variant="caption" color="text.secondary">
        Data source: {data.source.demoDir ?? "Phase 7B demo workdir chưa được tìm thấy"} · snapshot {safeDateTime(data.generatedAt)}
      </Typography>
    </Stack>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return (
    <Grid size={{ xs: 12, sm: 6, md: 4 }}>
      <Box className="mini-card" sx={{ height: "100%" }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography fontWeight={800} sx={{ mt: 0.5, overflowWrap: "anywhere" }}>{value}</Typography>
      </Box>
    </Grid>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" gap={2}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="caption" fontWeight={800} textAlign="right">{value}</Typography>
    </Stack>
  );
}

function safeDateTime(timestamp: number | null): string {
  return timestamp && Number.isFinite(timestamp) ? dateTime(timestamp) : "—";
}

function eventLabel(type: unknown, currentGuardPass: boolean): string {
  const value = String(type ?? "UNKNOWN");
  const labels: Record<string, string> = {
    M15_NO_ENTRY_SIGNAL: "Không có tín hiệu Pattern + MA trên M15",
    ENTRY_SUBMIT: "Đã gửi lệnh vào MT5",
    ENTRY_FILLED: "Đã khớp lệnh",
    ENTRY_REJECTED: "Lệnh bị từ chối",
    ENTRY_ACCEPTED_POSITION_NOT_RESOLVED: "Lệnh đã nhận nhưng chưa xác định được vị thế",
    SIGNAL_EXPIRED: "Tín hiệu đã hết hạn",
    INITIAL_SL_BROKER_DISTANCE_BLOCK: "SL ban đầu không đạt khoảng cách broker",
    FVG_HOLD_CONFIRMED: "FVG cùng hướng xác nhận giữ lệnh",
    FVG_ADDON_SIGNAL_SHADOW: "FVG phát tín hiệu add-on SHADOW",
    PLUS6_SL_TO_ENTRY: "Đã dời SL về Entry tại +6",
    PLUS6_SL_REJECTED: "Dời SL về Entry bị từ chối",
    PLUS10_PARTIAL_ONE_THIRD: "Đã chốt 1/3 tại +10",
    PLUS10_PARTIAL_REJECTED: "Chốt 1/3 tại +10 bị từ chối",
    PLUS10_PARTIAL_NOT_FEASIBLE: "Không thể chốt 1/3 theo bước lot broker",
    STRUCTURAL_SL_TIGHTEN: "Đã siết SL theo cấu trúc M15",
    STRUCTURAL_SL_REJECTED: "Siết SL cấu trúc bị từ chối",
    EXIT_EXECUTED: "Đã đóng lệnh",
    EXIT_REJECTED: "Đóng lệnh bị từ chối",
    MANAGED_POSITION_CLOSED: "Vị thế bot quản lý đã đóng",
    UNMANAGED_POSITION_PRESENT: "Phát hiện vị thế XAUUSD ngoài bot",
    UNEXPECTED_ADDITIONAL_POSITION: "Phát hiện thêm vị thế ngoài dự kiến",
    MANAGED_POSITION_SIDE_MISMATCH: "Sai lệch hướng vị thế đang quản lý",
    MANAGED_POSITION_VOLUME_MISMATCH: "Sai lệch volume vị thế đang quản lý",
    DEMO_GUARD_BLOCK: currentGuardPass ? "Guard chặn trước đây (lịch sử)" : "Guard đang chặn giao dịch DEMO",
    CYCLE_ERROR: "Lỗi chu kỳ bot",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function guardFailures(data: Snapshot): string[] {
  const health = data.mt5.health;
  const failures: string[] = [];
  if (!data.mt5.reachable) failures.push("MT5 không reachable");
  if (health?.accountMode !== "demo") failures.push(`account mode ${health?.accountMode ?? "UNKNOWN"} không phải DEMO`);
  if (health?.tradingEnabled !== true) failures.push("Bridge trading chưa bật");
  if (health?.terminalTradeAllowed !== true) failures.push("Terminal Algo Trading đang BLOCKED");
  if (health?.expertTradeAllowed !== true) failures.push("Expert Trading đang BLOCKED");
  return failures;
}

function eventDetails(event: DemoEvent): string {
  const { timestamp: _timestamp, type: _type, ...details } = event;
  const text = JSON.stringify(details);
  return text === "{}" ? "—" : text;
}
