import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link as RouterLink } from "react-router-dom";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import StopRounded from "@mui/icons-material/StopRounded";
import TelegramRounded from "@mui/icons-material/TelegramRounded";
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
  TextField,
  Typography,
} from "@mui/material";
import {
  getPhase7CDecisionMonitor,
  getPhase7CDailyRecovery,
  getPhase7CLifecycle,
  getPhase7CLotSettings,
  runPhase7CLifecycleAction,
  setPhase7CBotMode,
  setPhase7CLotSettings,
} from "../api";
import { MetricCard } from "../ui/MetricCard";

function money(value: number | null | undefined, currency = "USD") {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function price(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value).toFixed(2) : "—";
}

function dateTime(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed)
    ? new Date(parsed).toLocaleString("vi-VN")
    : "—";
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (
    /IPC|SYMBOL_NOT_FOUND|Broker symbol|HTTP 503|failed 404|disconnected|fetch failed/i.test(
      message,
    )
  ) {
    return "MT5 đang tắt hoặc Bridge đang kết nối lại. Trang Web vẫn hoạt động và sẽ tự đồng bộ sau khi MT5 sẵn sàng.";
  }
  return message || "Chưa đọc được dữ liệu.";
}

function ReasonBox({ title, children }: { title: string; children: string }) {
  return (
    <Box
      sx={{
        p: 2,
        height: "100%",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        bgcolor: "rgba(255,255,255,.015)",
      }}
    >
      <Typography variant="caption" color="primary" fontWeight={900} letterSpacing=".05em">
        {title}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.8, lineHeight: 1.65 }}>
        {children}
      </Typography>
    </Box>
  );
}

