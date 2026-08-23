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

function PanelCard({ title, children, accent = "cyan" }: { title: string; children: ReactNode; accent?: "cyan" | "green" | "red" | "orange" | "purple" }) {
  const colorMap = {
    cyan: "rgba(0,213,255,.45)",
    green: "rgba(74,222,128,.45)",
    red: "rgba(248,113,113,.45)",
    orange: "rgba(251,191,36,.45)",
    purple: "rgba(168,85,247,.45)",
  } as const;
  return (
    <Card
      variant="outlined"
      sx={{
        height: "100%",
        borderRadius: 3,
        bgcolor: "rgba(3,10,18,.72)",
        borderColor: colorMap[accent],
        boxShadow: `0 0 24px ${colorMap[accent].replace(".45", ".10")}`,
      }}
    >
      <CardContent sx={{ p: 2.2 }}>
        <Typography variant="subtitle2" fontWeight={950} sx={{ letterSpacing: ".03em" }}>
          {title}
        </Typography>
        <Box mt={1.4}>{children}</Box>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, valueText, tone = "default" }: { label: string; valueText: string; tone?: "default" | "success" | "error" | "warning" | "info" }) {
  const color = tone === "success" ? "success.main" : tone === "error" ? "error.main" : tone === "warning" ? "warning.main" : tone === "info" ? "info.main" : "text.primary";
  return (
    <Stack direction="row" justifyContent="space-between" gap={2} py={0.7} sx={{ borderBottom: "1px solid rgba(148,163,184,.09)" }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={900} color={color} textAlign="right">{valueText}</Typography>
    </Stack>
  );
}

function HeaderChip({ label, valueText, color = "default" }: { label: string; valueText: string; color?: "success" | "warning" | "error" | "info" | "secondary" | "default" }) {
  return (
    <Stack spacing={0.6} alignItems="center" minWidth={120}>
      <Typography variant="caption" color="text.secondary" fontWeight={900}>{label}</Typography>
      <Chip label={valueText} color={color} sx={{ fontWeight: 950, minWidth: 96 }} />
    </Stack>
  );
}

function ReasonBox({ title, items, accent = "cyan" }: { title: string; items: string[]; accent?: "cyan" | "purple" | "orange" | "green" }) {
  return (
    <PanelCard title={title} accent={accent === "cyan" ? "cyan" : accent === "purple" ? "purple" : accent === "green" ? "green" : "orange"}>
      <Stack spacing={0.9}>
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">Chưa có dữ liệu.</Typography>
        ) : items.map((item, index) => (
          <Typography key={`${title}-${index}`} variant="body2" lineHeight={1.5}>
            • {item}
          </Typography>
        ))}
      </Stack>
    </PanelCard>
  );
}

