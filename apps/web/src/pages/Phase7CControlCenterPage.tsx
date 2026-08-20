import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  TextField,
  Typography,
} from "@mui/material";
import {
  getPhase7CAccountRisk,
  getPhase7CDecisionMonitor,
  getPhase7CDailyRecovery,
  getPhase7CLiveRegime,
  getPhase7CLotSettings,
  setPhase7CLotSettings,
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

  const queryClient = useQueryClient();
  const lotSettings = useQuery({
    queryKey: ["phase7c-lot-settings"],
    queryFn: getPhase7CLotSettings,
    refetchInterval: 5000,
    retry: false,
  });
  const configuredTrendLot = lotSettings.data?.state.trendFixedLot ?? 0.03;
  const configuredSidewayRisk = lotSettings.data?.state.sidewayRiskPercent ?? 0.25;
  const configuredSidewayMaxLot = lotSettings.data?.state.sidewayMaxLot ?? 0.03;

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

  const account = useQuery({
    queryKey: ["phase7c-account-control-center", configuredSidewayRisk, configuredSidewayMaxLot],
    queryFn: () => getPhase7CAccountRisk(configuredSidewayRisk, configuredSidewayMaxLot),
    refetchInterval: 5000,
    retry: false,
  });

  const liveRegime = useQuery({
    queryKey: ["phase7c-live-regime-control-center"],
    queryFn: getPhase7CLiveRegime,
    refetchInterval: 5000,
    retry: false,
  });

  const decisionMonitor = useQuery({
    queryKey: ["phase7c-decision-monitor"],
    queryFn: getPhase7CDecisionMonitor,
    refetchInterval: 5000,
    retry: false,
  });

  // The exact Sideway stop only exists after the executor has Supply/Demand,
  // ATR, the final quote and M5 confirmation. Use the configured cap for this
  // read-only recovery illustration instead of reusing Trend diagnostics.
  const recoveryPreviewVolume = liveRegime.data?.recommendedMode === "SIDEWAY"
    ? configuredSidewayMaxLot
    : configuredTrendLot;

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

  const saveLotSettings = useMutation({
    mutationFn: setPhase7CLotSettings,
    onSuccess: async () => {
      setLotDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["phase7c-lot-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["phase7c-account-control-center"] });
    },
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
      ? `mức cap ${configuredSidewayMaxLot.toFixed(2)} để minh họa; lot Sideway tính khi có setup`
      : `Trend fixed ${configuredTrendLot.toFixed(2)} lot`;

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
              <Typography fontWeight={900}>Quyết định trước lệnh · nguồn canonical</Typography>
              <Typography variant="caption" color="text.secondary">
                Cùng snapshot được hiển thị trên Web và panel EA MT5. Panel chỉ đọc, quyền đặt lệnh = NONE.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip
                variant="outlined"
                label={decisionMonitor.data?.mode.effectiveStrategy ?? "ĐANG ĐỌC"}
              />
              <Chip
                color={decisionMonitor.data?.preTrade.approved ? "success" : "warning"}
                label={decisionMonitor.data?.preTrade.stage ?? "ĐANG ĐỌC"}
              />
              <Chip variant="outlined" label="MT5 READ-ONLY" />
            </Stack>
          </Stack>

          {decisionMonitor.error ? (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Không đọc được decision monitor: {decisionMonitor.error instanceof Error
                ? decisionMonitor.error.message
                : String(decisionMonitor.error)}
            </Alert>
          ) : !decisionMonitor.data ? (
            <LinearProgress sx={{ mt: 2 }} />
          ) : (
            <>
              {(() => {
                const decision = decisionMonitor.data;
                const p = decision.preTrade;
                return (
                  <>
                    <Grid container spacing={2} sx={{ mt: 0.5 }}>
                      <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
                        <MetricCard
                          label="Lot tính toán → cuối"
                          value={p.finalLot === null ? "CHƯA TÍNH" : `${p.finalLot.toFixed(2)} lot`}
                          detail={`Raw ${p.rawLot === null ? "—" : p.rawLot.toFixed(4)} · cap ${p.lotCap === null ? "—" : p.lotCap.toFixed(2)}`}
                          tone={p.approved ? "success.main" : "warning.main"}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
                        <MetricCard
                          label="SL trước lệnh"
                          value={p.stopDistance === null ? "CHƯA CÓ SETUP" : `${p.stopDistance.toFixed(2)} giá`}
                          detail={`Entry ${p.entry === null ? "—" : p.entry.toFixed(2)} · SL ${p.stopLoss === null ? "—" : p.stopLoss.toFixed(2)}`}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
                        <MetricCard
                          label="Rủi ro ước tính"
                          value={money(p.estimatedRiskUsd, decision.account.currency ?? "USD")}
                          detail={`${p.estimatedRiskPercent === null ? "—" : p.estimatedRiskPercent.toFixed(3)}% balance · target ${p.riskTargetPercent === null ? "fixed lot" : `${p.riskTargetPercent.toFixed(2)}%`}`}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
                        <MetricCard
                          label="Setup / Confidence"
                          value={`${p.side ?? "—"} · ${p.setup ?? "WAIT"}`}
                          detail={`${p.confidenceLabel ?? "ENGINE"} · ${p.confidenceScore === null ? decision.engine.confidence : p.confidenceScore}`}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6, xl: 4 }}>
                        <MetricCard
                          label="Break-even"
                          value={`+${p.breakEvenTriggerDistance.toFixed(0)} giá`}
                          detail={`Dời SL về ${p.breakEvenPrice === null ? "entry khi có lệnh" : p.breakEvenPrice.toFixed(2)}`}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6, xl: 4 }}>
                        <MetricCard
                          label="TP1 / Partial"
                          value={p.tp1 === null ? `+${p.partialTriggerDistance.toFixed(0)} giá` : p.tp1.toFixed(2)}
                          detail={`Chốt ${p.partialFraction} tại +${p.partialTriggerDistance.toFixed(0)}`}
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6, xl: 4 }}>
                        <MetricCard
                          label="TP2"
                          value={p.tp2 === null ? "THEO RUNNER/SETUP" : p.tp2.toFixed(2)}
                          detail={p.source}
                        />
                      </Grid>
                    </Grid>

                    <Alert severity={p.approved ? "success" : "info"} sx={{ mt: 2 }}>
                      <b>{p.approved ? "SETUP ĐỦ ĐIỀU KIỆN" : "CHƯA GỬI LỆNH"}:</b> {p.decisionReason}
                    </Alert>
                    <Alert severity="warning" variant="outlined" sx={{ mt: 1 }}>
                      <b>Giới hạn lot:</b> {p.limitReason}
                    </Alert>
                    <Alert severity="info" variant="outlined" sx={{ mt: 1 }}>
                      <b>Engine {decision.engine.regime} · confidence {decision.engine.confidence}:</b>{" "}
                      {decision.engine.reasons.length > 0
                        ? decision.engine.reasons.join(" · ")
                        : "Engine chưa trả về diễn giải."}
                    </Alert>

                    <Typography fontWeight={900} sx={{ mt: 2 }}>
                      Nhật ký quyết định gần nhất
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Gồm cả lý do vào, chờ và chặn; dữ liệu gốc do executor canonical ghi trước/sau lệnh.
                    </Typography>
                    <TableContainer sx={{ mt: 1 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Thời gian</TableCell>
                            <TableCell>Bot / Event</TableCell>
                            <TableCell>Lot</TableCell>
                            <TableCell>SL</TableCell>
                            <TableCell>Risk</TableCell>
                            <TableCell>Lý do</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {decision.recentDecisions.slice(0, 12).map((row, index) => (
                            <TableRow key={`${row.timestamp}-${row.strategy}-${row.event}-${index}`}>
                              <TableCell>{dateTime(row.timestamp)}</TableCell>
                              <TableCell>
                                <b>{row.strategy}</b><br />
                                <Typography component="span" variant="caption">{row.event} · {row.stage}</Typography>
                              </TableCell>
                              <TableCell>{row.sizing?.finalLot == null ? "—" : Number(row.sizing.finalLot).toFixed(2)}</TableCell>
                              <TableCell>{row.plan?.stopDistance == null ? "—" : `${Number(row.plan.stopDistance).toFixed(2)} giá`}</TableCell>
                              <TableCell>{money(row.sizing?.estimatedRiskUsd, decision.account.currency ?? "USD")}</TableCell>
                              <TableCell sx={{ minWidth: 280 }}>{row.reason}</TableCell>
                            </TableRow>
                          ))}
                          {decision.recentDecisions.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6}>Nhật ký chuẩn sẽ xuất hiện sau khi executor được restart với phiên bản mới.</TableCell>
                            </TableRow>
                          ) : null}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </>
                );
              })()}
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
                Trend fixed {configuredTrendLot.toFixed(2)} lot. Sideway tính Auto Lot sau khi có đúng SL từ Supply/Demand + ATR + quote cuối; risk {configuredSidewayRisk.toFixed(2)}% balance, cap {configuredSidewayMaxLot.toFixed(2)} lot. Không martingale và không nới SL.
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
                value={`${configuredTrendLot.toFixed(2)} lot`}
                detail="Fixed · không escalation"
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
              <MetricCard
                label="Sideway risk"
                value={`${configuredSidewayRisk.toFixed(2)}%`}
                detail={`Max lot ${configuredSidewayMaxLot.toFixed(2)}`}
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
                detail={`${configuredSidewayRisk.toFixed(2)}% balance · cap ${configuredSidewayMaxLot.toFixed(2)}`}
              />
            </Grid>
          </Grid>

          <Box sx={{ mt: 2, p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
            <Typography fontWeight={900}>Điều chỉnh lot cho lệnh mới</Typography>
            <Typography variant="caption" color="text.secondary">
              Chỉ lưu khi BOT MODE = PAUSE, MT5 là DEMO và không có vị thế XAUUSD. Lot dùng bước 0.03 để chốt đúng 1/3 tại +10; thay đổi không tác động vị thế đang quản lý.
            </Typography>

            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Trend fixed lot"
                  value={trendFixedLot}
                  onChange={(event) => updateLotDraft({ trendFixedLot: Number(event.target.value) })}
                  slotProps={{ htmlInput: { min: 0.03, max: 0.3, step: 0.03 } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Sideway risk / lệnh (%)"
                  value={sidewayRiskPercent}
                  onChange={(event) => updateLotDraft({ sidewayRiskPercent: Number(event.target.value) })}
                  slotProps={{ htmlInput: { min: 0.01, max: 1, step: 0.01 } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Sideway max lot"
                  value={sidewayMaxLot}
                  onChange={(event) => updateLotDraft({ sidewayMaxLot: Number(event.target.value) })}
                  slotProps={{ htmlInput: { min: 0.03, max: 0.3, step: 0.03 } }}
                />
              </Grid>
            </Grid>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }} sx={{ mt: 2 }}>
              <Button
                variant="contained"
                disabled={liveRegime.data?.activeMode !== "PAUSE" || saveLotSettings.isPending || !lotSettings.data}
                onClick={() => saveLotSettings.mutate({ trendFixedLot, sidewayRiskPercent, sidewayMaxLot })}
              >
                {saveLotSettings.isPending ? "Đang lưu..." : "Lưu cấu hình lot"}
              </Button>
              <Typography variant="caption" color="text.secondary">
                Mode hiện tại: <b>{liveRegime.data?.activeMode ?? "ĐANG ĐỌC"}</b> · Giới hạn DEMO tối đa 0.30 lot / 1.00%.
              </Typography>
            </Stack>

            {saveLotSettings.error ? (
              <Alert severity="error" sx={{ mt: 1.5 }}>
                {saveLotSettings.error instanceof Error ? saveLotSettings.error.message : String(saveLotSettings.error)}
              </Alert>
            ) : null}

            {lotSettings.error ? (
              <Alert severity="error" sx={{ mt: 1.5 }}>
                Không đọc được cấu hình lot: {lotSettings.error instanceof Error ? lotSettings.error.message : String(lotSettings.error)}
              </Alert>
            ) : !lotSettings.data ? (
              <Alert severity="info" sx={{ mt: 1.5 }}>Đang đọc cấu hình lot.</Alert>
            ) : lotSettings.data.restartRequired ? (
              <Alert severity="warning" sx={{ mt: 1.5 }}>
                Cấu hình đã lưu nhưng chưa áp dụng cho executor. Giữ PAUSE và chạy lại activate-phase7c-local.ps1 với -ArmExecutors; sau khi PASS mới chuyển AUTO.
              </Alert>
            ) : (
              <Alert severity="success" sx={{ mt: 1.5 }}>
                Executor đang dùng đúng cấu hình lot đã lưu.
              </Alert>
            )}
          </Box>

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
            {" · "}DEMO ONLY · Cấu hình chỉ áp dụng cho lệnh mới.
          </Typography>
        </CardContent>
      </Card>



      <Alert severity="warning">
        AUTO chọn TREND / SIDEWAY / PAUSE. Trend dùng fixed {configuredTrendLot.toFixed(2)} lot; Sideway dùng risk {configuredSidewayRisk.toFixed(2)}% với cap {configuredSidewayMaxLot.toFixed(2)}. Telegram chỉ đổi mode điều phối, không có quyền trực tiếp đặt/sửa/đóng lệnh MT5.
      </Alert>
    </Stack>
  );
}
