import { useEffect, useRef, type ReactNode } from "react";
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
import { ColorType, LineStyle, createChart, type UTCTimestamp } from "lightweight-charts";
import { LoadingState, ErrorState } from "../ui/PageState";
import {
  clean,
  compactReason,
  fetchPhase7CWebStatus,
  getTradeUiState,
  isUsablePanelValue,
  modeDisplay,
  money,
  pickText,
  raw,
  stageTone,
  value,
  type Phase7CCandle,
  type Phase7CPanelStatus,
  type TradeUiState,
} from "../phase7c-panel-status";

function asRecord(input: unknown): Record<string, any> {
  return input && typeof input === "object" ? (input as Record<string, any>) : {};
}

function PanelCard({ title, children, accent = "cyan" }: { title: string; children: ReactNode; accent?: "cyan" | "green" | "red" | "orange" | "purple" }) {
  const colorMap = {
    cyan: "rgba(0,213,255,.42)",
    green: "rgba(74,222,128,.42)",
    red: "rgba(248,113,113,.42)",
    orange: "rgba(251,191,36,.42)",
    purple: "rgba(168,85,247,.42)",
  } as const;
  return (
    <Card variant="outlined" sx={{ height: "100%", borderRadius: 3, bgcolor: "rgba(3,10,18,.72)", borderColor: colorMap[accent] }}>
      <CardContent sx={{ p: 2.2 }}>
        <Typography variant="subtitle2" fontWeight={950} sx={{ letterSpacing: ".03em" }}>{title}</Typography>
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
    <Stack spacing={0.6} alignItems="center" minWidth={112}>
      <Typography variant="caption" color="text.secondary" fontWeight={900}>{label}</Typography>
      <Chip label={valueText} color={color} sx={{ fontWeight: 950, minWidth: 96 }} />
    </Stack>
  );
}

function ReasonBox({ title, items, accent = "cyan" }: { title: string; items: string[]; accent?: "cyan" | "purple" | "orange" | "green" }) {
  return (
    <PanelCard title={title} accent={accent}>
      <Stack spacing={0.9}>
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">Chưa có dữ liệu.</Typography>
        ) : items.map((item, index) => (
          <Typography key={`${title}-${index}`} variant="body2" lineHeight={1.5}>• {item}</Typography>
        ))}
      </Stack>
    </PanelCard>
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