function MiniChart({ panel }: { panel: Record<string, string> | undefined }) {
  const entry = value(panel, "entry", "—");
  const sl = value(panel, "stopLoss", "—");
  const tp1 = value(panel, "tp1", "—");
  const tp2 = value(panel, "tp2", "—");
  const hasPlan = entry !== "—" || sl !== "—" || tp1 !== "—" || tp2 !== "—";
  return (
    <Box
      sx={{
        position: "relative",
        height: 420,
        borderRadius: 3,
        overflow: "hidden",
        bgcolor: "#020914",
        border: "1px solid rgba(0,213,255,.22)",
        backgroundImage:
          "linear-gradient(rgba(148,163,184,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.08) 1px, transparent 1px)",
        backgroundSize: "54px 42px",
      }}
    >
      <Stack direction="row" justifyContent="space-between" p={2}>
        <Box>
          <Typography variant="h6" fontWeight={950}>XAUUSD · M15</Typography>
          <Typography variant="caption" color="text.secondary">Gold vs US Dollar</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Chip label={`Bid ${value(panel, "currentPrice", "—")}`} variant="outlined" color="info" />
          <Chip label={`Stage ${value(panel, "stage", "—")}`} variant="outlined" color={stageTone(value(panel, "stage", ""))} />
        </Stack>
      </Stack>

      <Box sx={{ position: "absolute", left: 48, right: 72, top: 145, borderTop: "2px dashed rgba(59,130,246,.95)" }} />
      <Box sx={{ position: "absolute", left: 48, right: 72, top: 230, borderTop: "2px dashed rgba(248,113,113,.95)" }} />
      <Box sx={{ position: "absolute", left: 48, right: 72, top: 96, borderTop: "2px dashed rgba(34,197,94,.95)" }} />
      <Box sx={{ position: "absolute", left: 48, right: 72, top: 54, borderTop: "2px dashed rgba(34,197,94,.65)" }} />
      <Typography sx={{ position: "absolute", right: 28, top: 132 }} color="info.main" fontWeight={950}>ENTRY {entry}</Typography>
      <Typography sx={{ position: "absolute", right: 28, top: 217 }} color="error.main" fontWeight={950}>SL {sl}</Typography>
      <Typography sx={{ position: "absolute", right: 28, top: 83 }} color="success.main" fontWeight={950}>TP1 {tp1}</Typography>
      <Typography sx={{ position: "absolute", right: 28, top: 41 }} color="success.main" fontWeight={950}>TP2 {tp2}</Typography>

      <Box sx={{ position: "absolute", left: 32, bottom: 20, px: 1.2, py: 0.8, borderRadius: 2, bgcolor: "rgba(15,23,42,.85)", border: "1px solid rgba(0,213,255,.20)" }}>
        <Typography variant="caption" color="text.secondary">AI REGIME SCORE</Typography>
        <Stack direction="row" spacing={1} mt={0.6} alignItems="center">
          <Chip label={`${value(panel, "regime", "—")} ${value(panel, "confidence", "—")}%`} color="info" size="small" sx={{ fontWeight: 900 }} />
          <Chip label={hasPlan ? "TRADE PLAN" : "WAITING"} color={hasPlan ? "success" : "warning"} size="small" variant="outlined" sx={{ fontWeight: 900 }} />
        </Stack>
      </Box>
    </Box>
  );
}

function StatusDot({ label, ok }: { label: string; ok: boolean }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" py={0.55}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Stack direction="row" spacing={0.8} alignItems="center">
        <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: ok ? "success.main" : "warning.main", boxShadow: ok ? "0 0 10px rgba(34,197,94,.65)" : "none" }} />
        <Typography variant="caption" fontWeight={900}>{ok ? "KẾT NỐI" : "CHECK"}</Typography>
      </Stack>
    </Stack>
  );
}

