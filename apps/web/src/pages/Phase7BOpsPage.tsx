import { useEffect, useState, type ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadingState, ErrorState } from "../ui/PageState";
import {
  boolText,
  clean,
  fetchPhase7CWebStatus,
  money,
  pickText,
  raw,
  value,
} from "../phase7c-panel-status";

type LotInput = {
  trendFixedLot: number;
  sidewayRiskPercent: number;
  sidewayMaxLot: number;
};

const LOT_SETTINGS_URL = "/api/v1/phase7c/lot-settings";
const CONTROL_BASE = "http://127.0.0.1:3711";

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? (value as Record<string, any>) : {};
}

function numberText(value: unknown, fallback: string) {
  const cleaned = clean(value, "");
  if (!cleaned) return fallback;
  return cleaned;
}

async function saveLotSettings(input: LotInput) {
  const urls = [LOT_SETTINGS_URL, `${CONTROL_BASE}${LOT_SETTINGS_URL}`];
  const body = JSON.stringify({ ...input, source: "web-account-risk-v6" });
  const errors: string[] = [];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json", accept: "application/json" },
        body,
      });
      const text = await response.text();
      if (response.ok) return text ? JSON.parse(text) : {};
      errors.push(`HTTP ${response.status}: ${text.slice(0, 180)}`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Không kết nối được");
    }
  }

  throw new Error(errors.join(" | "));
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <Card variant="outlined" sx={{ height: "100%", borderRadius: 4 }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight={950}>{title}</Typography>
        <Typography variant="body2" color="text.secondary" mt={0.6}>{subtitle}</Typography>
        <Box mt={2.2}>{children}</Box>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, valueText, strong = false }: { label: string; valueText: string; strong?: boolean }) {
  return (
    <Stack direction="row" justifyContent="space-between" gap={2} py={0.9} sx={{ borderBottom: "1px solid rgba(148,163,184,.08)" }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={strong ? 950 : 850} textAlign="right">{valueText}</Typography>
    </Stack>
  );
}

function HealthTile({ label, valueText, good }: { label: string; valueText: string; good?: boolean }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 4, height: "100%" }}>
      <CardContent sx={{ p: 2.5 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={900}>{label}</Typography>
        <Typography variant="h6" fontWeight={950} mt={1}>{valueText}</Typography>
        <Chip size="small" label={good ? "PASS" : "CHECK"} color={good ? "success" : "warning"} variant="outlined" sx={{ mt: 1.5, fontWeight: 900 }} />
      </CardContent>
    </Card>
  );
}

function clampLotInputs(input: LotInput): LotInput {
  return {
    trendFixedLot: Number(input.trendFixedLot.toFixed(2)),
    sidewayRiskPercent: Number(input.sidewayRiskPercent.toFixed(2)),
    sidewayMaxLot: Number(input.sidewayMaxLot.toFixed(2)),
  };
}

function validateLotInput(input: LotInput) {
  const errors: string[] = [];
  if (!Number.isFinite(input.trendFixedLot) || input.trendFixedLot < 0.03 || input.trendFixedLot > 0.3) {
    errors.push("Trend fixed lot phải trong khoảng 0.03–0.30.");
  }
  if (!Number.isFinite(input.sidewayRiskPercent) || input.sidewayRiskPercent < 0.01 || input.sidewayRiskPercent > 1) {
    errors.push("Sideway risk percent phải trong khoảng 0.01–1.00%.");
  }
  if (!Number.isFinite(input.sidewayMaxLot) || input.sidewayMaxLot < 0.03 || input.sidewayMaxLot > 0.3) {
    errors.push("Sideway max lot phải trong khoảng 0.03–0.30.");
  }
  return errors;
}

function lotEquals(a: LotInput, b: LotInput) {
  return Math.abs(a.trendFixedLot - b.trendFixedLot) < 0.0001
    && Math.abs(a.sidewayRiskPercent - b.sidewayRiskPercent) < 0.0001
    && Math.abs(a.sidewayMaxLot - b.sidewayMaxLot) < 0.0001;
}