function panelNumber(panel: Phase7CPanelStatus | undefined, ...keys: string[]) {
  for (const key of keys) {
    const text = raw(panel, key);
    if (!isUsablePanelValue(text)) continue;
    const numberValue = Number(text);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return null;
}

function LiveCandlestickChart({ candles, panel, uiState }: { candles: Phase7CCandle[]; panel: Phase7CPanelStatus | undefined; uiState: TradeUiState }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || candles.length < 2) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 430,
      layout: { background: { type: ColorType.Solid, color: "#020914" }, textColor: "#9ca3af" },
      grid: { vertLines: { color: "rgba(148,163,184,.08)" }, horzLines: { color: "rgba(148,163,184,.08)" } },
      rightPriceScale: { borderColor: "rgba(148,163,184,.20)" },
      timeScale: { borderColor: "rgba(148,163,184,.20)", timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: "rgba(0,213,255,.35)" }, horzLine: { color: "rgba(0,213,255,.35)" } },
    });

    const series = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const deduped = new Map<number, Phase7CCandle>();
    candles.forEach((candle) => deduped.set(Math.floor(candle.openTime / 1000), candle));
    const chartData = Array.from(deduped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, candle]) => ({
        time: time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      }));
    series.setData(chartData);

    if (uiState !== "WAITING") {
      const managing = uiState === "MANAGING";
      const levels = [
        { title: "ENTRY", price: managing ? panelNumber(panel, "positionEntry", "entry") : panelNumber(panel, "entry"), color: "#38bdf8" },
        { title: "SL", price: managing ? panelNumber(panel, "positionStopLoss", "stopLoss") : panelNumber(panel, "stopLoss"), color: "#f87171" },
        { title: "TP1", price: managing ? panelNumber(panel, "positionTp1", "tp1") : panelNumber(panel, "tp1"), color: "#4ade80" },
        { title: "TP2", price: managing ? panelNumber(panel, "positionTp2", "tp2") : panelNumber(panel, "tp2"), color: "#22c55e" },
      ];
      levels.forEach((level) => {
        if (level.price === null) return;
        series.createPriceLine({
          price: level.price,
          color: level.color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: level.title,
        });
      });
    }

    chart.timeScale().fitContent();
    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth, height: 430 });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [candles, panel, uiState]);

  if (candles.length < 2) {
    return (
      <Box sx={{ height: 430, display: "grid", placeItems: "center", borderRadius: 3, bgcolor: "#020914", border: "1px solid rgba(0,213,255,.22)" }}>
        <Box textAlign="center">
          <Typography variant="h6" fontWeight={900}>Không tải được dữ liệu nến XAUUSD M15</Typography>
          <Typography variant="body2" color="text.secondary" mt={1}>Chart không dùng dữ liệu giả. Kiểm tra MT5 bridge/history feed.</Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ position: "relative", borderRadius: 3, overflow: "hidden", border: "1px solid rgba(0,213,255,.22)", bgcolor: "#020914" }}>
      <Box sx={{ position: "absolute", zIndex: 3, left: 16, top: 14, pointerEvents: "none" }}>
        <Typography variant="h6" fontWeight={950}>XAUUSD · M15</Typography>
        <Typography variant="caption" color="text.secondary">Live MT5 candles · {candles.length} bars</Typography>
      </Box>
      <Stack direction="row" spacing={1} sx={{ position: "absolute", zIndex: 3, right: 14, top: 14, pointerEvents: "none" }}>
        <Chip size="small" label={uiState === "WAITING" ? "WAITING" : uiState === "SETUP_READY" ? "SETUP READY" : "MANAGING"} color={uiState === "WAITING" ? "warning" : "success"} sx={{ fontWeight: 900 }} />
        <Chip size="small" label={`${value(panel, "regime", "—")} ${value(panel, "confidence", "—")}%`} color="info" variant="outlined" sx={{ fontWeight: 900 }} />
      </Stack>
      <Box ref={containerRef} sx={{ width: "100%", height: 430 }} />
      {uiState === "WAITING" && (
        <Box sx={{ position: "absolute", zIndex: 3, left: 18, bottom: 18, px: 1.5, py: 1, borderRadius: 2, bgcolor: "rgba(15,23,42,.90)", border: "1px solid rgba(251,191,36,.35)", pointerEvents: "none" }}>
          <Typography variant="subtitle2" fontWeight={950} color="warning.main">BOT ĐANG CHỜ SETUP</Typography>
          <Typography variant="caption" color="text.secondary">Stage {value(panel, "stage", "—")} · Không có Entry / SL / TP giả</Typography>
        </Box>
      )}
    </Box>
  );
}

