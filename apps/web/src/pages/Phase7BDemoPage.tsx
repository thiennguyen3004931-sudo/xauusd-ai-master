import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { LoadingState, ErrorState } from "../ui/PageState";
import {
  boolText,
  clean,
  compactReason,
  fetchPhase7CWebStatus,
  modeDisplay,
  money,
  pickText,
  raw,
  stageTone,
  value,
} from "../phase7c-panel-status";

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? (value as Record<string, any>) : {};
}

function KpiCard({
  label,
  valueText,
  detail,
  chip,
  tone = "default",
}: {
  label: string;
  valueText: string;
  detail: string;
  chip?: string;
  tone?: "success" | "warning" | "error" | "default";
}) {
  return (
    <Card variant="outlined" sx={{ height: "100%", borderRadius: 4 }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
          <Typography variant="caption" color="text.secondary" fontWeight={900} letterSpacing=".06em">
            {label}
          </Typography>
          {chip && <Chip size="small" label={chip} color={tone} variant="outlined" sx={{ fontWeight: 900 }} />}
        </Stack>
        <Typography variant="h5" fontWeight={950} mt={1.7}>{valueText}</Typography>
        <Typography variant="body2" color="text.secondary" mt={1.1}>{detail}</Typography>
      </CardContent>
    </Card>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
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
      <Typography variant="body2" fontWeight={strong ? 950 : 800} textAlign="right">{valueText}</Typography>
    </Stack>
  );
}

export function Phase7BDemoPage() {
  const query = useQuery({
    queryKey: ["phase7c-web-status-dashboard-v5"],
    queryFn: fetchPhase7CWebStatus,
    refetchInterval: 3_000,
    retry: false,
    placeholderData: (previous) => previous,
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError && !query.data) {
    return <ErrorState message={query.error instanceof Error ? query.error.message : "Không đọc được Dashboard Phase7C."} />;
  }

  const data = query.data;
  const panel = data?.panel;
  const accountRisk = asRecord(data?.accountRisk);
  const account = asRecord(accountRisk.account);
  const configuration = asRecord(accountRisk.configuration);
  const lifecycle = asRecord(data?.lifecycle);
  const bridge = asRecord(lifecycle.bridge);
  const processes = asRecord(lifecycle.processes);
  const supervisor = asRecord(processes.supervisor);
  const trend = asRecord(processes.trend);
  const sideway = asRecord(processes.sideway);
  const lotRuntime = asRecord(lifecycle.lotSettings);

  const stage = value(panel, "stage", "—");
  const regime = value(panel, "regime", "—");
  const confidence = value(panel, "confidence", "—");
  const activeMode = value(panel, "activeMode", clean(asRecord(lifecycle.mode).mode, "—"));
  const strategy = value(panel, "effectiveStrategy", "—");
  const accountMode = pickText(raw(panel, "accountMode"), account.accountMode, bridge.accountMode);
  const login = pickText(account.accountLogin, bridge.accountLogin);
  const server = pickText(account.server, bridge.server);
  const currency = clean(account.accountCurrency, "USD");
  const entryReasons = compactReason(raw(panel, "entryReason"), "Chưa có lý do vào lệnh.");
  const holdReasons = compactReason(raw(panel, "holdReason"), "Đang chờ setup hợp lệ.");
  const errors = data?.errors ?? [];

  return (
    <Stack spacing={3}>
      <Box
        sx={{
          p: { xs: 2.5, md: 3.5 },
          borderRadius: 5,
          border: "1px solid rgba(148,163,184,.14)",
          background: "linear-gradient(135deg, rgba(233,185,73,.10), rgba(14,165,233,.06) 45%, rgba(15,23,42,.40))",
        }}
      >
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2} alignItems={{ md: "center" }}>
          <Box>
            <Typography variant="overline" color="primary" fontWeight={900}>XAUUSD AI MASTER · DEMO DASHBOARD v5</Typography>
            <Typography variant="h4" fontWeight={950} mt={0.5}>Tổng quan vận hành chuyên nghiệp</Typography>
            <Typography variant="body2" color="text.secondary" mt={1} maxWidth={880}>
              AUTO đang bật nhưng chiến lược hiệu lực có thể PAUSE theo regime/stage. Dashboard gom trạng thái bot, tài khoản giao dịch, risk/lot, hệ thống và lý do chờ lệnh trong một màn hình.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label={`Mode ${activeMode}`} color={activeMode === "AUTO" ? "success" : "warning"} variant="outlined" sx={{ fontWeight: 900 }} />
            <Chip label={`Stage ${stage}`} color={stageTone(stage)} variant="outlined" sx={{ fontWeight: 900 }} />
            <Chip label={`Account ${accountMode}`} color={accountMode.toLowerCase().includes("demo") ? "success" : "error"} variant="outlined" sx={{ fontWeight: 900 }} />
          </Stack>
        </Stack>
      </Box>

      {data?.usedDirectFallback && (
        <Alert severity="info">Web proxy 5717 đang lỗi ở một số endpoint; dashboard đã tự lấy trực tiếp từ Control API 3711.</Alert>
      )}
      {errors.length > 0 && (
        <Alert severity="warning">Một số nguồn phụ chưa sẵn sàng: {errors.slice(0, 2).join(" ")}</Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <KpiCard label="BOT MODE" valueText={modeDisplay(panel)} detail={`Active ${activeMode} · Effective ${strategy}`} chip={activeMode} tone={activeMode === "AUTO" ? "success" : "warning"} />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <KpiCard label="MARKET REGIME" valueText={regime} detail={`Confidence ${confidence}/100 · Recommended ${value(panel, "recommendedMode", "—")}`} chip={`CONF ${confidence}`} tone={regime === "REVERSAL" ? "warning" : "default"} />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <KpiCard label="DECISION" valueText={stage} detail={value(panel, "limitReason", "Không có lệnh mới.")} chip={stage} tone={stageTone(stage)} />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <KpiCard label="ACCOUNT" valueText={login === "—" ? accountMode : `#${login}`} detail={`${server} · ${accountMode}`} chip="DEMO" tone="success" />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <SectionCard title="Tài khoản giao dịch" subtitle="Thông tin lấy từ MT5 demo / account-risk.">
            <InfoRow label="Login" valueText={login} strong />
            <InfoRow label="Server" valueText={server} />
            <InfoRow label="Account mode" valueText={accountMode} />
            <InfoRow label="Trading enabled" valueText={boolText(account.tradingEnabled ?? bridge.tradingEnabled)} />
            <InfoRow label="XAUUSD positions" valueText={pickText(bridge.openXauusdPositions, raw(panel, "positionCount"))} />
            <InfoRow label="Balance" valueText={money(account.accountBalance, currency)} />
            <InfoRow label="Equity" valueText={money(account.accountEquity, currency)} />
            <InfoRow label="Free margin" valueText={money(account.accountFreeMargin, currency)} />
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <SectionCard title="Risk & Lot" subtitle="Chỉ áp dụng cho lệnh mới, không mutate vị thế cũ.">
            <InfoRow label="Trend fixed lot" valueText={pickText(configuration.configuredTrendFixedLot, raw(panel, "finalLot"))} strong />
            <InfoRow label="Sideway risk" valueText={`${pickText(configuration.configuredSidewayRiskPercent)}%`} />
            <InfoRow label="Sideway max lot" valueText={pickText(configuration.configuredSidewayMaxLot)} />
            <InfoRow label="Recommended lot" valueText={value(panel, "lotCap", pickText(configuration.maxLot))} />
            <InfoRow label="Order permission" valueText={pickText(configuration.previewOrderPermission, raw(panel, "mt5OrderPermission"))} />
            <InfoRow label="Restart required" valueText={boolText(configuration.lotSettingsRestartRequired ?? lotRuntime.restartRequired)} />
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <SectionCard title="Hệ thống" subtitle="Runtime chính, executor và lot binding.">
            <InfoRow label="Supervisor" valueText={supervisor.alive ? "Alive" : "—"} strong />
            <InfoRow label="Trend executor" valueText={trend.alive ? "Alive" : "—"} />
            <InfoRow label="Sideway executor" valueText={sideway.alive ? "Alive" : "—"} />
            <InfoRow label="Telegram" valueText={lifecycle.telegramReady ? "Ready" : clean(lifecycle.telegramStatus, "—")} />
            <InfoRow label="MT5 Bridge" valueText={bridge.reachable ? "OK" : "—"} />
            <InfoRow label="Lot binding" valueText={lotRuntime.activeAlive ? "Active" : "—"} />
          </SectionCard>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <SectionCard title="Lý do vào / chờ lệnh" subtitle="Rút gọn theo Decision Monitor, đồng bộ với panel MT5.">
            <Stack spacing={1.1}>{entryReasons.map((reason) => <Typography key={reason} variant="body2">• {reason}</Typography>)}</Stack>
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <SectionCard title="Lý do giữ / không gửi lệnh" subtitle="Giải thích vì sao bot không mở lệnh mới ở thời điểm hiện tại.">
            <Stack spacing={1.1}>{holdReasons.map((reason) => <Typography key={reason} variant="body2" color="text.secondary">• {reason}</Typography>)}</Stack>
          </SectionCard>
        </Grid>
      </Grid>
    </Stack>
  );
}
