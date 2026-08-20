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
  Stack,
  Typography,
} from "@mui/material";
import {
  getPhase7CAccountRisk,
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

  const account = useQuery({
    queryKey: ["phase7c-account-control-center"],
    queryFn: () => getPhase7CAccountRisk(0.25, 0.03),
    refetchInterval: 5000,
    retry: false,
  });

  const liveRegime = useQuery({
    queryKey: ["phase7c-live-regime-control-center"],
    queryFn: getPhase7CLiveRegime,
    refetchInterval: 5000,
    retry: false,
  });

  // The exact Sideway stop only exists after the executor has Supply/Demand,
  // ATR, the final quote and M5 confirmation. Use the configured cap for this
  // read-only recovery illustration instead of reusing Trend diagnostics.
  const recoveryPreviewVolume = 0.03;

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

  if (account.isLoading) return <LoadingState />;
  if (!account.data) {
    const error = account.error;
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
      ? "mức cap 0.03 để minh họa; lot Sideway tính khi có setup"
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
          <Typography fontWeight={900}>SL, dời SL và chốt lời đang áp dụng</Typography>
          <Typography variant="caption" color="text.secondary">
            Đây là rule execution hiện hành, không phải kết quả nghiên cứu cũ.
          </Typography>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12, lg: 4 }}>
              <Box sx={{ p: 2, height: "100%", border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                <Typography fontWeight={900}>TREND · NORMAL</Typography>
                <Typography variant="body2" color="text.secondary" mt={0.8}>
                  SL theo cực trị mô hình; vận hành tối thiểu 6 và tối đa 10 giá. Nếu SL cấu trúc &gt;10, không vào đuổi mà chờ hồi trong M15 kế tiếp. +6 dời về BE; +10 chốt 1/3. Runner siết SL theo cấu trúc M15 và thoát theo MA50 hoặc FVG đảo chiều kèm nến từ chối.
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, lg: 4 }}>
              <Box sx={{ p: 2, height: "100%", border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                <Typography fontWeight={900}>SIDEWAY · NORMAL</Typography>
                <Typography variant="body2" color="text.secondary" mt={0.8}>
                  SL nằm ngoài vùng Demand/Supply, cộng buffer ATR và khoảng cách broker. +6 dời về BE; +10 chốt 1/3. Phần còn lại chốt tại biên đối diện; đóng sớm nếu thị trường rời trạng thái range hoặc hết thời gian giữ tối đa.
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, lg: 4 }}>
              <Box sx={{ p: 2, height: "100%", border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                <Typography fontWeight={900}>DAILY RECOVERY_TP</Typography>
                <Typography variant="body2" color="text.secondary" mt={0.8}>
                  Khi P/L đã chốt trong ngày âm, lệnh hợp lệ kế tiếp dùng TP toàn vị thế thích ứng 6–10 giá để hướng tới hòa phần lỗ + 1 USD. Không tăng lot, không ép entry và không nới SL.
                </Typography>
              </Box>
            </Grid>
          </Grid>
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
                Chính sách Risk & Lot
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
              >
                Trend fixed 0.03 lot. Sideway tính Auto Lot sau khi có đúng SL từ Supply/Demand + ATR + quote cuối; risk 0.25% balance, cap 0.03 lot. Không martingale và không nới SL.
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
                label="SL Sideway"
                value="THEO SETUP"
                detail="Supply/Demand + ATR + broker gap"
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
              <MetricCard
                label="Sideway Auto Lot"
                value="TÍNH TRƯỚC LỆNH"
                detail="0.25% balance · cap 0.03"
              />
            </Grid>
          </Grid>

          <Alert severity="info" sx={{ mt: 2 }}>
            Không dùng SL Trend để giả lập lot Sideway. Executor chỉ tính lot Sideway khi setup cuối đã qua xác nhận M5 và có SL thực tế; nếu snapshot Auto Lot sai tài khoản, symbol, stop distance hoặc quá cũ thì chặn lệnh.
          </Alert>

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
        AUTO chọn TREND / SIDEWAY / PAUSE. Trend dùng fixed 0.03 lot; Sideway dùng risk 0.25% với cap 0.03. Telegram chỉ đổi mode điều phối, không có quyền trực tiếp đặt/sửa/đóng lệnh MT5.
      </Alert>
    </Stack>
  );
}
