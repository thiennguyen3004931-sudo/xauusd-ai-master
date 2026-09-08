import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import {
  getPhase7CDecisionMonitor,
  getPhase7CLifecycle,
  getPhase7CLotSettings,
} from "../api";

function price(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value).toFixed(2) : "—";
}

function money(value: number | null | undefined, currency = "USD") {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={900} noWrap>{value}</Typography>
    </Box>
  );
}

export function Phase7CControlCenterCompactSection({
  detailsOpen,
  onToggleDetails,
}: {
  detailsOpen: boolean;
  onToggleDetails: () => void;
}) {
  const lifecycle = useQuery({
    queryKey: ["phase7c-lifecycle"],
    queryFn: getPhase7CLifecycle,
    refetchInterval: 2_000,
    retry: false,
  });
  const decisionMonitor = useQuery({
    queryKey: ["phase7c-decision-monitor"],
    queryFn: getPhase7CDecisionMonitor,
    refetchInterval: 3_000,
    retry: false,
    enabled: lifecycle.data?.bridge.reachable === true,
  });
  const lotSettings = useQuery({
    queryKey: ["phase7c-lot-settings"],
    queryFn: getPhase7CLotSettings,
    refetchInterval: 5_000,
    retry: false,
  });

  const lifecycleData = lifecycle.data;
  const decision = decisionMonitor.data;
  const preTrade = decision?.preTrade;
  const position = decision?.position;
  const managing = position?.state === "MANAGING";
  const unmanaged = position?.state === "UNMANAGED";
  const hasOpenPosition = managing || unmanaged;
  const mode = lifecycleData?.mode.mode ?? decision?.mode.active ?? "—";
  const strategy = decision?.engine.recommendedMode ?? "—";
  const regime = decision?.engine.regime ?? "—";
  const displayedEntry = hasOpenPosition ? position?.entry : preTrade?.entry;
  const displayedStop = hasOpenPosition ? position?.stopLoss : preTrade?.stopLoss;
  const displayedTp = managing ? position?.tp1 : unmanaged ? null : preTrade?.tp1;
  const displayedLot = hasOpenPosition ? position?.volume : preTrade?.finalLot;
  const displayedPnl = hasOpenPosition ? position?.floatingPnlUsd : null;
  const currency = decision?.account.currency ?? "USD";
  const reason = hasOpenPosition
    ? position?.holdReason ?? position?.entryReason ?? "Executor đang quản lý vị thế."
    : mode === "PAUSE"
      ? "Bot đang PAUSE; không mở kế hoạch giao dịch mới."
      : preTrade?.decisionReason ?? "Chưa có setup hợp lệ; tiếp tục chờ tín hiệu.";

  const trendLot = lotSettings.data?.state.trendFixedLot ?? 0.03;
  const sidewayRisk = lotSettings.data?.state.sidewayRiskPercent ?? 0.25;
  const sidewayMaxLot = lotSettings.data?.state.sidewayMaxLot ?? 0.03;
  const trendFixedTpEnabled = lotSettings.data?.state.trendFixedTpEnabled ?? false;
  const trendFixedTpDistance = lotSettings.data?.state.trendFixedTpDistance ?? 0;
  const sidewayFixedTpEnabled = lotSettings.data?.state.sidewayFixedTpEnabled ?? false;
  const sidewayFixedTpDistance = lotSettings.data?.state.sidewayFixedTpDistance ?? 0;

  return (
    <Stack spacing={1.5}>
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 1.7, md: 2 } }}>
          <Stack spacing={1.6}>
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.2} alignItems={{ md: "center" }}>
              <Box>
                <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" alignItems="center">
                  <Typography variant="h6" fontWeight={950}>Quyết định hiện tại</Typography>
                  <Chip label={`MODE ${mode}`} size="small" variant="outlined" />
                  <Chip label={`REGIME ${regime}`} size="small" variant="outlined" />
                  <Chip label={`BOT ${strategy}`} size="small" color={strategy === "TREND" || strategy === "SIDEWAY" ? "primary" : "default"} variant="outlined" />
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.45 }}>
                  {reason}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                aria-expanded={detailsOpen}
                onClick={onToggleDetails}
                sx={{ fontWeight: 900, whiteSpace: "nowrap" }}
              >
                {detailsOpen ? "Ẩn điều khiển chi tiết" : "Mở điều khiển chi tiết"}
              </Button>
            </Stack>

            <Grid container spacing={1.4}>
              <Grid size={{ xs: 6, sm: 4, lg: 2 }}><SummaryMetric label="Entry" value={price(displayedEntry)} /></Grid>
              <Grid size={{ xs: 6, sm: 4, lg: 2 }}><SummaryMetric label="Stop Loss" value={price(displayedStop)} /></Grid>
              <Grid size={{ xs: 6, sm: 4, lg: 2 }}><SummaryMetric label="TP" value={price(displayedTp)} /></Grid>
              <Grid size={{ xs: 6, sm: 4, lg: 2 }}><SummaryMetric label="Lot" value={displayedLot === null || displayedLot === undefined ? "—" : Number(displayedLot).toFixed(2)} /></Grid>
              <Grid size={{ xs: 6, sm: 4, lg: 2 }}><SummaryMetric label="P/L" value={money(displayedPnl, currency)} /></Grid>
              <Grid size={{ xs: 6, sm: 4, lg: 2 }}><SummaryMetric label="Positions" value={String(lifecycleData?.bridge.openXauusdPositions ?? "—")} /></Grid>
            </Grid>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined" sx={{ borderRadius: 3, height: "100%" }}>
            <CardContent sx={{ p: 1.7 }}>
              <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
                <Box>
                  <Typography fontWeight={950}>Lot / Fixed TP</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Cấu hình hiện hành; chỉnh sửa vẫn nằm trong Điều khiển chi tiết để giữ nguyên safety guard.
                  </Typography>
                </Box>
                <Chip label="CONFIG" size="small" variant="outlined" />
              </Stack>
              <Stack direction="row" spacing={0.7} useFlexGap flexWrap="wrap" sx={{ mt: 1.2 }}>
                <Chip size="small" label={`TREND LOT ${trendLot.toFixed(2)}`} variant="outlined" />
                <Chip size="small" label={`SIDEWAY ${sidewayRisk.toFixed(2)}% / ${sidewayMaxLot.toFixed(2)}`} variant="outlined" />
                <Chip size="small" label={`TREND TP ${trendFixedTpEnabled ? trendFixedTpDistance.toFixed(2) : "OFF"}`} variant="outlined" />
                <Chip size="small" label={`SIDEWAY TP ${sidewayFixedTpEnabled ? sidewayFixedTpDistance.toFixed(2) : "OFF"}`} variant="outlined" />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined" sx={{ borderRadius: 3, height: "100%" }}>
            <CardContent sx={{ p: 1.7 }}>
              <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
                <Box>
                  <Typography fontWeight={950}>Bot / Lifecycle</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Trạng thái nhanh; Start/Stop/Pause đầy đủ nằm trong Điều khiển chi tiết.
                  </Typography>
                </Box>
                <Chip
                  label={lifecycleData?.ready ? "READY" : lifecycleData?.running ? "STARTING" : "STOPPED"}
                  size="small"
                  color={lifecycleData?.ready ? "success" : lifecycleData?.running ? "warning" : "default"}
                />
              </Stack>
              <Stack direction="row" spacing={0.7} useFlexGap flexWrap="wrap" sx={{ mt: 1.2 }}>
                <Chip size="small" label={`MODE ${mode}`} variant="outlined" />
                <Chip size="small" label={lifecycleData?.bridge.reachable ? "MT5 CONNECTED" : "MT5 OFFLINE"} color={lifecycleData?.bridge.reachable ? "success" : "warning"} variant="outlined" />
                <Chip size="small" label={lifecycleData?.telegramReady ? "TELEGRAM READY" : "TELEGRAM OFFLINE"} color={lifecycleData?.telegramReady ? "success" : "default"} variant="outlined" />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
