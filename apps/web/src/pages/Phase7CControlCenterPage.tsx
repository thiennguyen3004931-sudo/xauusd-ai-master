import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import {
  getPhase7BDemo,
  getPhase7CAccountRisk,
  getPhase7CAutoLotPreview,
} from "../api";
import { MetricCard } from "../ui/MetricCard";
import { ErrorState, LoadingState } from "../ui/PageState";

function money(value: number | null | undefined, currency = "USD") {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function dateTime(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(n) ? new Date(n).toLocaleString("vi-VN") : "—";
}

function secondsText(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function Phase7CControlCenterPage() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const demo = useQuery({
    queryKey: ["phase7b-demo-control-center"],
    queryFn: getPhase7BDemo,
    refetchInterval: 3000,
    retry: false,
  });
  const account = useQuery({
    queryKey: ["phase7c-account-control-center"],
    queryFn: () => getPhase7CAccountRisk(0.25, 0.03),
    refetchInterval: 5000,
    retry: false,
  });

  const currentStopDistance =
    demo.data?.entryDiagnostics?.entry.stopDistance ?? null;
  const autoLot = useQuery({
    queryKey: ["phase7c-current-auto-lot", currentStopDistance],
    queryFn: () =>
      getPhase7CAutoLotPreview(currentStopDistance ?? 0, 0.25, 0.03),
    enabled: currentStopDistance !== null,
    refetchInterval: 5000,
    retry: false,
  });

  if (demo.isLoading || account.isLoading) return <LoadingState />;
  if (!demo.data || !account.data) {
    const error = demo.error ?? account.error;
    return (
      <ErrorState
        message={
          error instanceof Error
            ? error.message
            : "Không đọc được Phase 7C Control Center."
        }
      />
    );
  }

  const d = demo.data;
  const a = account.data;
  const diag = d.entryDiagnostics;
  const managed = d.mt5.managedPosition;
  const currency = a.account.accountCurrency ?? "USD";
  const remainingMs = diag ? Math.max(0, diag.nextCloseTime - now) : 0;
  const intervalProgress = diag
    ? Math.max(0, Math.min(100, 100 - (remainingMs / (15 * 60_000)) * 100))
    : 0;
  const preCloseActive = Boolean(diag && remainingMs <= 10_000 && remainingMs >= 5_000);
  const finalFive = Boolean(diag && remainingMs < 5_000 && remainingMs > 0);
  const preCloseText = !diag
    ? "—"
    : preCloseActive
      ? "PRE-CLOSE NOW"
      : finalFive
        ? "FINAL 5s"
        : remainingMs > 10_000
          ? `sau ${secondsText(remainingMs - 10_000)}`
          : "đang chuyển nến";

  const readiness = !diag
    ? { label: "NO DIAGNOSTICS", color: "warning" as const }
    : diag.entry.eligible
      ? { label: `${diag.entry.side} READY`, color: "success" as const }
      : diag.trend.sellAligned
        ? { label: "SELL TREND · WAIT PATTERN", color: "warning" as const }
        : diag.trend.buyAligned
          ? { label: "BUY TREND · WAIT PATTERN", color: "warning" as const }
          : { label: "WAIT TREND", color: "default" as const };

  const runtimePass = Boolean(d.runtime?.armed && d.runtime?.alive);
  const demoPass = a.account.accountMode === "demo";
  const permissionPass = Boolean(
    a.account.tradingEnabled &&
      a.account.terminalTradeAllowed &&
      a.account.expertTradeAllowed,
  );
  const spreadPass = a.quote.spread <= a.spec.maxSpread;
  const patternPass = Boolean(diag?.pattern.matched);
  const maPass = Boolean(diag?.trend.matchedPatternSide);
  const structurePass = Boolean(
    diag?.entry.structuralStopDistance !== null &&
      Number(diag?.entry.structuralStopDistance) > 0,
  );

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        gap={2}
      >
        <Box>
          <Typography variant="overline" color="primary" fontWeight={800}>
            PHASE 7C · CONTROL CENTER
          </Typography>
          <Typography variant="h5" fontWeight={900}>
            XAUUSD AI MASTER · Daily Operations
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Một màn hình để xem Bot, broker, M15 readiness, lệnh đang chạy và quyết định gần nhất. Read-only, không có route đặt lệnh.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip
            color={
              d.botStatus === "WAITING_SIGNAL" || d.botStatus === "MANAGING"
                ? "success"
                : "warning"
            }
            label={d.botStatus}
          />
          <Chip
            color="success"
            variant="outlined"
            label={`${a.account.server ?? "MT5"} · ${a.account.accountLogin ?? "—"}`}
          />
          <Chip variant="outlined" label="DEMO ONLY" />
        </Stack>
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <MetricCard
            label="Balance"
            value={money(a.account.accountBalance, currency)}
            detail={`Equity ${money(a.account.accountEquity, currency)}`}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <MetricCard
            label="XAUUSD spread"
            value={`${a.quote.spread.toFixed(2)} giá`}
            detail={`Max ${a.spec.maxSpread.toFixed(2)} · ${spreadPass ? "PASS" : "BLOCK"}`}
            tone={spreadPass ? "success.main" : "error.main"}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <MetricCard
            label="M15 đóng sau"
            value={diag ? secondsText(remainingMs) : "—"}
            detail={diag ? dateTime(diag.nextCloseTime) : "Không có diagnostics"}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <MetricCard
            label="Pre-close 5–10s"
            value={preCloseText}
            detail="Provisional entry window · fallback closed M15"
            tone={preCloseActive ? "success.main" : finalFive ? "warning.main" : "text.primary"}
          />
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            gap={2}
          >
            <Box>
              <Typography fontWeight={900}>Checklist trước khi bot có thể vào lệnh</Typography>
              <Typography variant="caption" color="text.secondary">
                Entry cần runtime + DEMO + permission + spread + Pattern + MA + structure. FVG hiện chỉ xác nhận thêm, không chặn entry.
              </Typography>
            </Box>
            <Chip color={readiness.color} label={readiness.label} />
          </Stack>
          <Grid container spacing={1.5} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Gate label="Bot runtime ARMED" pass={runtimePass} detail={d.runtime?.alive ? "heartbeat/process alive" : "runtime chưa alive"} /></Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Gate label="DEMO account" pass={demoPass} detail={`${a.account.server ?? "—"} · ${a.account.accountLogin ?? "—"}`} /></Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Gate label="Algo / Expert Trading" pass={permissionPass} detail={`Bridge ${a.account.tradingEnabled ? "ON" : "OFF"} · Algo ${a.account.terminalTradeAllowed ? "ON" : "OFF"} · Expert ${a.account.expertTradeAllowed ? "ON" : "OFF"}`} /></Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Gate label="Spread guard" pass={spreadPass} detail={`${a.quote.spread.toFixed(2)} / max ${a.spec.maxSpread.toFixed(2)} giá`} /></Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Gate label="Pattern" pass={patternPass} detail={diag?.pattern.matched ? `${diag.pattern.side} · ${diag.pattern.name}` : "Engulfing / Two-candle chưa đạt"} /></Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Gate label="MA cùng hướng Pattern" pass={maPass} detail={diag ? `MA20 ${diag.trend.ma20.toFixed(2)} · MA50 ${diag.trend.ma50.toFixed(2)} · MA200 ${diag.trend.ma200.toFixed(2)}` : "—"} /></Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}><Gate label="Structural SL" pass={structurePass} detail={diag?.entry.stopDistance !== null && diag?.entry.stopDistance !== undefined ? `${diag.entry.stopDistance.toFixed(2)} giá canonical` : "Chưa có pattern extreme hợp lệ"} /></Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <Card variant="outlined" sx={{ height: "100%" }}>
                <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                    <Typography variant="body2" fontWeight={800}>FVG cùng hướng</Typography>
                    <Chip size="small" variant="outlined" label="OPTIONAL" />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                    {diag?.fvg.sameDirectionConfirmed ? "Đã xác nhận cùng hướng" : "Chưa xác nhận · không block entry"}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {diag ? (
        <Card>
          <CardContent>
            <Stack
              direction={{ xs: "column", md: "row" }}
              justifyContent="space-between"
              gap={2}
            >
              <Box>
                <Typography fontWeight={900}>M15 Entry Gate hiện tại</Typography>
                <Typography variant="caption" color="text.secondary">
                  Cây đóng {dateTime(diag.closeTime)} · next {dateTime(diag.nextCloseTime)}
                </Typography>
              </Box>
              <Chip color={readiness.color} label={readiness.label} />
            </Stack>
            <LinearProgress
              variant="determinate"
              value={intervalProgress}
              sx={{ mt: 2, height: 8, borderRadius: 8 }}
            />
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Typography variant="caption" color="text.secondary">OHLC</Typography>
                <Typography fontWeight={800}>
                  {diag.bar.open.toFixed(2)} / {diag.bar.high.toFixed(2)} / {diag.bar.low.toFixed(2)} / {diag.bar.close.toFixed(2)}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Typography variant="caption" color="text.secondary">MA20 / MA50 / MA200</Typography>
                <Typography fontWeight={800}>
                  {diag.trend.ma20.toFixed(2)} / {diag.trend.ma50.toFixed(2)} / {diag.trend.ma200.toFixed(2)}
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Typography variant="caption" color="text.secondary">FVG</Typography>
                <Typography fontWeight={800}>
                  BUY {diag.fvg.buyConfirmed ? "YES" : "NO"} · SELL {diag.fvg.sellConfirmed ? "YES" : "NO"} · OPTIONAL
                </Typography>
              </Grid>
            </Grid>
            <Alert severity={diag.entry.eligible ? "success" : "info"} sx={{ mt: 2 }}>
              {diag.entry.reason}
            </Alert>
          </CardContent>
        </Card>
      ) : null}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, xl: 5 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography fontWeight={900}>Managed Position</Typography>
              {!managed ? (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Không có position hệ thống. Bot đang chờ Pattern + MA.
                </Alert>
              ) : (
                <Stack spacing={1.2} sx={{ mt: 2 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip color={managed.side === "LONG" ? "success" : "error"} label={managed.side} />
                    <Typography fontWeight={900}>{managed.volume.toFixed(2)} lot</Typography>
                  </Stack>
                  <Typography>Entry: <b>{managed.entry.toFixed(2)}</b></Typography>
                  <Typography>SL: <b>{managed.stopLoss.toFixed(2)}</b></Typography>
                  <Typography>P/L open: <b>{money(managed.profit, currency)}</b></Typography>
                  <Typography variant="caption" color="text.secondary">
                    +6 → BE · +10 → chốt 1/3 · runner swing M15 · MA20/reversal exit.
                  </Typography>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, xl: 7 }}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
                <Box>
                  <Typography fontWeight={900}>Auto Lot theo SL hiện tại · SHADOW</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Risk 0.25% balance · cap 0.03 lot · chỉ khuyến nghị, không đổi lệnh Phase 7B.
                  </Typography>
                </Box>
                <Chip color="warning" variant="outlined" label="NO EXECUTION" />
              </Stack>
              {currentStopDistance === null ? (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Chưa có Pattern tạo structural SL nên chưa tính exact Auto Lot. Matrix 6/8/10 giá vẫn có ở Risk & Auto Lot.
                </Alert>
              ) : autoLot.isLoading ? (
                <LinearProgress sx={{ mt: 2 }} />
              ) : autoLot.data ? (
                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                  <Grid size={{ xs: 6, md: 3 }}><MiniMetric label="SL" value={`${autoLot.data.preview.stopDistance.toFixed(2)} giá`} /></Grid>
                  <Grid size={{ xs: 6, md: 3 }}><MiniMetric label="Fixed hiện tại" value="0.03 lot" /></Grid>
                  <Grid size={{ xs: 6, md: 3 }}><MiniMetric label="Shadow lot" value={autoLot.data.preview.approved ? `${autoLot.data.preview.recommendedLot.toFixed(2)} lot` : "BLOCK"} tone={autoLot.data.preview.approved ? "success.main" : "error.main"} /></Grid>
                  <Grid size={{ xs: 6, md: 3 }}><MiniMetric label="Risk shadow" value={`${money(autoLot.data.preview.estimatedRiskUsd, currency)} · ${autoLot.data.preview.estimatedRiskPercent.toFixed(3)}%`} /></Grid>
                  <Grid size={{ xs: 12 }}>
                    <Alert severity={autoLot.data.preview.approved ? "success" : "warning"}>
                      {autoLot.data.preview.reason}
                    </Alert>
                  </Grid>
                </Grid>
              ) : (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  {autoLot.error instanceof Error ? autoLot.error.message : "Không tính được Auto Lot preview."}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2}>
            <Box>
              <Typography fontWeight={900}>Đi nhanh đến công cụ cần dùng</Typography>
              <Typography variant="caption" color="text.secondary">
                Pattern Check để xem từng điều kiện nến; Backtest để chọn khoảng lịch sử; Risk để thử các mức risk/lot shadow.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button component={RouterLink} to="/phase7b-pattern-check" variant="outlined">M15 Pattern Check</Button>
              <Button component={RouterLink} to="/phase7c-backtest" variant="outlined">Canonical Backtest</Button>
              <Button component={RouterLink} to="/phase7c-risk" variant="outlined">Risk & Auto Lot</Button>
              <Button component={RouterLink} to="/performance" variant="outlined">Forward Performance</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography fontWeight={900}>Quyết định gần nhất</Typography>
          <TableContainer sx={{ mt: 1, maxHeight: 360 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Thời gian</TableCell>
                  <TableCell>Event</TableCell>
                  <TableCell>Chi tiết</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {d.recentEvents.slice(0, 20).map((event, index) => {
                  const detail =
                    event.type === "M15_NO_ENTRY_SIGNAL"
                      ? `Close ${Number(event.close ?? 0).toFixed(2)} · Pattern/MA gate không đủ`
                      : event.type === "ENTRY_SUBMIT"
                        ? `${String(event.side ?? "")} · ${String(event.pattern ?? "")} · ${String(event.volume ?? "")} lot`
                        : event.type === "PLUS6_SL_TO_ENTRY"
                          ? `+6 → BE · SL ${String(event.stopLoss ?? "")}`
                          : event.type === "PLUS10_PARTIAL_ONE_THIRD"
                            ? `Chốt ${String(event.closedVolume ?? "")} lot · còn ${String(event.remainingVolume ?? "")}`
                            : event.type === "FVG_HOLD_CONFIRMED"
                              ? `HOLD · favorable ${String(event.favorable ?? "")}`
                              : String(event.message ?? event.reason ?? "—");
                  return (
                    <TableRow key={`${String(event.timestamp ?? index)}-${String(event.type ?? index)}`}>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{dateTime(event.timestamp)}</TableCell>
                      <TableCell><Chip size="small" variant="outlined" label={String(event.type ?? "UNKNOWN")} /></TableCell>
                      <TableCell>{detail}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Alert severity="warning">
        Phase 7C chỉ quan sát và nghiên cứu. Không thay đổi Pattern, MA, FVG, SL, volume 0.03 hoặc quyền giao dịch của Phase 7B đang forward-test.
      </Alert>
    </Stack>
  );
}

function Gate({ label, pass, detail }: { label: string; pass: boolean; detail: string }) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
          <Typography variant="body2" fontWeight={800}>{label}</Typography>
          <Chip size="small" color={pass ? "success" : "warning"} variant="outlined" label={pass ? "PASS" : "WAIT"} />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          {detail}
        </Typography>
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value, tone = "text.primary" }: { label: string; value: string; tone?: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography fontWeight={900} sx={{ color: tone }}>{value}</Typography>
    </Box>
  );
}