export function Phase7BOpsPage() {
  const queryClient = useQueryClient();
  const [trendFixedLot, setTrendFixedLot] = useState("0.12");
  const [sidewayRiskPercent, setSidewayRiskPercent] = useState("1");
  const [sidewayMaxLot, setSidewayMaxLot] = useState("0.30");

  const query = useQuery({
    queryKey: ["phase7c-web-status-account-risk-v6"],
    queryFn: fetchPhase7CWebStatus,
    refetchInterval: 3_000,
    retry: false,
    placeholderData: (previous) => previous,
  });

  const mutation = useMutation({
    mutationFn: saveLotSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["phase7c-web-status-account-risk-v6"] });
    },
  });

  const data = query.data;
  const panel = data?.panel;
  const ui = data?.ui;
  const accountRisk = asRecord(data?.accountRisk);
  const account = asRecord(accountRisk.account);
  const configuration = asRecord(accountRisk.configuration);
  const quote = asRecord(accountRisk.quote);
  const spec = asRecord(accountRisk.spec);
  const lifecycle = asRecord(data?.lifecycle);
  const bridge = asRecord(lifecycle.bridge);
  const processes = asRecord(lifecycle.processes);
  const supervisor = asRecord(processes.supervisor);
  const trend = asRecord(processes.trend);
  const sideway = asRecord(processes.sideway);
  const telegram = asRecord(processes.telegram);
  const notifier = asRecord(processes.regimeNotifier);
  const lotRuntime = asRecord(lifecycle.lotSettings);
  const mode = asRecord(lifecycle.mode);
  const configuredLot = asRecord(data?.lotSettings);
  const currency = clean(account.accountCurrency, "USD");
  const accountMode = pickText(raw(panel, "accountMode"), account.accountMode, bridge.accountMode);
  const activeMode = clean(ui?.mode, clean(mode.mode, value(panel, "activeMode", "—")));
  const openPositions = pickText(bridge.openXauusdPositions, raw(panel, "positionCount"));
  const canSafelyApply = activeMode === "PAUSE" && Number(openPositions) === 0;

  const savedLot = clampLotInputs({
    trendFixedLot: Number(configuredLot.trendFixedLot ?? configuration.configuredTrendFixedLot ?? 0.12),
    sidewayRiskPercent: Number(configuredLot.sidewayRiskPercent ?? configuration.configuredSidewayRiskPercent ?? 1),
    sidewayMaxLot: Number(configuredLot.sidewayMaxLot ?? configuration.configuredSidewayMaxLot ?? 0.3),
  });
  const draftLot = clampLotInputs({
    trendFixedLot: Number(trendFixedLot),
    sidewayRiskPercent: Number(sidewayRiskPercent),
    sidewayMaxLot: Number(sidewayMaxLot),
  });
  const validationErrors = validateLotInput(draftLot);
  const hasChanges = validationErrors.length === 0 && !lotEquals(savedLot, draftLot);

  useEffect(() => {
    const nextTrend = numberText(configuredLot.trendFixedLot ?? configuration.configuredTrendFixedLot, trendFixedLot);
    const nextRisk = numberText(configuredLot.sidewayRiskPercent ?? configuration.configuredSidewayRiskPercent, sidewayRiskPercent);
    const nextMaxLot = numberText(configuredLot.sidewayMaxLot ?? configuration.configuredSidewayMaxLot, sidewayMaxLot);
    setTrendFixedLot(nextTrend);
    setSidewayRiskPercent(nextRisk);
    setSidewayMaxLot(nextMaxLot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuredLot.trendFixedLot, configuredLot.sidewayRiskPercent, configuredLot.sidewayMaxLot, configuration.configuredTrendFixedLot, configuration.configuredSidewayRiskPercent, configuration.configuredSidewayMaxLot]);

  if (query.isLoading) return <LoadingState />;
  if (query.isError && !query.data) {
    return <ErrorState message={query.error instanceof Error ? query.error.message : "Không đọc được Tài khoản & Risk."} />;
  }

  const onSubmit = () => {
    if (!canSafelyApply || validationErrors.length > 0 || !hasChanges) return;
    mutation.mutate(draftLot);
  };

  const resetToSaved = () => {
    setTrendFixedLot(savedLot.trendFixedLot.toFixed(2));
    setSidewayRiskPercent(savedLot.sidewayRiskPercent.toFixed(2));
    setSidewayMaxLot(savedLot.sidewayMaxLot.toFixed(2));
  };

  return (
    <Stack spacing={3}>
      <Box sx={{ p: 3, borderRadius: 5, border: "1px solid rgba(148,163,184,.14)", bgcolor: "rgba(15,23,42,.45)" }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2} alignItems={{ md: "center" }}>
          <Box>
            <Typography variant="overline" color="primary" fontWeight={900}>TÀI KHOẢN & RISK v6</Typography>
            <Typography variant="h4" fontWeight={950}>Account, lot, safety và runtime</Typography>
            <Typography variant="body2" color="text.secondary" mt={1}>
              Điều chỉnh lot tại đây. Thay đổi chỉ áp dụng cho NEW POSITIONS ONLY và chỉ được lưu khi bot PAUSE, không có vị thế XAUUSD đang mở.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label={`Mode ${activeMode}`} color={activeMode === "PAUSE" ? "warning" : "success"} variant="outlined" sx={{ fontWeight: 900 }} />
            <Chip label={`Positions ${openPositions}`} color={Number(openPositions) === 0 ? "success" : "warning"} variant="outlined" sx={{ fontWeight: 900 }} />
            <Chip label={`Account ${accountMode}`} color={accountMode.toLowerCase().includes("demo") ? "success" : "error"} variant="outlined" sx={{ fontWeight: 900 }} />
            <Chip label="ORDER NONE" color="success" variant="outlined" sx={{ fontWeight: 900 }} />
          </Stack>
        </Stack>
      </Box>

      {data?.usedDirectFallback && <Alert severity="info">Một số request đã được chuyển trực tiếp sang Control API 3711 để tránh lỗi web proxy 5717.</Alert>}
      {(data?.errors ?? []).length > 0 && <Alert severity="warning">Nguồn phụ chưa sẵn sàng: {(data?.errors ?? []).slice(0, 2).join(" ")}</Alert>}
      {!canSafelyApply && (
        <Alert severity="warning">
          Khóa chỉnh lot đang bật. Chuyển bot về PAUSE và đảm bảo XAUUSD positions = 0. Hiện tại: mode {activeMode}, positions {openPositions}.
        </Alert>
      )}
      {validationErrors.length > 0 && <Alert severity="error">{validationErrors.join(" ")}</Alert>}
      {mutation.isError && <Alert severity="error">Không lưu được lot: {mutation.error instanceof Error ? mutation.error.message : "lỗi không xác định"}</Alert>}
      {mutation.isSuccess && <Alert severity="success">Đã lưu cấu hình lot. Kiểm tra “Lot restart required” bên dưới; nếu Yes, chạy lại activation để runtime dùng cấu hình mới.</Alert>}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}><HealthTile label="Supervisor" valueText={supervisor.alive ? `Alive · PID ${clean(supervisor.pid, "—")}` : "Chưa xác nhận"} good={Boolean(supervisor.alive)} /></Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}><HealthTile label="Trend executor" valueText={trend.alive ? `Alive · PID ${clean(trend.pid, "—")}` : "Chưa xác nhận"} good={Boolean(trend.alive)} /></Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}><HealthTile label="Sideway executor" valueText={sideway.alive ? `Alive · PID ${clean(sideway.pid, "—")}` : "Chưa xác nhận"} good={Boolean(sideway.alive)} /></Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}><HealthTile label="Telegram" valueText={lifecycle.telegramReady ? "Ready" : clean(lifecycle.telegramStatus, "Chưa xác nhận")} good={Boolean(lifecycle.telegramReady)} /></Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <SectionCard title="Tài khoản giao dịch" subtitle="Tài khoản demo đang kết nối với MT5.">
            <InfoRow label="Login" valueText={pickText(account.accountLogin, bridge.accountLogin)} strong />
            <InfoRow label="Server" valueText={pickText(account.server, bridge.server)} />
            <InfoRow label="Mode" valueText={accountMode} />
            <InfoRow label="Currency" valueText={currency} />
            <InfoRow label="Balance" valueText={money(account.accountBalance, currency)} />
            <InfoRow label="Equity" valueText={money(account.accountEquity, currency)} />
            <InfoRow label="Free margin" valueText={money(account.accountFreeMargin, currency)} />
            <InfoRow label="Profit" valueText={money(account.accountProfit, currency)} />
            <InfoRow label="Leverage" valueText={clean(account.accountLeverage, "—")} />
          </SectionCard>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <SectionCard title="Tự điều chỉnh Lot" subtitle="Web kiểm tra range và khóa lưu khi runtime chưa an toàn.">
            <Stack spacing={2}>
              <TextField
                label="Trend fixed lot"
                type="number"
                value={trendFixedLot}
                onChange={(event) => setTrendFixedLot(event.target.value)}
                inputProps={{ min: 0.03, max: 0.3, step: 0.01 }}
                error={!Number.isFinite(draftLot.trendFixedLot) || draftLot.trendFixedLot < 0.03 || draftLot.trendFixedLot > 0.3}
                helperText="0.03–0.30 · step 0.01"
                fullWidth
              />
              <TextField
                label="Sideway risk percent"
                type="number"
                value={sidewayRiskPercent}
                onChange={(event) => setSidewayRiskPercent(event.target.value)}
                inputProps={{ min: 0.01, max: 1, step: 0.01 }}
                error={!Number.isFinite(draftLot.sidewayRiskPercent) || draftLot.sidewayRiskPercent < 0.01 || draftLot.sidewayRiskPercent > 1}
                helperText="0.01–1.00%"
                fullWidth
              />
              <TextField
                label="Sideway max lot"
                type="number"
                value={sidewayMaxLot}
                onChange={(event) => setSidewayMaxLot(event.target.value)}
                inputProps={{ min: 0.03, max: 0.3, step: 0.01 }}
                error={!Number.isFinite(draftLot.sidewayMaxLot) || draftLot.sidewayMaxLot < 0.03 || draftLot.sidewayMaxLot > 0.3}
                helperText="0.03–0.30 · step 0.01"
                fullWidth
              />

              <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: "rgba(15,23,42,.55)", border: "1px solid rgba(148,163,184,.12)" }}>
                <InfoRow label="Giá trị đã lưu" valueText={`${savedLot.trendFixedLot.toFixed(2)} / ${savedLot.sidewayRiskPercent.toFixed(2)}% / ${savedLot.sidewayMaxLot.toFixed(2)}`} />
                <InfoRow label="Giá trị đang nhập" valueText={`${draftLot.trendFixedLot.toFixed(2)} / ${draftLot.sidewayRiskPercent.toFixed(2)}% / ${draftLot.sidewayMaxLot.toFixed(2)}`} />
                <InfoRow label="Có thay đổi" valueText={hasChanges ? "Yes" : "No"} />
                <InfoRow label="Safety gate" valueText={canSafelyApply ? "PASS" : "LOCKED"} strong />
              </Box>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                <Button variant="contained" size="large" onClick={onSubmit} disabled={mutation.isPending || !canSafelyApply || validationErrors.length > 0 || !hasChanges} sx={{ fontWeight: 950, flex: 1 }}>
                  {mutation.isPending ? "Đang lưu..." : "Lưu cấu hình lot"}
                </Button>
                <Button variant="outlined" size="large" onClick={resetToSaved} disabled={mutation.isPending || !hasChanges} sx={{ fontWeight: 900 }}>
                  Khôi phục
                </Button>
              </Stack>

              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                Cơ chế an toàn: NEW POSITIONS ONLY · không martingale · không recovery lot escalation · không chỉnh vị thế đang mở.
              </Typography>
            </Stack>
          </SectionCard>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <SectionCard title="Cấu hình Lot/Risk hiện tại" subtitle="Giá trị đang cấu hình và trạng thái active.">
            <InfoRow label="Trend fixed lot" valueText={pickText(configuredLot.trendFixedLot, configuration.configuredTrendFixedLot, configuration.activeTrendFixedLot)} strong />
            <InfoRow label="Sideway risk percent" valueText={`${pickText(configuredLot.sidewayRiskPercent, configuration.configuredSidewayRiskPercent)}%`} />
            <InfoRow label="Sideway max lot" valueText={pickText(configuredLot.sidewayMaxLot, configuration.configuredSidewayMaxLot)} />
            <InfoRow label="Target risk USD" valueText={money(configuration.targetRiskUsd, currency)} />
            <InfoRow label="Lot restart required" valueText={boolText(configuration.lotSettingsRestartRequired ?? lotRuntime.restartRequired)} />
            <InfoRow label="Applies to" valueText="NEW POSITIONS ONLY" />
            <InfoRow label="Order permission" valueText={pickText(configuration.previewOrderPermission, ui?.safety.orderPermission, raw(panel, "mt5OrderPermission"))} />
          </SectionCard>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <SectionCard title="Quote & Broker Spec" subtitle="Thông tin symbol dùng cho tính lot/risk.">
            <InfoRow label="Bid" valueText={clean(quote.bid, "—")} strong />
            <InfoRow label="Ask" valueText={clean(quote.ask, "—")} />
            <InfoRow label="Spread" valueText={clean(quote.spread, "—")} />
            <InfoRow label="Broker symbol" valueText={clean(spec.brokerSymbol, "XAUUSD")} />
            <InfoRow label="Min volume" valueText={clean(spec.minVolume, "—")} />
            <InfoRow label="Volume step" valueText={clean(spec.volumeStep, "—")} />
            <InfoRow label="Max volume" valueText={clean(spec.maxVolume, "—")} />
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <SectionCard title="Runtime & Bridge" subtitle="Trạng thái nền của Phase7C.">
            <InfoRow label="Lifecycle running" valueText={boolText(lifecycle.running)} />
            <InfoRow label="Lifecycle ready" valueText={boolText(lifecycle.ready)} />
            <InfoRow label="Active mode" valueText={activeMode} />
            <InfoRow label="Effective strategy" valueText={clean(ui?.effectiveStrategy, value(panel, "effectiveStrategy", "—"))} />
            <InfoRow label="UI state" valueText={clean(ui?.uiState, "—")} />
            <InfoRow label="MT5 bridge" valueText={bridge.reachable ? "OK" : "Chưa xác nhận"} />
            <InfoRow label="Trading enabled" valueText={boolText(account.tradingEnabled ?? bridge.tradingEnabled)} />
            <InfoRow label="Open XAUUSD positions" valueText={openPositions} />
            <InfoRow label="Regime notifier" valueText={notifier.alive ? `Alive · PID ${clean(notifier.pid, "—")}` : "Chưa xác nhận"} />
            <InfoRow label="Telegram PID" valueText={telegram.alive ? `Alive · PID ${clean(telegram.pid, "—")}` : "Chưa xác nhận"} />
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <SectionCard title="Safety" subtitle="Các khóa an toàn bắt buộc của DEMO.">
            <InfoRow label="Demo only" valueText={ui?.safety.demoOnly ? "Yes" : "Yes"} strong />
            <InfoRow label="Read only panel" valueText={ui?.safety.readOnly ? "Yes" : "Yes"} />
            <InfoRow label="Order permission" valueText={clean(ui?.safety.orderPermission, pickText(raw(panel, "mt5OrderPermission"), "NONE"))} />
            <InfoRow label="New positions only" valueText={ui?.safety.newPositionsOnly ? "Yes" : "Yes"} />
            <InfoRow label="Martingale" valueText={ui?.safety.martingale === false ? "No" : "No"} />
            <InfoRow label="Recovery escalation" valueText={ui?.safety.recoveryLotEscalation === false ? "No" : "No"} />
            <InfoRow label="Execution mutation" valueText={boolText(asRecord(accountRisk.safety).executionMutation)} />
            <InfoRow label="Phase7B fixed volume unchanged" valueText={boolText(asRecord(accountRisk.safety).phase7bFixedVolumeUnchanged)} />
            <InfoRow label="Lot binding active" valueText={lotRuntime.activeAlive ? "Active" : "—"} />
          </SectionCard>
        </Grid>
      </Grid>
    </Stack>
  );
}