export function Phase7CControlCenterPage() {
  const queryClient = useQueryClient();

  const lifecycle = useQuery({
    queryKey: ["phase7c-lifecycle"],
    queryFn: getPhase7CLifecycle,
    refetchInterval: 2_000,
    retry: false,
  });
  const bridgeReady = lifecycle.data?.bridge.reachable === true;

  const lotSettings = useQuery({
    queryKey: ["phase7c-lot-settings"],
    queryFn: getPhase7CLotSettings,
    refetchInterval: 5_000,
    retry: false,
  });
  const configuredTrendLot = lotSettings.data?.state.trendFixedLot ?? 0.03;
  const configuredSidewayRisk = lotSettings.data?.state.sidewayRiskPercent ?? 0.25;
  const configuredSidewayMaxLot = lotSettings.data?.state.sidewayMaxLot ?? 0.03;

  const decisionMonitor = useQuery({
    queryKey: ["phase7c-decision-monitor"],
    queryFn: getPhase7CDecisionMonitor,
    refetchInterval: 3_000,
    retry: false,
    enabled: bridgeReady,
  });
  const decision = decisionMonitor.data;

  const recoveryPreviewVolume =
    decision?.engine.recommendedMode === "SIDEWAY"
      ? configuredSidewayMaxLot
      : configuredTrendLot;
  const dailyRecovery = useQuery({
    queryKey: ["phase7c-daily-recovery-control-center", recoveryPreviewVolume],
    queryFn: () => getPhase7CDailyRecovery(recoveryPreviewVolume),
    refetchInterval: 10_000,
    retry: false,
    enabled: bridgeReady,
  });

  const [lotDraft, setLotDraft] = useState<{
    trendFixedLot: number;
    sidewayRiskPercent: number;
    sidewayMaxLot: number;
  } | null>(null);
  const trendFixedLot = lotDraft?.trendFixedLot ?? configuredTrendLot;
  const sidewayRiskPercent = lotDraft?.sidewayRiskPercent ?? configuredSidewayRisk;
  const sidewayMaxLot = lotDraft?.sidewayMaxLot ?? configuredSidewayMaxLot;
  const updateLotDraft = (patch: Partial<NonNullable<typeof lotDraft>>) => {
    setLotDraft((current) => ({
      trendFixedLot: current?.trendFixedLot ?? configuredTrendLot,
      sidewayRiskPercent: current?.sidewayRiskPercent ?? configuredSidewayRisk,
      sidewayMaxLot: current?.sidewayMaxLot ?? configuredSidewayMaxLot,
      ...patch,
    }));
  };

  const lifecycleAction = useMutation({
    mutationFn: runPhase7CLifecycleAction,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["phase7c-lifecycle"] }),
        queryClient.invalidateQueries({ queryKey: ["phase7c-decision-monitor"] }),
        queryClient.invalidateQueries({ queryKey: ["phase7c-lot-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["phase7c-daily-recovery-control-center"] }),
      ]);
    },
  });

  const botModeAction = useMutation({
    mutationFn: setPhase7CBotMode,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["phase7c-lifecycle"] }),
        queryClient.invalidateQueries({ queryKey: ["phase7c-decision-monitor"] }),
      ]);
    },
  });

  const saveLotSettings = useMutation({
    mutationFn: setPhase7CLotSettings,
    onSuccess: async () => {
      setLotDraft(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["phase7c-lot-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["phase7c-decision-monitor"] }),
        queryClient.invalidateQueries({ queryKey: ["phase7c-lifecycle"] }),
      ]);
    },
  });

  const lifecycleData = lifecycle.data;
  const brokerModeSupported = lifecycleData?.bridge.accountMode === "demo" || lifecycleData?.bridge.accountMode === "real";
  const detectedAccountLabel =
    lifecycleData?.bridge.accountMode === "real"
      ? "LIVE"
      : lifecycleData?.bridge.accountMode === "demo"
        ? "DEMO"
        : lifecycleData?.bridge.accountMode?.toUpperCase() ?? "MT5 OFFLINE";
  const mode = lifecycleData?.mode.mode ?? decision?.mode.active ?? "—";
  const currency = decision?.account.currency ?? "USD";
  const position = decision?.position;
  const preTrade = decision?.preTrade;
  const managing = position?.state === "MANAGING" || position?.state === "UNMANAGED";
  const displayedEntry = managing ? position?.entry : preTrade?.entry;
  const displayedStop = managing ? position?.stopLoss : preTrade?.stopLoss;
  const displayedTp1 = managing ? position?.tp1 : preTrade?.tp1;
  const displayedTp2 = managing ? position?.tp2 : preTrade?.tp2;
  const displayedLot = managing ? position?.volume : preTrade?.finalLot;
  const displayedPnl = managing ? position?.floatingPnlUsd : null;
  const displayedRisk = managing ? null : preTrade?.estimatedRiskUsd;
  const entryReason = managing
    ? (position?.entryReason ?? "Chưa có lý do vào lệnh.")
    : mode === "PAUSE"
      ? "Bot đang PAUSE; executor vẫn chạy nhưng không mở kế hoạch giao dịch mới. Chỉ bật AUTO thủ công từ Web sau khi hoàn tất kiểm tra an toàn."
      : (preTrade?.decisionReason ?? "Chưa có setup hợp lệ; tiếp tục chờ tín hiệu.");
  const holdReason = managing
    ? (position?.holdReason ?? "Executor đang kiểm tra điều kiện giữ lệnh.")
    : "Chưa có vị thế đang mở; executor tiếp tục chờ setup hợp lệ.";
  const isLiveAccount = lifecycleData?.bridge.accountMode === "real";
  const liveArmArmed = lifecycleData?.bridge.liveExecutionArmed === true;
  const liveArmScope = lifecycleData?.bridge.liveArmScope ?? "—";
  const liveArmReason = lifecycleData?.bridge.liveArmReason ?? "UNKNOWN";

  const canChangeLot =
    mode === "PAUSE" &&
    bridgeReady &&
    lifecycleData?.bridge.accountMode === "demo" &&
    (lifecycleData?.bridge.openXauusdPositions ?? 0) === 0;
  const canEnableAuto =
    lifecycleData?.ready === true &&
    lifecycleData?.controlEnabled === true &&
    bridgeReady &&
    brokerModeSupported &&
    (!isLiveAccount || liveArmArmed) &&
    lifecycleData?.bridge.tradingEnabled === true &&
    lifecycleData?.bridge.terminalTradeAllowed === true &&
    lifecycleData?.bridge.expertTradeAllowed === true &&
    (lifecycleData?.bridge.openXauusdPositions ?? 0) === 0 &&
    mode !== "AUTO";
  const canPause =
    lifecycleData?.controlEnabled === true &&
    mode !== "PAUSE";

  return (
    <Stack spacing={2}>
      <Card sx={{ border: "1px solid", borderColor: lifecycleData?.ready ? "success.main" : "divider" }}>
        <CardContent>
          <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" gap={2.5} alignItems={{ lg: "center" }}>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="h6" fontWeight={950}>Điều khiển Bot DEMO / LIVE</Typography>
                <Chip
                  color={lifecycleData?.ready ? "success" : lifecycleData?.running ? "warning" : "default"}
                  label={lifecycleData?.ready ? "BOT READY" : lifecycleData?.running ? "ĐANG KHỞI ĐỘNG" : "BOT ĐÃ DỪNG"}
                  size="small"
                />
                <Chip color={bridgeReady ? "success" : "warning"} label={bridgeReady ? "MT5 CONNECTED" : "MT5 RECONNECTING"} size="small" variant="outlined" />
                <Chip color={lifecycleData?.bridge.accountMode === "real" ? "warning" : "default"} label={`ACCOUNT ${detectedAccountLabel}`} size="small" variant="outlined" />
                {isLiveAccount ? (
                  <Chip
                    color={liveArmArmed ? "success" : "error"}
                    label={liveArmArmed ? "ARM LIVE" : "ARM DISARMED"}
                    size="small"
                    variant={liveArmArmed ? "filled" : "outlined"}
                  />
                ) : null}
                <Chip icon={<TelegramRounded />} color={lifecycleData?.telegramReady ? "success" : "default"} label={lifecycleData?.telegramReady ? "TELEGRAM READY" : "TELEGRAM OFFLINE"} size="small" variant="outlined" />
                <Chip label={`MODE ${mode}`} size="small" variant="outlined" />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                BẬT BOT chỉ khởi động/khôi phục executors và luôn kết thúc ở PAUSE. AUTO không còn được bật từ lifecycle hay Telegram; chỉ nút BẬT AUTO trên Web mới có quyền kích hoạt AUTO sau khi toàn bộ cổng an toàn đạt.
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.7 }}>
                {detectedAccountLabel}
                {lifecycleData?.bridge.server ? ` · ${lifecycleData.bridge.server}` : ""}
                {isLiveAccount ? ` · ARM ${lifecycleData?.bridge.liveArmStatus ?? "UNKNOWN"} · ${liveArmScope}` : ""}
                {` · XAUUSD positions ${lifecycleData?.bridge.openXauusdPositions ?? "—"}`}
                {` · Lot ${configuredTrendLot.toFixed(2)} / ${configuredSidewayRisk.toFixed(2)}% / ${configuredSidewayMaxLot.toFixed(2)}`}
              </Typography>
            </Box>

            <Stack spacing={1.2} sx={{ minWidth: { lg: 430 } }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                <Button
                  fullWidth
                  variant="contained"
                  color="success"
                  size="large"
                  startIcon={<PlayArrowRounded />}
                  disabled={
                    lifecycleAction.isPending || lifecycleData?.actionInProgress || lifecycleData?.ready ||
                    !lifecycleData?.controlEnabled || !bridgeReady || !brokerModeSupported ||
                    lifecycleData?.bridge.tradingEnabled !== true ||
                    lifecycleData?.bridge.terminalTradeAllowed !== true ||
                    lifecycleData?.bridge.expertTradeAllowed !== true ||
                    (lifecycleData?.bridge.openXauusdPositions ?? 0) > 0 ||
                    !lifecycleData?.telegramConfigured
                  }
                  onClick={() => lifecycleAction.mutate("start")}
                  sx={{ fontWeight: 950 }}
                >
                  {lifecycleAction.isPending && lifecycleAction.variables === "start"
                    ? "ĐANG BẬT..."
                    : lifecycleData?.running ? "KHÔI PHỤC BOT" : "BẬT BOT"}
                </Button>
                <Button
                  fullWidth
                  variant="outlined"
                  color="error"
                  size="large"
                  startIcon={<StopRounded />}
                  disabled={
                    lifecycleAction.isPending || lifecycleData?.actionInProgress || !lifecycleData?.running ||
                    !lifecycleData?.controlEnabled || (lifecycleData?.bridge.openXauusdPositions ?? 0) > 0
                  }
                  onClick={() => lifecycleAction.mutate("stop")}
                  sx={{ fontWeight: 900 }}
                >
                  {lifecycleAction.isPending && lifecycleAction.variables === "stop" ? "ĐANG DỪNG..." : "DỪNG HỆ THỐNG"}
                </Button>
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                <Button
                  fullWidth
                  variant="contained"
                  color="primary"
                  disabled={!canEnableAuto || botModeAction.isPending}
                  onClick={() => botModeAction.mutate("AUTO")}
                  sx={{ fontWeight: 950 }}
                >
                  {botModeAction.isPending && botModeAction.variables === "AUTO" ? "ĐANG BẬT AUTO..." : "BẬT AUTO"}
                </Button>
                <Button
                  fullWidth
                  variant="outlined"
                  color="warning"
                  disabled={!canPause || botModeAction.isPending}
                  onClick={() => botModeAction.mutate("PAUSE")}
                  sx={{ fontWeight: 950 }}
                >
                  {botModeAction.isPending && botModeAction.variables === "PAUSE" ? "ĐANG PAUSE..." : "TẠM DỪNG"}
                </Button>
              </Stack>
            </Stack>
          </Stack>

          {!bridgeReady ? (
            <Alert severity="warning" sx={{ mt: 2 }}>
              MT5 đang tắt hoặc Bridge đang tự kết nối lại. Web vẫn hoạt động; nút BẬT BOT/AUTO được khóa cho tới khi MT5 DEMO/LIVE và Algo Trading sẵn sàng.
            </Alert>
          ) : !brokerModeSupported ? (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Loại tài khoản MT5 hiện tại không được Phase7C hỗ trợ. Chỉ DEMO hoặc LIVE/real được phép; Bot giữ PAUSE.
            </Alert>
          ) : isLiveAccount && !liveArmArmed ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              ARM DISARMED · {liveArmReason} · scope {liveArmScope}. LIVE không mở lệnh mới và nút BẬT AUTO bị khóa. Nếu đang có vị thế, bridge vẫn cho phép giảm rủi ro bằng partial/full close và BE/siết SL; không cho phép nới SL hoặc thay TP khi DISARMED. ARM mới dùng scope BRIDGE_SESSION và sẽ tự mất hiệu lực khi bridge khởi động lại.
            </Alert>
          ) : isLiveAccount ? (
            <Alert severity="success" sx={{ mt: 2 }}>
              ARM LIVE · {liveArmScope === "BRIDGE_SESSION" ? "BRIDGE_SESSION" : liveArmScope}. LIVE entry được mở khóa cho đúng phiên bridge hiện tại. Web không tự cấp quyền/ARM LIVE lần đầu; sau khi executors READY hệ thống vẫn giữ PAUSE cho tới khi người vận hành bấm BẬT AUTO riêng.
            </Alert>
          ) : null}
          {lifecycle.error ? <Alert severity="error" sx={{ mt: 2 }}>{friendlyError(lifecycle.error)}</Alert> : null}
          {lifecycleAction.isSuccess ? <Alert severity="success" sx={{ mt: 2 }}>{lifecycleAction.data.message}</Alert> : null}
          {lifecycleAction.error ? <Alert severity="error" sx={{ mt: 2 }}>{friendlyError(lifecycleAction.error)}</Alert> : null}
          {botModeAction.isSuccess ? (
            <Alert severity="success" sx={{ mt: 2 }}>
              Mode đã chuyển sang {botModeAction.data.state.mode}. Nguồn canonical: {botModeAction.data.state.updatedBy}.
            </Alert>
          ) : null}
          {botModeAction.error ? <Alert severity="error" sx={{ mt: 2 }}>{friendlyError(botModeAction.error)}</Alert> : null}
          {(lifecycleData?.bridge.openXauusdPositions ?? 0) > 0 ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              Đang có vị thế XAUUSD; DỪNG HỆ THỐNG và BẬT AUTO bị khóa. TẠM DỪNG mode vẫn khả dụng và không dừng executor quản lý vị thế.
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2}>
            <Box>
              <Typography fontWeight={950}>Quyết định hiện tại · Web đồng bộ panel MT5</Typography>
              <Typography variant="caption" color="text.secondary">
                Một snapshot canonical cho Regime, Entry, SL, TP, Lot, P/L và lý do quyết định.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label={`${decision?.mode.active ?? mode} → ${decision?.mode.effectiveStrategy ?? "—"}`} variant="outlined" />
              <Chip label={`${decision?.engine.regime ?? "ĐANG ĐỌC"} · ${decision?.engine.confidence ?? "—"}`} variant="outlined" />
              <Chip color={preTrade?.approved ? "success" : "warning"} label={managing ? position?.state : (preTrade?.stage ?? "ĐANG ĐỌC")} />
            </Stack>
          </Stack>

          {!bridgeReady ? (
            <Alert severity="info" sx={{ mt: 2 }}>Đang chờ MT5 kết nối lại; dữ liệu giao dịch mới sẽ tự xuất hiện tại đây và trên panel MT5.</Alert>
          ) : decisionMonitor.error ? (
            <Alert severity="warning" sx={{ mt: 2 }}>{friendlyError(decisionMonitor.error)}</Alert>
          ) : !decision ? (
            <LinearProgress sx={{ mt: 2 }} />
          ) : (
            <>
              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                <Grid size={{ xs: 12, sm: 6, xl: 2 }}>
                  <MetricCard label="Trạng thái" value={managing ? `${position?.side ?? "—"} · ${position?.state}` : preTrade?.approved ? "SETUP HỢP LỆ" : "CHỜ SETUP"} detail={`${decision.mode.effectiveStrategy} · ${preTrade?.setup ?? "WAIT"}`} tone={managing || preTrade?.approved ? "success.main" : "warning.main"} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, xl: 2 }}>
                  <MetricCard label="Entry / Giá hiện tại" value={price(displayedEntry)} detail={managing ? `Hiện tại ${price(position?.currentPrice)}` : `${preTrade?.side ?? "—"} · ${preTrade?.source ?? "canonical"}`} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, xl: 2 }}>
                  <MetricCard label="Stop Loss" value={price(displayedStop)} detail={`${managing ? position?.favorableDistance : (preTrade?.stopDistance ?? "—")} giá`} tone="error.main" />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, xl: 2 }}>
                  <MetricCard label="TP1 / TP2" value={`${price(displayedTp1)} / ${price(displayedTp2)}`} detail="BE +6 · chốt 1/3 tại +10" tone="success.main" />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, xl: 2 }}>
                  <MetricCard label="Lot" value={Number.isFinite(displayedLot) ? `${Number(displayedLot).toFixed(2)} lot` : "—"} detail={managing ? `Ticket ${position?.ticket ?? "—"}` : `Raw ${preTrade?.rawLot == null ? "—" : preTrade.rawLot.toFixed(4)} · cap ${preTrade?.lotCap == null ? "—" : preTrade.lotCap.toFixed(2)}`} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, xl: 2 }}>
                  <MetricCard label={managing ? "Lãi / Lỗ đang chạy" : "Rủi ro dự kiến"} value={money(managing ? displayedPnl : displayedRisk, currency)} detail={managing ? `${position?.floatingPnlPercent == null ? "—" : position.floatingPnlPercent.toFixed(3)}% equity` : `${preTrade?.estimatedRiskPercent == null ? "—" : preTrade.estimatedRiskPercent.toFixed(3)}% balance`} tone={(managing ? (displayedPnl ?? 0) : 0) < 0 ? "error.main" : "success.main"} />
                </Grid>
              </Grid>

              <Grid container spacing={2} sx={{ mt: 0.25 }}>
                <Grid size={{ xs: 12, lg: 6 }}><ReasonBox title="LÝ DO VÀO LỆNH / CHỜ LỆNH">{entryReason}</ReasonBox></Grid>
                <Grid size={{ xs: 12, lg: 6 }}><ReasonBox title="LÝ DO VẪN GIỮ">{holdReason}</ReasonBox></Grid>
              </Grid>

              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
                Engine: {decision.engine.reasons.length > 0 ? decision.engine.reasons.join(" · ") : "Chưa có diễn giải"}
                {` · Snapshot ${dateTime(decision.generatedAt)} · MT5 panel order permission ${decision.safety.mt5PanelOrderPermission}`}
              </Typography>

              <Typography fontWeight={900} sx={{ mt: 2 }}>Nhật ký quyết định gần nhất</Typography>
              <TableContainer sx={{ mt: 1 }}>
                <Table size="small">
                  <TableHead><TableRow><TableCell>Thời gian</TableCell><TableCell>Bot / Trạng thái</TableCell><TableCell>Lot</TableCell><TableCell>SL</TableCell><TableCell>Risk</TableCell><TableCell>Lý do</TableCell></TableRow></TableHead>
                  <TableBody>
                    {decision.recentDecisions.slice(0, 6).map((row, index) => (
                      <TableRow key={`${row.timestamp}-${row.strategy}-${row.event}-${index}`}>
                        <TableCell>{dateTime(row.timestamp)}</TableCell>
                        <TableCell><b>{row.strategy}</b><br /><Typography component="span" variant="caption">{row.event} · {row.stage}</Typography></TableCell>
                        <TableCell>{row.sizing?.finalLot == null ? "—" : Number(row.sizing.finalLot).toFixed(2)}</TableCell>
                        <TableCell>{row.plan?.stopDistance == null ? "—" : `${Number(row.plan.stopDistance).toFixed(2)} giá`}</TableCell>
                        <TableCell>{money(row.sizing?.estimatedRiskUsd, currency)}</TableCell>
                        <TableCell sx={{ minWidth: 280 }}>{row.reason}</TableCell>
                      </TableRow>
                    ))}
                    {decision.recentDecisions.length === 0 ? <TableRow><TableCell colSpan={6}>Chưa có quyết định mới trong phiên này.</TableCell></TableRow> : null}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography fontWeight={950}>Kết quả ngày & Daily Recovery</Typography>
          <Typography variant="caption" color="text.secondary">Tách riêng kết quả đã chốt khỏi quyết định entry để tránh hiển thị trùng Regime và Lot.</Typography>
          {!bridgeReady ? (
            <Alert severity="info" sx={{ mt: 2 }}>Lịch sử P/L sẽ tự tải lại sau khi MT5 kết nối.</Alert>
          ) : dailyRecovery.error ? (
            <Alert severity="warning" sx={{ mt: 2 }}>{friendlyError(dailyRecovery.error)}</Alert>
          ) : !dailyRecovery.data ? (
            <LinearProgress sx={{ mt: 2 }} />
          ) : (
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid size={{ xs: 12, sm: 6, xl: 3 }}><MetricCard label="P/L đã chốt hôm nay" value={money(dailyRecovery.data.dailyNetPnl, currency)} detail={`${dailyRecovery.data.dealCount} deal · broker history`} tone={dailyRecovery.data.dailyNetPnl < 0 ? "error.main" : "success.main"} /></Grid>
              <Grid size={{ xs: 12, sm: 6, xl: 3 }}><MetricCard label="Daily Mode" value={dailyRecovery.data.dailyMode} detail={dailyRecovery.data.nextEntryManagement} tone={dailyRecovery.data.dailyMode === "RECOVERY_TP" ? "warning.main" : "success.main"} /></Grid>
              <Grid size={{ xs: 12, sm: 6, xl: 3 }}><MetricCard label="Cần phục hồi" value={money(dailyRecovery.data.preview.requiredUsd, currency)} detail="Không tăng lot · không ép entry" /></Grid>
              <Grid size={{ xs: 12, sm: 6, xl: 3 }}><MetricCard label="TP Recovery dự kiến" value={dailyRecovery.data.preview.tpDistance == null ? "REGIME NATIVE" : `${dailyRecovery.data.preview.tpDistance.toFixed(2)} giá`} detail={`${dailyRecovery.data.preview.volume.toFixed(2)} lot · ${dailyRecovery.data.preview.canRecoverInOneTrade ? "đủ trong 1 lệnh" : "không ép mục tiêu"}`} /></Grid>
            </Grid>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2}>
            <Box>
              <Typography fontWeight={950}>Cấu hình Risk & Lot cho lệnh mới</Typography>
              <Typography variant="caption" color="text.secondary">DEMO only · không martingale · không thay đổi vị thế đang quản lý.</Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label={`Trend ${configuredTrendLot.toFixed(2)} lot`} variant="outlined" />
              <Chip label={`Sideway ${configuredSidewayRisk.toFixed(2)}%`} variant="outlined" />
              <Chip label={`Cap ${configuredSidewayMaxLot.toFixed(2)} lot`} variant="outlined" />
              <Button component={RouterLink} to="/phase7b-pattern-check" size="small" variant="outlined">Xem điều kiện tín hiệu</Button>
            </Stack>
          </Stack>

          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth size="small" type="number" label="Trend fixed lot" value={trendFixedLot} onChange={(event) => updateLotDraft({ trendFixedLot: Number(event.target.value) })} slotProps={{ htmlInput: { min: 0.03, max: 0.3, step: 0.03 } }} /></Grid>
            <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth size="small" type="number" label="Sideway risk / lệnh (%)" value={sidewayRiskPercent} onChange={(event) => updateLotDraft({ sidewayRiskPercent: Number(event.target.value) })} slotProps={{ htmlInput: { min: 0.01, max: 1, step: 0.01 } }} /></Grid>
            <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth size="small" type="number" label="Sideway max lot" value={sidewayMaxLot} onChange={(event) => updateLotDraft({ sidewayMaxLot: Number(event.target.value) })} slotProps={{ htmlInput: { min: 0.03, max: 0.3, step: 0.03 } }} /></Grid>
          </Grid>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }} sx={{ mt: 2 }}>
            <Button variant="contained" disabled={!canChangeLot || saveLotSettings.isPending || !lotSettings.data} onClick={() => saveLotSettings.mutate({ trendFixedLot, sidewayRiskPercent, sidewayMaxLot })}>
              {saveLotSettings.isPending ? "Đang lưu..." : "Lưu cấu hình lot"}
            </Button>
            <Typography variant="caption" color="text.secondary">Chỉ lưu khi Mode PAUSE, MT5 DEMO kết nối và không có vị thế XAUUSD.</Typography>
          </Stack>

          {saveLotSettings.error ? <Alert severity="error" sx={{ mt: 1.5 }}>{friendlyError(saveLotSettings.error)}</Alert> : null}
          {lotSettings.error ? (
            <Alert severity="error" sx={{ mt: 1.5 }}>{friendlyError(lotSettings.error)}</Alert>
          ) : lotSettings.data?.restartRequired ? (
            <Alert severity="warning" sx={{ mt: 1.5 }}>Cấu hình đã lưu nhưng chưa active. Giữ PAUSE rồi nhấn KHÔI PHỤC BOT để nạp cấu hình mới.</Alert>
          ) : lotSettings.data?.activeAlive ? (
            <Alert severity="success" sx={{ mt: 1.5 }}>Executor đang dùng đúng cấu hình đã lưu.</Alert>
          ) : null}
        </CardContent>
      </Card>
    </Stack>
  );
}