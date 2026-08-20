import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
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
    confidenceM5Supertrend?: Side | null;
    m5FlipAgeBars?: number | null;
    matchedPatternSide: boolean;
  };
  fvg: { sameDirectionConfirmed: boolean; requiredForEntry: false };
  entry: {
    eligible: boolean;
    side: Side | null;
    rule: string;
    referenceEntry: number;
    structuralStopDistance: number | null;
    stopDistance: number | null;
    action: "WAIT_SIGNAL" | "ENTRY_IMMEDIATE" | "WAIT_PULLBACK";
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
  reason?: string;
  message?: string;
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
    pendingPullback?: {
      side: Side;
      pattern: string;
      signalTimestamp: number;
      expiresAt: number;
      structuralStopDistanceAtSignal: number;
    } | null;
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

function tenHuong(side: Side | null | undefined) {
  if (side === "BUY") return "MUA";
  if (side === "SELL") return "BÁN";
  return "—";
}

function tenMoHinh(name: string | null | undefined) {
  if (name === "ENGULFING") return "Nến nhấn chìm";
  if (name === "TWO_CANDLE_BODY_DOMINANCE") return "Hai nến thân chiếm ưu thế";
  return name ? name.replaceAll("_", " ") : "Chưa có mô hình";
}

function tenTrangThaiBot(status: string) {
  const map: Record<string, string> = {
    WAITING_SIGNAL: "ĐANG CHỜ TÍN HIỆU",
    WAITING_PULLBACK: "ĐANG CHỜ GIÁ HỒI",
    MANAGING: "ĐANG QUẢN LÝ LỆNH",
    READY_NOT_ARMED: "SẴN SÀNG · CHƯA BẬT BOT",
    BOT_STALE: "BOT MẤT HEARTBEAT",
    POSITION_NOT_MANAGED: "CÓ LỆNH NHƯNG BOT KHÔNG QUẢN LÝ",
    MT5_OFFLINE: "MT5 MẤT KẾT NỐI",
    NOT_CONFIGURED: "CHƯA CẤU HÌNH",
  };
  return map[status] ?? status.replaceAll("_", " ");
}

function eventLabel(type?: string) {
  const labels: Record<string, string> = {
    ENTRY_SUBMIT: "Gửi yêu cầu vào lệnh",
    ENTRY_FILLED: "Đã khớp lệnh",
    ENTRY_REJECTED: "Lệnh vào bị từ chối",
    PLUS6_SL_TO_ENTRY: "+6 giá → dời SL về hòa vốn",
    PLUS10_PARTIAL_ONE_THIRD: "+10 giá → chốt 1/3",
    STRUCTURAL_SL_TIGHTEN: "Siết dừng lỗ",
    EXIT_EXECUTED: "Đã đóng lệnh",
    MANAGED_POSITION_CLOSED: "Vị thế đã đóng",
    DEMO_GUARD_BLOCK: "Bộ bảo vệ DEMO chặn",
    CYCLE_ERROR: "Lỗi chu kỳ Bot",
    FVG_HOLD_CONFIRMED: "Bối cảnh FVG cùng hướng",
    WAIT_PULLBACK: "SL > 10 · bắt đầu chờ hồi",
    PULLBACK_STILL_TOO_WIDE: "Giá hồi chưa đủ để SL ≤ 10",
    PULLBACK_ENTRY: "Giá hồi đạt · gửi lệnh",
    PULLBACK_SETUP_INVALIDATED: "Hủy setup chờ hồi",
    PULLBACK_M15_ST_INVALIDATED: "Hủy chờ hồi · M15 đổi hướng",
    PULLBACK_M5_ST_INVALIDATED: "Hủy chờ hồi · M5 đổi hướng",
    PULLBACK_EXPIRED: "Setup chờ hồi hết hạn",
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

function ReasonLine({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <Typography variant="body2" fontWeight={700} color={ok ? "success.main" : "warning.main"}>
      {ok ? "✓" : "•"} {children}
    </Typography>
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
    return <ErrorState message={query.error instanceof Error ? query.error.message : "Không đọc được màn hình theo dõi giao dịch."} />;
  }

  const data = query.data;
  const health = data.mt5.health;
  const managed = data.state?.managed ?? null;
  const pendingPullback = data.state?.pendingPullback ?? null;
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
  const latestExit = data.recentEvents.find((event) => event.type === "EXIT_EXECUTED" || event.type === "MANAGED_POSITION_CLOSED");
  const currentM15Aligned = Boolean(managed && diagnostics?.trend.m15Supertrend === managed.side);
  const currentM5Aligned = Boolean(managed && diagnostics?.trend.confidenceM5Supertrend === managed.side);

  return (
    <Stack spacing={2.2}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5} alignItems={{ md: "center" }}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={900}>XAUUSD · CHẠY THỬ DEMO</Typography>
          <Typography variant="h4" fontWeight={950}>Tổng quan giao dịch</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>Tập trung vào trạng thái Bot, vị thế đang quản lý và lịch sử sự kiện. Điều kiện entry chi tiết được gom về trang Điều kiện tín hiệu.</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <StatusChip value={botAlive ? tenTrangThaiBot(data.botStatus) : "BOT ĐANG DỪNG"} />
          <StatusChip value={guardPass ? "DEMO SẴN SÀNG" : "DEMO BỊ CHẶN"} />
        </Stack>
      </Stack>

      {health?.accountMode === "real" && <Alert severity="error">Phát hiện tài khoản thật — Bot DEMO bị khóa hoàn toàn.</Alert>}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <MetricCard label="Tài khoản DEMO" value={String(health?.accountLogin ?? data.state?.accountLogin ?? "—")} detail={`${health?.server ?? "—"}`} icon={<AccountCircleRounded color="primary" />} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <MetricCard label="Giá XAUUSD" value={price(data.mt5.quote?.bid ?? null)} detail={`Ask ${price(data.mt5.quote?.ask ?? null)} · spread ${price(data.mt5.quote?.spread ?? null)}`} icon={<CandlestickChartRounded color="primary" />} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <MetricCard label="Trạng thái Bot" value={botAlive ? tenTrangThaiBot(data.botStatus) : "ĐANG DỪNG"} detail={botAlive ? `PID ${data.runtime?.pid ?? "—"}` : "Bật Bot tại trang Bot & Telegram"} icon={<SmartToyRounded color="primary" />} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <MetricCard label="Lãi/lỗ đang mở" value={money(position?.profit ?? health?.accountProfit ?? 0, currency)} detail={managed ? `${tenHuong(managed.side)} · ${position?.volume ?? managed.expectedRemainingVolume} lot` : "Không có lệnh đang quản lý"} icon={<ReceiptLongRounded color={position && position.profit >= 0 ? "success" : "primary"} />} tone={position ? (position.profit >= 0 ? "success.main" : "error.main") : "text.primary"} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>

        <Grid size={{ xs: 12 }}>
          <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                <Typography variant="h6" fontWeight={900}>Lệnh đang quản lý</Typography>
                <StatusChip value={managed ? tenHuong(managed.side) : "KHÔNG CÓ LỆNH"} />
              </Stack>

              {!managed ? (
                pendingPullback ? (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    Setup {tenHuong(pendingPullback.side)} bằng {tenMoHinh(pendingPullback.pattern)} có SL cấu trúc {pendingPullback.structuralStopDistanceAtSignal.toFixed(2)} giá. Bot không vào đuổi; đang chờ giá hồi để SL còn tối đa 10 giá, hết hạn lúc {dateTime(pendingPullback.expiresAt)}.
                  </Alert>
                ) : (
                  <Typography variant="body2" color="text.secondary" mt={2}>Chưa có lệnh. Bot chỉ vào khi toàn bộ điều kiện bắt buộc cùng đạt trên nến đã đóng; nếu SL cấu trúc vượt 10 giá thì chuyển sang chờ hồi trong M15 kế tiếp.</Typography>
                )
              ) : (
                <>
                  <Grid container spacing={2} mt={0.3}>
                    <Grid size={6}><Info label="Mã lệnh" value={managed.ticket} /></Grid>
                    <Grid size={6}><Info label="Mô hình đã kích hoạt" value={tenMoHinh(managed.pattern)} /></Grid>
                    <Grid size={6}><Info label="Giá vào" value={price(position?.entry ?? managed.entry)} /></Grid>
                    <Grid size={6}><Info label="Giá hiện tại" value={price(currentPrice ?? null)} /></Grid>
                    <Grid size={6}><Info label="Khối lượng còn lại" value={`${position?.volume ?? managed.expectedRemainingVolume} lot`} /></Grid>
                    <Grid size={6}><Info label="SL hiện tại" value={price(position?.stopLoss ?? managed.lastStructuralStop)} /></Grid>
                    <Grid size={6}><Info label="+6 → hòa vốn" value={managed.breakEvenApplied ? "ĐÃ DỜI" : "CHƯA"} /></Grid>
                    <Grid size={6}><Info label="+10 → chốt 1/3" value={managed.partialApplied ? "ĐÃ CHỐT" : "CHƯA"} /></Grid>
                    <Grid size={12}><Info label="Lãi/lỗ thả nổi" value={money(position?.profit ?? 0, currency)} /></Grid>
                  </Grid>

                  <Divider sx={{ my: 2 }} />
                  <Typography fontWeight={900}>Vì sao lệnh này đã được vào?</Typography>
                  <Stack spacing={0.8} mt={1.2}>
                    <ReasonLine ok>Mô hình {tenMoHinh(managed.pattern)} đã kích hoạt hướng {tenHuong(managed.side)}.</ReasonLine>
                    <ReasonLine ok>Rule bắt buộc Supertrend M15 cùng hướng tại thời điểm kích hoạt.</ReasonLine>
                    <ReasonLine ok>Rule bắt buộc Supertrend M5 cùng hướng; tuổi flip chỉ là thông tin, không chặn entry.</ReasonLine>
                    <ReasonLine ok>SL cấu trúc hợp lệ; SL vận hành tối thiểu 6 và tối đa 10 giá. Setup rộng hơn 10 chỉ được vào sau khi hồi đủ.</ReasonLine>
                    <Typography variant="body2" color="text.secondary">ℹ FVG chỉ ghi nhận bối cảnh; không có FVG vẫn được phép vào nếu các gate bắt buộc đạt.</Typography>
                  </Stack>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {managed && (
        <Card variant="outlined" sx={{ borderColor: "rgba(56,189,248,.25)" }}>
          <CardContent>
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1}>
              <Box>
                <Typography variant="h6" fontWeight={900}>Vì sao Bot đang HOLD lệnh?</Typography>
                <Typography variant="body2" color="text.secondary" mt={0.4}>Giải thích theo trạng thái quản lý hiện tại; không biến H1/H4/FVG thành điều kiện thoát cứng.</Typography>
              </Box>
              <Chip label="ĐANG GIỮ LỆNH" color="info" variant="outlined" />
            </Stack>
            <Grid container spacing={2} mt={0.5}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Stack spacing={1}>
                  <ReasonLine ok={Boolean(position)}>Vị thế vẫn còn tồn tại trên MT5 và đang thuộc state quản lý của Bot.</ReasonLine>
                  <ReasonLine ok={managed.breakEvenApplied}>{managed.breakEvenApplied ? "+6 đã đạt: SL đã được đưa về hòa vốn." : "+6 chưa được áp dụng: Bot tiếp tục giữ với SL hiện hành."}</ReasonLine>
                  <ReasonLine ok={managed.partialApplied}>{managed.partialApplied ? "+10 đã đạt: đã chốt 1/3, phần còn lại tiếp tục runner." : "+10 chưa được áp dụng: chưa đến bước chốt 1/3."}</ReasonLine>
                  <Typography variant="body2" color="text.secondary" fontWeight={700}>ℹ H1/H4 và FVG chỉ là bối cảnh; không tự đóng lệnh chỉ vì chạm các vùng này.</Typography>
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Stack spacing={1}>
                  <ReasonLine ok={currentM15Aligned}>Supertrend M15 hiện tại {currentM15Aligned ? `vẫn cùng hướng ${tenHuong(managed.side)}` : "không còn cùng hướng hoàn toàn"}.</ReasonLine>
                  <ReasonLine ok={currentM5Aligned}>M5 live {currentM5Aligned ? `vẫn cùng hướng ${tenHuong(managed.side)}` : "không còn đồng thuận với hướng lệnh"}.</ReasonLine>
                  <Typography variant="body2" color="text.secondary" fontWeight={700}>ℹ M15/M5 hiện tại là bối cảnh theo dõi. Bot chỉ thoát khi management canonical thực sự phát điều kiện thoát/SL.</Typography>
                  <Typography variant="body2" color="text.secondary">Sự kiện đóng gần nhất: {latestExit?.timestamp ? `${eventLabel(latestExit.type)} lúc ${dateTime(Date.parse(latestExit.timestamp))}` : "chưa có trong journal gần đây"}.</Typography>
                </Stack>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      <Alert severity={guardPass ? "success" : "warning"}>
        {guardPass
          ? "DEMO sẵn sàng · Trend: 3 mô hình nến + ST M15/M5 · SL cấu trúc 6–10; vượt 10 thì chờ hồi trong M15 kế tiếp · NORMAL: +6 BE, +10 chốt 1/3."
          : "DEMO chưa đủ điều kiện. Kiểm tra MT5 Bridge / Algo Trading / quyền Expert Trading."}
      </Alert>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" fontWeight={900}>Hoạt động gần đây</Typography>
          <TableContainer sx={{ mt: 1.5, maxHeight: 400 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow><TableCell>Thời gian</TableCell><TableCell>Sự kiện</TableCell><TableCell>Chi tiết</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {recent.length === 0 ? (
                  <TableRow><TableCell colSpan={3}>Chưa có sự kiện.</TableCell></TableRow>
                ) : recent.map((event, index) => (
                  <TableRow key={`${event.timestamp ?? "event"}-${index}`} hover>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{event.timestamp ? dateTime(Date.parse(event.timestamp)) : "—"}</TableCell>
                    <TableCell><Typography variant="body2" fontWeight={800}>{eventLabel(event.type)}</Typography></TableCell>
                    <TableCell><Typography variant="caption" color="text.secondary">{event.side ? tenHuong(event.side as Side) : ""} {event.pattern ? tenMoHinh(String(event.pattern)) : ""} {event.reason ? `· ${event.reason}` : ""} {event.message ? `· ${event.message}` : ""}</Typography></TableCell>
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
