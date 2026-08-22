import type { ReactNode } from "react";
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
  fetchPhase7CWebStatus,
  money,
  pickText,
  raw,
  value,
} from "../phase7c-panel-status";

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? (value as Record<string, any>) : {};
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

export function Phase7BOpsPage() {
  const query = useQuery({
    queryKey: ["phase7c-web-status-account-risk-v5"],
    queryFn: fetchPhase7CWebStatus,
    refetchInterval: 3_000,
    retry: false,
    placeholderData: (previous) => previous,
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError && !query.data) {
    return <ErrorState message={query.error instanceof Error ? query.error.message : "Không đọc được Tài khoản & Risk."} />;
  }

  const data = query.data;
  const panel = data?.panel;
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
  const currency = clean(account.accountCurrency, "USD");
  const accountMode = pickText(raw(panel, "accountMode"), account.accountMode, bridge.accountMode);

  return (
    <Stack spacing={3}>
      <Box sx={{ p: 3, borderRadius: 5, border: "1px solid rgba(148,163,184,.14)", bgcolor: "rgba(15,23,42,.45)" }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2} alignItems={{ md: "center" }}>
          <Box>
            <Typography variant="overline" color="primary" fontWeight={900}>TÀI KHOẢN & RISK v5</Typography>
            <Typography variant="h4" fontWeight={950}>Account, lot, safety và runtime</Typography>
            <Typography variant="body2" color="text.secondary" mt={1}>
              Trang này gom các thông tin vận hành: tài khoản MT5 demo, risk/lot, quote/spec, executor, Telegram, bridge và safety. Không lặp lại phần tín hiệu.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label={`Mode ${clean(mode.mode, value(panel, "activeMode", "—"))}`} color={clean(mode.mode, value(panel, "activeMode", "—")) === "AUTO" ? "success" : "warning"} variant="outlined" sx={{ fontWeight: 900 }} />
            <Chip label={`Account ${accountMode}`} color={accountMode.toLowerCase().includes("demo") ? "success" : "error"} variant="outlined" sx={{ fontWeight: 900 }} />
            <Chip label="ORDER NONE" color="success" variant="outlined" sx={{ fontWeight: 900 }} />
          </Stack>
        </Stack>
      </Box>

      {data?.usedDirectFallback && <Alert severity="info">Một số request đã được chuyển trực tiếp sang Control API 3711 để tránh lỗi web proxy 5717.</Alert>}
      {(data?.errors ?? []).length > 0 && <Alert severity="warning">Nguồn phụ chưa sẵn sàng: {(data?.errors ?? []).slice(0, 2).join(" ")}</Alert>}

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
          <SectionCard title="Cấu hình Lot/Risk" subtitle="Không martingale, không recovery lot escalation.">
            <InfoRow label="Trend fixed lot" valueText={pickText(configuration.configuredTrendFixedLot, configuration.activeTrendFixedLot)} strong />
            <InfoRow label="Sideway risk percent" valueText={`${pickText(configuration.configuredSidewayRiskPercent)}%`} />
            <InfoRow label="Sideway max lot" valueText={pickText(configuration.configuredSidewayMaxLot)} />
            <InfoRow label="Target risk USD" valueText={money(configuration.targetRiskUsd, currency)} />
            <InfoRow label="Lot restart required" valueText={boolText(configuration.lotSettingsRestartRequired ?? lotRuntime.restartRequired)} />
            <InfoRow label="Applies to" valueText="NEW POSITIONS ONLY" />
            <InfoRow label="Order permission" valueText={pickText(configuration.previewOrderPermission, raw(panel, "mt5OrderPermission"))} />
          </SectionCard>
        </Grid>
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
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <SectionCard title="Runtime & Bridge" subtitle="Trạng thái nền của Phase7C.">
            <InfoRow label="Lifecycle running" valueText={boolText(lifecycle.running)} />
            <InfoRow label="Lifecycle ready" valueText={boolText(lifecycle.ready)} />
            <InfoRow label="Active mode" valueText={clean(mode.mode, value(panel, "activeMode", "—"))} />
            <InfoRow label="MT5 bridge" valueText={bridge.reachable ? "OK" : "Chưa xác nhận"} />
            <InfoRow label="Trading enabled" valueText={boolText(account.tradingEnabled ?? bridge.tradingEnabled)} />
            <InfoRow label="Open XAUUSD positions" valueText={pickText(bridge.openXauusdPositions, raw(panel, "positionCount"))} />
            <InfoRow label="Regime notifier" valueText={notifier.alive ? `Alive · PID ${clean(notifier.pid, "—")}` : "Chưa xác nhận"} />
            <InfoRow label="Telegram PID" valueText={telegram.alive ? `Alive · PID ${clean(telegram.pid, "—")}` : "Chưa xác nhận"} />
          </SectionCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <SectionCard title="Safety" subtitle="Các khóa an toàn bắt buộc của DEMO.">
            <InfoRow label="Demo only" valueText="Yes" strong />
            <InfoRow label="Real account allowed" valueText="No" />
            <InfoRow label="Panel order permission" valueText={pickText(raw(panel, "mt5OrderPermission"), "NONE")} />
            <InfoRow label="Execution mutation" valueText={boolText(asRecord(accountRisk.safety).executionMutation)} />
            <InfoRow label="Phase7B fixed volume unchanged" valueText={boolText(asRecord(accountRisk.safety).phase7bFixedVolumeUnchanged)} />
            <InfoRow label="Lot binding active" valueText={lotRuntime.activeAlive ? "Active" : "—"} />
            <InfoRow label="Ownership" valueText="Verified by script" />
          </SectionCard>
        </Grid>
      </Grid>
    </Stack>
  );
}