export function Phase7BDemoPage() {
  const query = useQuery({
    queryKey: ["phase7c-web-final-dashboard-v2"],
    queryFn: fetchPhase7CWebStatus,
    refetchInterval: 3_000,
    retry: false,
    placeholderData: (previous) => previous,
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError && !query.data) return <ErrorState message={query.error instanceof Error ? query.error.message : "Không đọc được Dashboard."} />;

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
  const uiState = getTradeUiState(panel);
  const hasPosition = uiState === "MANAGING";
  const setupReady = uiState === "SETUP_READY";
  const profit = value(panel, "floatingPnlUsd", "—");

  const waitReasons = compactReason(
    [raw(panel, "limitReason"), raw(panel, "decisionReason"), raw(panel, "entryReason")].filter(Boolean).join(" | "),
    "Chưa có setup hợp lệ.",
  );
  const entryReasons = compactReason(raw(panel, "entryReason") || raw(panel, "decisionReason"), "Engine chưa trả lý do vào lệnh.");
  const holdReasons = compactReason(raw(panel, "holdReason"), "Engine chưa trả lý do giữ lệnh.");
  const hasSupplyDemand = raw(panel, "hasSupplyDemandRange") === "true";

  return (
    <Stack spacing={2.4}>
      <Box sx={{ p: 2, borderRadius: 4, bgcolor: "rgba(3,10,18,.82)", border: "1px solid rgba(0,213,255,.18)" }}>
        <Stack direction={{ xs: "column", xl: "row" }} justifyContent="space-between" gap={2} alignItems={{ xl: "center" }}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h5" fontWeight={950}>XAUUSD AI MASTER</Typography>
              <Chip label="PHASE7C" color="secondary" size="small" sx={{ fontWeight: 950 }} />
            </Stack>
            <Typography variant="body2" color="text.secondary" mt={0.5}>MT5 DASHBOARD · LIVE DATA · DEMO ONLY · READ ONLY</Typography>
          </Box>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <HeaderChip label="CHẾ ĐỘ BOT" valueText={mode} color={mode.includes("PAUSE") ? "warning" : "success"} />
            <HeaderChip label="TRẠNG THÁI" valueText={stage} color={stageTone(stage)} />
            <HeaderChip label="REGIME" valueText={regime} color={regime === "REVERSAL" ? "warning" : "info"} />
            <HeaderChip label="CONF" valueText={`${confidence}%`} />
          </Stack>
        </Stack>
      </Box>

      {data?.usedDirectFallback && <Alert severity="info">Web proxy 5717 chưa ổn định nên một số nguồn đang đọc trực tiếp Control API 3711.</Alert>}
      {(data?.errors ?? []).length > 0 && <Alert severity="warning">Nguồn chưa sẵn sàng: {(data?.errors ?? []).slice(0, 3).join(" ")}</Alert>}

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
              <InfoRow label="Trend Fixed Lot" valueText={pickText(config.configuredTrendFixedLot, "0.12")} />
              <InfoRow label="Sideway Risk %" valueText={`${pickText(config.configuredSidewayRiskPercent, "1")}%`} />
              <InfoRow label="Sideway Max Lot" valueText={pickText(config.configuredSidewayMaxLot, "0.30")} />
              <InfoRow label="Auto Lot Mode" valueText="AUTO_LOT_SHADOW" />
              <InfoRow label="Áp dụng" valueText="NEW_POSITIONS_ONLY" />
            </PanelCard>

            <PanelCard title="TRẠNG THÁI HỆ THỐNG" accent="green">
              <StatusDot label="Market Data" ok={(data?.candles?.length ?? 0) >= 2} />
              <StatusDot label="Decision Engine" ok={Boolean(panel)} />
              <StatusDot label="Risk Manager" ok={Boolean(accountRisk.configuration)} />
              <StatusDot label="Trend Executor" ok={Boolean(asRecord(processes.trend).alive)} />
              <StatusDot label="Sideway Executor" ok={Boolean(asRecord(processes.sideway).alive)} />
              <StatusDot label="Telegram" ok={Boolean(lifecycle.telegramReady)} />
              <StatusDot label="Lot Binding" ok={Boolean(lotRuntime.activeAlive)} />
            </PanelCard>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Stack spacing={2}>
            <LiveCandlestickChart candles={data?.candles ?? []} panel={panel} uiState={uiState} />
            <PanelCard title="NHẬT KÝ GIAO DỊCH GẦN NHẤT" accent="cyan">
              <Typography variant="body2" color="text.secondary">Lịch sử lệnh chỉ hiển thị khi API trade journal có dữ liệu thật; dashboard không tạo dữ liệu minh họa.</Typography>
            </PanelCard>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, lg: 3 }}>
          <Stack spacing={2}>
            {uiState === "WAITING" && (
              <>
                <PanelCard title="TRẠNG THÁI GIAO DỊCH" accent="orange">
                  <Typography variant="body2">Không có vị thế XAUUSD đang mở.</Typography>
                  <Typography variant="body2" color="text.secondary" mt={0.8}>Bot đang chờ setup hợp lệ. Entry / SL / TP được ẩn cho tới khi engine duyệt setup.</Typography>
                </PanelCard>
                <ReasonBox title="LÝ DO CHƯA VÀO LỆNH" items={waitReasons} accent="cyan" />
                <PanelCard title="BOT GATE / FILTER" accent={regime === "REVERSAL" ? "orange" : "cyan"}>
                  <InfoRow label="Trend gate" valueText={regime === "TREND" && !mode.includes("PAUSE") ? "Được phép xét" : "Chưa được phép"} />
                  <InfoRow label="Sideway range" valueText={hasSupplyDemand ? "Có range hợp lệ" : "Chưa có range"} />
                  <InfoRow label="Reversal filter" valueText={regime === "REVERSAL" ? "ĐANG CHẶN" : "Không chặn"} tone={regime === "REVERSAL" ? "warning" : "success"} />
                  <InfoRow label="Recommended" valueText={value(panel, "recommendedMode", "—")} />
                </PanelCard>
              </>
            )}

            {setupReady && (
              <>
                <PanelCard title="SETUP ĐANG CHỜ" accent="green">
                  <InfoRow label="Strategy" valueText={value(panel, "effectiveStrategy", "—")} />
                  <InfoRow label="Side" valueText={value(panel, "side", "—")} />
                  <InfoRow label="Entry" valueText={value(panel, "entry", "—")} tone="info" />
                  <InfoRow label="Stop Loss" valueText={value(panel, "stopLoss", "—")} tone="error" />
                  <InfoRow label="TP1" valueText={value(panel, "tp1", "—")} tone="success" />
                  <InfoRow label="TP2" valueText={value(panel, "tp2", "—")} tone="success" />
                  <InfoRow label="Lot dự kiến" valueText={value(panel, "finalLot", "—")} />
                  <InfoRow label="Risk %" valueText={value(panel, "estimatedRiskPercent", "—")} />
                </PanelCard>
                <ReasonBox title="LÝ DO SETUP ĐƯỢC DUYỆT" items={entryReasons} accent="green" />
              </>
            )}

            {hasPosition && (
              <>
                <PanelCard title="CHI TIẾT LỆNH ĐANG MỞ" accent="green">
                  <InfoRow label="Side" valueText={value(panel, "positionSide", value(panel, "side", "—"))} tone="success" />
                  <InfoRow label="Entry" valueText={value(panel, "positionEntry", value(panel, "entry", "—"))} />
                  <InfoRow label="Stop Loss" valueText={value(panel, "positionStopLoss", value(panel, "stopLoss", "—"))} tone="error" />
                  <InfoRow label="TP1" valueText={value(panel, "positionTp1", value(panel, "tp1", "—"))} tone="success" />
                  <InfoRow label="TP2" valueText={value(panel, "positionTp2", value(panel, "tp2", "—"))} tone="success" />
                  <InfoRow label="Lot" valueText={value(panel, "positionVolume", value(panel, "finalLot", "—"))} />
                </PanelCard>
                <ReasonBox title="LÝ DO VÀO LỆNH" items={entryReasons} accent="cyan" />
                <ReasonBox title="LÝ DO GIỮ LỆNH" items={holdReasons} accent="purple" />
                <ReasonBox title="LÝ DO CHỐT LỆNH" items={["Chưa có tín hiệu chốt lệnh từ engine."]} accent="orange" />
                <PanelCard title="PROFIT" accent={Number(profit) >= 0 ? "green" : "red"}>
                  <Typography variant="h4" fontWeight={950} color={Number(profit) >= 0 ? "success.main" : "error.main"}>{profit} USD</Typography>
                </PanelCard>
              </>
            )}
          </Stack>
        </Grid>
      </Grid>

      <Box sx={{ px: 2, py: 1.4, borderRadius: 3, bgcolor: "rgba(3,10,18,.82)", border: "1px solid rgba(148,163,184,.16)" }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5}>
          <Typography variant="body2">UI STATE: <b>{uiState}</b></Typography>
          <Typography variant="body2">EXECUTORS: TREND {asRecord(processes.trend).alive ? "✓" : "—"} | SIDEWAY {asRecord(processes.sideway).alive ? "✓" : "—"}</Typography>
          <Typography variant="body2">RISK MODE: DEMO ONLY</Typography>
          <Typography variant="body2">TELEGRAM: {lifecycle.telegramReady ? "KẾT NỐI" : "CHECK"}</Typography>
          <Typography variant="body2">ORDER PERMISSION: NONE</Typography>
        </Stack>
      </Box>
    </Stack>
  );
}