export function Phase7BDemoPage() {
  const query = useQuery({
    queryKey: ["phase7c-web-final-dashboard"],
    queryFn: fetchPhase7CWebStatus,
    refetchInterval: 3_000,
    retry: false,
    placeholderData: (previous) => previous,
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError && !query.data) {
    return <ErrorState message={query.error instanceof Error ? query.error.message : "Không đọc được Dashboard."} />;
  }

  const data = query.data;
  const panel = data?.panel;
  const lifecycle = asRecord(data?.lifecycle);
  const accountRisk = asRecord(data?.accountRisk);
  const account = asRecord(accountRisk.account);
  const config = asRecord(accountRisk.configuration);
  const bridge = asRecord(lifecycle.bridge);
  const processes = asRecord(lifecycle.processes);
  const lotRuntime = asRecord(lifecycle.lotSettings);
  const currency = clean(account.accountCurrency, "USD");
  const mode = modeDisplay(panel);
  const stage = value(panel, "stage", "—");
  const regime = value(panel, "regime", "—");
  const confidence = value(panel, "confidence", "—");
  const positionState = raw(panel, "positionState");
  const hasPosition = positionState === "MANAGING" || Number(raw(panel, "positionCount")) > 0;
  const profit = value(panel, "floatingPnlUsd", "—");

  const entryReasons = compactReason(raw(panel, "entryReason") || raw(panel, "decisionReason"), "Chưa có setup hợp lệ.");
  const holdReasons = compactReason(raw(panel, "holdReason"), hasPosition ? "Đang theo dõi điều kiện giữ lệnh." : "Chưa có vị thế đang mở. Bot đang chờ setup hợp lệ.");
  const exitReasons = hasPosition ? ["Chưa có tín hiệu chốt lệnh."] : ["Chưa có lệnh đang mở nên chưa có lý do chốt."];

  const trendRules = [
    "Regime = TREND, mode AUTO hoặc TREND.",
    "M15 đóng nến có mẫu hợp lệ: Engulfing / 2-candle / 3-candle body dominance.",
    "Supertrend M15/M5 cùng hướng với tín hiệu; SL chuẩn 6-10 giá.",
    "Nếu SL > 10 giá: không vào ngay, chờ pullback sau nến M15 xác nhận.",
  ];

  const sidewayRules = [
    "Regime = SIDEWAY, mode AUTO hoặc SIDEWAY.",
    "Giá chạm vùng supply/demand hoặc biên range còn hiệu lực.",
    "Có tín hiệu đảo chiều tại vùng biên, RR phù hợp.",
    "Risk theo Sideway Risk %, lot không vượt Sideway Max Lot.",
  ];

  return (
    <Stack spacing={2.4}>
      <Box sx={{ p: 2, borderRadius: 4, bgcolor: "rgba(3,10,18,.82)", border: "1px solid rgba(0,213,255,.18)" }}>
        <Stack direction={{ xs: "column", xl: "row" }} justifyContent="space-between" gap={2} alignItems={{ xl: "center" }}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h5" fontWeight={950}>XAUUSD AI MASTER</Typography>
              <Chip label="PHASE7C" color="secondary" size="small" sx={{ fontWeight: 950 }} />
            </Stack>
            <Typography variant="body2" color="text.secondary" mt={0.5}>MT5 DASHBOARD · Final UI · DEMO ONLY · READ ONLY</Typography>
          </Box>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <HeaderChip label="CHẾ ĐỘ BOT" valueText={mode} color={mode.includes("PAUSE") ? "warning" : "success"} />
            <HeaderChip label="TRẠNG THÁI" valueText={stage} color={stageTone(stage)} />
            <HeaderChip label="REGIME HIỆN TẠI" valueText={regime} color={regime === "REVERSAL" ? "warning" : "info"} />
            <HeaderChip label="CONF" valueText={`${confidence}%`} color="default" />
          </Stack>
        </Stack>
      </Box>

      {data?.usedDirectFallback && <Alert severity="info">Web proxy 5717 chưa ổn định nên dashboard đang đọc trực tiếp Control API 3711.</Alert>}
      {(data?.errors ?? []).length > 0 && <Alert severity="warning">Một số nguồn phụ chưa sẵn sàng: {(data?.errors ?? []).slice(0, 2).join(" ")}</Alert>}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 3 }}>
          <Stack spacing={2}>
            <PanelCard title="TÀI KHOẢN" accent="cyan">
              <InfoRow label="Server" valueText={pickText(account.server, bridge.server)} />
              <InfoRow label="Account" valueText={pickText(account.accountLogin, bridge.accountLogin)} />
              <InfoRow label="Mode" valueText={pickText(raw(panel, "accountMode"), account.accountMode, bridge.accountMode)} tone="success" />
              <InfoRow label="Balance" valueText={money(account.accountBalance, currency)} />
              <InfoRow label="Equity" valueText={money(account.accountEquity, currency)} />
              <InfoRow label="Free Margin" valueText={money(account.accountFreeMargin, currency)} />
              <InfoRow label="Profit" valueText={money(account.accountProfit, currency)} tone={Number(account.accountProfit) >= 0 ? "success" : "error"} />
            </PanelCard>

            <PanelCard title="CẤU HÌNH LOT" accent="green">
              <InfoRow label="Trend Fixed Lot" valueText={pickText(config.configuredTrendFixedLot, raw(panel, "finalLot"))} />
              <InfoRow label="Sideway Risk %" valueText={`${pickText(config.configuredSidewayRiskPercent, "1")}%`} />
              <InfoRow label="Sideway Max Lot" valueText={pickText(config.configuredSidewayMaxLot, "0.30")} />
              <InfoRow label="Auto Lot Mode" valueText="AUTO_LOT_SHADOW" />
              <InfoRow label="Áp dụng" valueText="NEW_POSITIONS_ONLY" />
            </PanelCard>

            <PanelCard title="TRẠNG THÁI HỆ THỐNG" accent="green">
              <StatusDot label="Market Data" ok={Boolean(bridge.reachable || panel)} />
              <StatusDot label="AI Engine" ok={Boolean(panel)} />
              <StatusDot label="Risk Manager" ok={Boolean(accountRisk.configuration)} />
              <StatusDot label="Trade Executor" ok={Boolean(asRecord(processes.trend).alive || asRecord(processes.sideway).alive)} />
              <StatusDot label="Telegram" ok={Boolean(lifecycle.telegramReady)} />
              <StatusDot label="Lot Binding" ok={Boolean(lotRuntime.activeAlive)} />
            </PanelCard>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Stack spacing={2}>
            <MiniChart panel={panel} />
            <PanelCard title="NHẬT KÝ GIAO DỊCH GẦN NHẤT" accent="cyan">
              <Stack spacing={1.1}>
                {["Chưa có nhật ký giao dịch mới từ payload hiện tại.", "Khi có lệnh, bảng này sẽ hiển thị: thời gian, loại, lot, entry, SL, TP, lý do vào, kết quả, profit."].map((item, index) => (
                  <Typography key={index} variant="body2" color="text.secondary">• {item}</Typography>
                ))}
              </Stack>
            </PanelCard>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, lg: 3 }}>
          <Stack spacing={2}>
            <PanelCard title="CHI TIẾT LỆNH ĐANG MỞ" accent={hasPosition ? "green" : "orange"}>
              {hasPosition ? (
                <>
                  <Stack direction="row" spacing={1} alignItems="center" mb={1.2}>
                    <Chip label={value(panel, "positionSide", "—")} color="success" sx={{ fontWeight: 950 }} />
                    <Typography variant="body2" color="text.secondary">Ticket #{value(panel, "ticket", "—")}</Typography>
                  </Stack>
                  <InfoRow label="Entry Price" valueText={value(panel, "positionEntry", "—")} />
                  <InfoRow label="Stop Loss" valueText={value(panel, "positionStopLoss", "—")} tone="error" />
                  <InfoRow label="TP1" valueText={value(panel, "positionTp1", "—")} tone="success" />
                  <InfoRow label="TP2" valueText={value(panel, "positionTp2", "—")} tone="success" />
                  <InfoRow label="Lot" valueText={value(panel, "positionVolume", "—")} />
                  <InfoRow label="Profit" valueText={`${profit} USD`} tone={Number(profit) >= 0 ? "success" : "error"} />
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">Không có vị thế XAUUSD đang mở. Bot đang chờ setup hợp lệ.</Typography>
              )}
            </PanelCard>

            <ReasonBox title={hasPosition ? "LÝ DO VÀO LỆNH" : "LÝ DO CHƯA VÀO LỆNH"} items={entryReasons} accent="cyan" />
            <ReasonBox title="LÝ DO GIỮ LỆNH" items={holdReasons} accent="purple" />
            <ReasonBox title="LÝ DO CHỐT LỆNH" items={exitReasons} accent="orange" />
            <PanelCard title="PROFIT" accent={hasPosition && Number(profit) >= 0 ? "green" : "orange"}>
              <Typography variant="h4" fontWeight={950} color={hasPosition && Number(profit) >= 0 ? "success.main" : "text.secondary"}>
                {hasPosition ? `${profit} USD` : "—"}
              </Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>Floating P/L theo vị thế đang quản lý.</Typography>
            </PanelCard>
          </Stack>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <ReasonBox title="ĐIỀU KIỆN TREND BOT — ĐÃ CHỈNH LẠI" items={trendRules} accent="green" />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ReasonBox title="ĐIỀU KIỆN SIDEWAY BOT" items={sidewayRules} accent="cyan" />
        </Grid>
      </Grid>

      <Box sx={{ px: 2, py: 1.4, borderRadius: 3, bgcolor: "rgba(3,10,18,.82)", border: "1px solid rgba(148,163,184,.16)" }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5}>
          <Typography variant="body2">BOT STATUS: <b>{stage}</b></Typography>
          <Typography variant="body2">EXECUTORS: TREND {asRecord(processes.trend).alive ? "✓" : "—"} | SIDEWAY {asRecord(processes.sideway).alive ? "✓" : "—"}</Typography>
          <Typography variant="body2">RISK MODE: DEMO ONLY</Typography>
          <Typography variant="body2">TELEGRAM: {lifecycle.telegramReady ? "KẾT NỐI" : "CHECK"}</Typography>
          <Typography variant="body2">AUTO-LOT: {lotRuntime.activeAlive ? "ON" : "CHECK"}</Typography>
        </Stack>
      </Box>
    </Stack>
  );
}
