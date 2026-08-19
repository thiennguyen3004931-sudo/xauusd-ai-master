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
  Typography,
} from "@mui/material";
import {
  getPhase7BDemo,
  getPhase7CAccountRisk,
  getPhase7CAutoLotPreview,
  getPhase7CDailyRecovery,
  getPhase7CLiveRegime,
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

export function Phase7CControlCenterPage() {

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

  const liveRegime = useQuery({
    queryKey: ["phase7c-live-regime-control-center"],
    queryFn: getPhase7CLiveRegime,
    refetchInterval: 5000,
    retry: false,
  });

  const sidewayPreviewVolume =
    autoLot.data?.preview?.approved
      ? autoLot.data.preview.recommendedLot
      : null;

  const recoveryPreviewVolume =
    liveRegime.data?.recommendedMode === "SIDEWAY" &&
    sidewayPreviewVolume !== null
      ? sidewayPreviewVolume
      : 0.03;

  const dailyRecovery = useQuery({
    queryKey: [
      "phase7c-daily-recovery-control-center",
      recoveryPreviewVolume,
    ],
    queryFn: () =>
      getPhase7CDailyRecovery(
        recoveryPreviewVolume,
      ),
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

  const a = account.data;
  const currency = a.account.accountCurrency ?? "USD";

  const effectiveRegime =
    liveRegime.data
      ? liveRegime.data.activeMode === "AUTO"
        ? liveRegime.data.recommendedMode
        : liveRegime.data.activeMode
      : null;

  const recovery = dailyRecovery.data;

  const nextExecutionLabel =
    !effectiveRegime || !recovery
      ? "ĐANG ĐỌC..."
      : effectiveRegime === "PAUSE"
        ? "PAUSE · CHỜ REGIME"
        : `${effectiveRegime} + ${recovery.dailyMode}`;

  const previewVolumeBasis =
    liveRegime.data?.recommendedMode === "SIDEWAY"
      ? sidewayPreviewVolume !== null
        ? "Sideway Auto Lot hiện tại"
        : "Sideway chưa có Structural SL · tạm preview 0.03"
      : "Trend fixed 0.03 lot";

  const recoveryReadError =
    liveRegime.error ??
    dailyRecovery.error ??
    null;


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
            AUTO & Daily Recovery
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Tập trung vào AUTO regime, Daily Recovery và giới hạn risk/lot cho lệnh kế tiếp. Điều kiện entry chi tiết nằm ở màn hình Điều kiện tín hiệu.
          </Typography>
        </Box>
              </Stack>


      <Card>
        <CardContent>
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            gap={2}
          >
            <Box>
              <Typography fontWeight={900}>
                Kế hoạch lệnh kế tiếp · AUTO + Daily Recovery
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
              >
                Read-only. Hồi phục ngày không ép Trend/Sideway và không tăng lot.
              </Typography>
            </Box>

            <Stack
              direction="row"
              spacing={1}
              flexWrap="wrap"
              useFlexGap
            >
              <Chip
                variant="outlined"
                label={
                  liveRegime.data
                    ? `${liveRegime.data.activeMode} → ${liveRegime.data.recommendedMode}`
                    : "REGIME..."
                }
              />

              <Chip
                color={
                  recovery?.dailyMode === "RECOVERY_TP"
                    ? "warning"
                    : recovery?.dailyMode === "NORMAL"
                      ? "success"
                      : "default"
                }
                label={
                  recovery?.dailyMode ??
                  "DAILY MODE..."
                }
              />

              <Chip
                color={
                  effectiveRegime === "PAUSE"
                    ? "warning"
                    : recovery
                      ? "success"
                      : "default"
                }
                label={nextExecutionLabel}
              />
            </Stack>
          </Stack>

          {recoveryReadError ? (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Không đọc được trạng thái Daily Recovery / Regime:{" "}
              {recoveryReadError instanceof Error
                ? recoveryReadError.message
                : String(recoveryReadError)}
            </Alert>
          ) : (
            <>
              <Grid
                container
                spacing={2}
                sx={{ mt: 0.5 }}
              >
                <Grid
                  size={{
                    xs: 12,
                    sm: 6,
                    xl: 3,
                  }}
                >
                  <MetricCard
                    label="AUTO Regime"
                    value={
                      liveRegime.data
                        ? liveRegime.data.activeMode === "AUTO"
                          ? `AUTO → ${liveRegime.data.recommendedMode}`
                          : liveRegime.data.activeMode
                        : "—"
                    }
                    detail={
                      liveRegime.data
                        ? `${liveRegime.data.regime} · confidence ${liveRegime.data.confidence}`
                        : "Đang đọc live regime"
                    }
                  />
                </Grid>

                <Grid
                  size={{
                    xs: 12,
                    sm: 6,
                    xl: 3,
                  }}
                >
                  <MetricCard
                    label="P/L đã chốt hôm nay"
                    value={money(
                      recovery?.dailyNetPnl,
                      currency,
                    )}
                    detail={
                      recovery
                        ? `${recovery.dealCount} deal · cả Trend + Sideway`
                        : "Đang đọc broker history"
                    }
                    tone={
                      recovery?.dailyNetPnl !== undefined &&
                      recovery.dailyNetPnl < 0
                        ? "warning.main"
                        : "success.main"
                    }
                  />
                </Grid>

                <Grid
                  size={{
                    xs: 12,
                    sm: 6,
                    xl: 3,
                  }}
                >
                  <MetricCard
                    label="Daily Mode"
                    value={
                      recovery?.dailyMode ?? "—"
                    }
                    detail={
                      recovery?.dailyMode === "RECOVERY_TP"
                        ? `Cần phục hồi ${money(recovery.preview.requiredUsd, currency)}`
                        : recovery
                          ? "P/L ngày >= 0 · quản lý theo regime gốc"
                          : "Đang tính"
                    }
                    tone={
                      recovery?.dailyMode === "RECOVERY_TP"
                        ? "warning.main"
                        : "success.main"
                    }
                  />
                </Grid>

                <Grid
                  size={{
                    xs: 12,
                    sm: 6,
                    xl: 3,
                  }}
                >
                  <MetricCard
                    label="TP hồi phục dự kiến"
                    value={
                      recovery?.dailyMode === "RECOVERY_TP" &&
                      recovery.preview.tpDistance !== null
                        ? `${recovery.preview.tpDistance.toFixed(2)} giá`
                        : recovery
                          ? "REGIME NATIVE"
                          : "—"
                    }
                    detail={
                      recovery
                        ? `${recovery.preview.volume.toFixed(2)} lot · ${previewVolumeBasis}`
                        : "Chưa có preview"
                    }
                  />
                </Grid>
              </Grid>

              <Alert
                severity={
                  effectiveRegime === "PAUSE"
                    ? "info"
                    : recovery?.dailyMode === "RECOVERY_TP"
                      ? "warning"
                      : "success"
                }
                sx={{ mt: 2 }}
              >
                {!recovery || !effectiveRegime
                  ? "Đang đọc kế hoạch lệnh kế tiếp."
                  : effectiveRegime === "PAUSE"
                    ? recovery.dailyMode === "RECOVERY_TP"
                      ? "AUTO hiện khuyến nghị PAUSE: chưa vào lệnh. Trạng thái RECOVERY_TP vẫn được giữ cho lệnh hợp lệ kế tiếp khi regime cho phép."
                      : "AUTO hiện khuyến nghị PAUSE: chưa vào lệnh mới."
                    : recovery.dailyMode === "RECOVERY_TP"
                      ? `Lệnh hợp lệ kế tiếp dự kiến: ${effectiveRegime} + RECOVERY_TP. TP full-position adaptive ${recovery.strategy.minTpDistance}–${recovery.strategy.maxTpDistance} giá; không tăng lot; không force entry; khả năng phục hồi trong một lệnh: ${recovery.preview.canRecoverInOneTrade ? "CÓ" : "KHÔNG"}.`
                      : `Lệnh hợp lệ kế tiếp dự kiến: ${effectiveRegime} + NORMAL. Bot dùng quản lý gốc của regime; Daily Recovery không kích hoạt vì P/L đã chốt trong ngày hiện >= 0.`}
              </Alert>

              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: "block",
                  mt: 1.5,
                }}
              >
                Broker day bắt đầu:{" "}
                {recovery
                  ? dateTime(
                      recovery.dayStartTime,
                    )
                  : "—"}
                {" · "}
                Magic Trend{" "}
                {recovery?.strategy.trendMagicNumber ??
                  "—"}
                {" · "}
                Sideway{" "}
                {recovery?.strategy.sidewayMagicNumber ??
                  "—"}
                {" · "}
                Lot escalation OFF · New positions only.
              </Typography>
            </>
          )}
        </CardContent>
      </Card>


            <Card>
        <CardContent>
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            gap={2}
          >
            <Box>
              <Typography fontWeight={900}>
                Risk & Auto Lot · SHADOW
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
              >
                Trend fixed 0.03 lot · Sideway risk 0.25% balance · cap 0.03 lot.
                Chỉ preview; không tăng risk, không martingale và không nới SL.
              </Typography>
            </Box>

            <Button
              component={RouterLink}
              to="/phase7b-pattern-check"
              size="small"
              variant="outlined"
            >
              Xem điều kiện tín hiệu
            </Button>
          </Stack>

          <Grid
            container
            spacing={2}
            sx={{ mt: 0.5 }}
          >
            <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
              <MetricCard
                label="Trend lot"
                value="0.03 lot"
                detail="Fixed · không escalation"
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
              <MetricCard
                label="Sideway risk"
                value="0.25%"
                detail="Max lot 0.03"
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
              <MetricCard
                label="Structural SL hiện tại"
                value={
                  currentStopDistance !== null
                    ? currentStopDistance.toFixed(2) + " giá"
                    : "—"
                }
                detail="Không nới SL để tăng risk"
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
              <MetricCard
                label="Sideway Auto Lot"
                value={
                  sidewayPreviewVolume !== null
                    ? sidewayPreviewVolume.toFixed(2) + " lot"
                    : "—"
                }
                detail={
                  autoLot.data?.preview?.approved
                    ? "Theo Structural SL"
                    : "Chờ Structural SL hợp lệ"
                }
              />
            </Grid>
          </Grid>

          {currentStopDistance === null ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              Chưa có Structural SL hợp lệ nên Sideway Auto Lot chưa thể tính exact.
            </Alert>
          ) : autoLot.isLoading ? (
            <LinearProgress sx={{ mt: 2 }} />
          ) : autoLot.data ? (
            <Alert
              severity={
                autoLot.data.preview.approved
                  ? "success"
                  : "warning"
              }
              sx={{ mt: 2 }}
            >
              {autoLot.data.preview.reason}
              {" · "}Risk preview{" "}
              {money(
                autoLot.data.preview.estimatedRiskUsd,
                currency,
              )}
              {" · "}
              {autoLot.data.preview.estimatedRiskPercent.toFixed(3)}
              %
            </Alert>
          ) : (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {autoLot.error instanceof Error
                ? autoLot.error.message
                : "Không tính được Auto Lot preview."}
            </Alert>
          )}

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: "block",
              mt: 1.5,
            }}
          >
            Risk target hiện tại:{" "}
            {money(
              a.configuration.targetRiskUsd,
              currency,
            )}
            {" · "}DEMO ONLY · Read-only preview.
          </Typography>
        </CardContent>
      </Card>



      <Alert severity="warning">
        Phase 7C chỉ quan sát và nghiên cứu. Không thay đổi Pattern, MA, FVG, SL, volume 0.03 hoặc quyền giao dịch của Phase 7B đang forward-test.
      </Alert>
    </Stack>
  );
}
