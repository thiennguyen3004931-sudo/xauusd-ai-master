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
  getTradeUiState,
  raw,
  stageTone,
  value,
  type Phase7CUiGate,
} from "../phase7c-panel-status";

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? (value as Record<string, any>) : {};
}

function PanelCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <Card variant="outlined" sx={{ height: "100%", borderRadius: 4, bgcolor: "rgba(7,14,25,.72)" }}>
      <CardContent sx={{ p: 2.6 }}>
        <Typography variant="h6" fontWeight={950}>{title}</Typography>
        <Typography variant="body2" color="text.secondary" mt={0.5}>{subtitle}</Typography>
        <Box mt={1.8}>{children}</Box>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, valueText, tone = "default" }: { label: string; valueText: string; tone?: "default" | "success" | "warning" | "error" | "info" }) {
  const color = tone === "success" ? "success.main" : tone === "warning" ? "warning.main" : tone === "error" ? "error.main" : tone === "info" ? "info.main" : "text.primary";
  return (
    <Stack direction="row" justifyContent="space-between" gap={2} py={0.82} sx={{ borderBottom: "1px solid rgba(148,163,184,.08)" }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={900} color={color} textAlign="right">{valueText}</Typography>
    </Stack>
  );
}

function gateLabel(gate: Phase7CUiGate | undefined) {
  if (gate === "ALLOWED") return "ĐƯỢC PHÉP";
  if (gate === "BLOCKED_BY_MODE") return "CHẶN DO MODE";
  if (gate === "BLOCKED_BY_REGIME") return "CHẶN DO REGIME";
  return "ĐANG CHỜ";
}

function gateTone(gate: Phase7CUiGate | undefined): "success" | "warning" | "default" {
  return gate === "ALLOWED" ? "success" : gate === "BLOCKED_BY_MODE" || gate === "BLOCKED_BY_REGIME" ? "warning" : "default";
}

function ReasonList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <Typography variant="body2" color="text.secondary">{empty}</Typography>;
  return (
    <Stack spacing={1}>
      {items.slice(0, 6).map((item, index) => (
        <Typography key={`${index}-${item}`} variant="body2" lineHeight={1.55}>• {item}</Typography>
      ))}
    </Stack>
  );
}

function ContractLine({ children }: { children: ReactNode }) {
  return <Typography variant="body2" color="text.secondary" lineHeight={1.55}>• {children}</Typography>;
}

export function Phase7BPatternCheckPage() {
  const query = useQuery({
    queryKey: ["phase7c-web-status-signal-v6-semantic"],
    queryFn: fetchPhase7CWebStatus,
    refetchInterval: 3_000,
    retry: false,
    placeholderData: (previous) => previous,
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError && !query.data) {
    return <ErrorState message={query.error instanceof Error ? query.error.message : "Không đọc được tín hiệu Phase7C."} />;
  }

  const data = query.data;
  const panel = data?.panel;
  const ui = data?.ui;
  const accountRisk = asRecord(data?.accountRisk);
  const quote = asRecord(accountRisk.quote);

  const uiState = getTradeUiState(panel, ui);
  const approved = ui?.approved ?? raw(panel, "approved") === "true";
  const stage = clean(ui?.stage, value(panel, "stage", "—"));
  const regime = clean(ui?.regime, value(panel, "regime", "—"));
  const activeMode = clean(ui?.mode, value(panel, "activeMode", "—"));
  const strategy = clean(ui?.effectiveStrategy, value(panel, "effectiveStrategy", "—"));
  const confidence = clean(ui?.confidence, value(panel, "confidence", "—"));
  const recommendedMode = clean(ui?.recommendedMode, value(panel, "recommendedMode", "—"));

  const fallbackWaitReasons = compactReason(
    [raw(panel, "limitReason"), raw(panel, "decisionReason"), raw(panel, "entryReason")].filter(Boolean).join(" | "),
    "Chưa có setup hợp lệ.",
  );
  const waitReasons = ui?.reasons.wait?.length ? ui.reasons.wait : fallbackWaitReasons;
  const entryReasons = ui?.reasons.entry?.length
    ? ui.reasons.entry
    : compactReason(raw(panel, "entryReason") || raw(panel, "decisionReason"), "Engine chưa trả lý do setup.");
  const holdReasons = ui?.reasons.hold?.length
    ? ui.reasons.hold
    : compactReason(raw(panel, "holdReason"), "Engine chưa trả lý do giữ lệnh.");

  const setup = ui?.setup;
  const position = ui?.position;
  const currentReasonTitle = uiState === "WAITING" ? "LÝ DO CHƯA VÀO LỆNH" : uiState === "SETUP_READY" ? "LÝ DO SETUP ĐƯỢC DUYỆT" : "LÝ DO LỆNH ĐANG ĐƯỢC QUẢN LÝ";
  const currentReasons = uiState === "WAITING" ? waitReasons : uiState === "SETUP_READY" ? entryReasons : holdReasons;

  return (
    <Stack spacing={2.4}>
      <Box sx={{ p: 2.6, borderRadius: 4, border: "1px solid rgba(0,213,255,.18)", bgcolor: "rgba(3,10,18,.82)" }}>
        <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" gap={2} alignItems={{ lg: "center" }}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="h4" fontWeight={950}>Tín hiệu & quyết định</Typography>
              <Chip label="SEMANTIC UI v2" size="small" color="info" variant="outlined" sx={{ fontWeight: 900 }} />
              <Chip label={uiState} size="small" color={uiState === "WAITING" ? "warning" : "success"} sx={{ fontWeight: 900 }} />
            </Stack>
            <Typography variant="body2" color="text.secondary" mt={0.7}>
              Hiển thị đúng gate và reason runtime. Không tự thêm MA, RSI, volume hoặc indicator khác nếu engine không trả về.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label={`Mode ${activeMode}`} variant="outlined" color={activeMode === "PAUSE" ? "warning" : "success"} sx={{ fontWeight: 900 }} />
            <Chip label={`Stage ${stage}`} variant="outlined" color={stageTone(stage)} sx={{ fontWeight: 900 }} />
            <Chip label={`Regime ${regime}`} variant="outlined" color={regime === "REVERSAL" ? "warning" : "info"} sx={{ fontWeight: 900 }} />
            <Chip label={`Conf ${confidence}%`} variant="outlined" sx={{ fontWeight: 900 }} />
          </Stack>
        </Stack>
      </Box>

      {data?.usedDirectFallback && (
        <Box sx={{ px: 1.6, py: 0.9, borderRadius: 2.5, border: "1px solid rgba(56,189,248,.18)", bgcolor: "rgba(56,189,248,.05)" }}>
          <Typography variant="caption" color="text.secondary">Data path: fallback trực tiếp Control API 3711; nội dung giao dịch vẫn lấy từ semantic contract.</Typography>
        </Box>
      )}
      {(data?.errors ?? []).length > 0 && <Alert severity="warning">Nguồn phụ chưa sẵn sàng: {(data?.errors ?? []).slice(0, 2).join(" ")}</Alert>}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <PanelCard title="UI State" subtitle="Layout giao dịch hiện hành.">
            <Typography variant="h5" fontWeight={950}>{uiState}</Typography>
            <Typography variant="body2" color="text.secondary" mt={0.8}>Approved: {approved ? "YES" : "NO"}</Typography>
          </PanelCard>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <PanelCard title="Regime" subtitle="Bối cảnh do classifier trả về.">
            <Typography variant="h5" fontWeight={950}>{regime}</Typography>
            <Typography variant="body2" color="text.secondary" mt={0.8}>Confidence {confidence}%</Typography>
          </PanelCard>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <PanelCard title="Decision" subtitle="Mode và strategy hiệu lực.">
            <Typography variant="h5" fontWeight={950}>{stage}</Typography>
            <Typography variant="body2" color="text.secondary" mt={0.8}>{activeMode} → {strategy}</Typography>
          </PanelCard>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <PanelCard title="Giá XAUUSD" subtitle="Quote hiện tại từ MT5.">
            <Typography variant="h5" fontWeight={950}>{clean(quote.bid, "—")}</Typography>
            <Typography variant="body2" color="text.secondary" mt={0.8}>Ask {clean(quote.ask, "—")} · Spread {clean(quote.spread, "—")}</Typography>
          </PanelCard>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <PanelCard title="RUNTIME GATE / FILTER" subtitle="Đây là trạng thái gate thực tế, không phải mô tả chiến lược giả định.">
            <InfoRow label="Trend gate" valueText={gateLabel(ui?.gates.trend)} tone={gateTone(ui?.gates.trend)} />
            <InfoRow label="Sideway gate" valueText={gateLabel(ui?.gates.sideway)} tone={gateTone(ui?.gates.sideway)} />
            <InfoRow label="Reversal filter" valueText={ui?.gates.reversalFilter === "BLOCKING" ? "ĐANG CHẶN" : "CLEAR"} tone={ui?.gates.reversalFilter === "BLOCKING" ? "warning" : "success"} />
            <InfoRow label="Recommended mode" valueText={recommendedMode} tone={recommendedMode === "PAUSE" ? "warning" : "default"} />
          </PanelCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 7 }}>
          <PanelCard title={currentReasonTitle} subtitle="Ưu tiên semantic reason từ engine/decision layer.">
            <ReasonList items={currentReasons} empty="Chưa có reason runtime để hiển thị." />
          </PanelCard>
        </Grid>
      </Grid>

      <PanelCard
        title={uiState === "WAITING" ? "CHƯA CÓ KẾ HOẠCH LỆNH" : uiState === "SETUP_READY" ? "KẾ HOẠCH SETUP" : "VỊ THẾ ĐANG QUẢN LÝ"}
        subtitle={uiState === "WAITING" ? "WAITING không hiển thị Entry / SL / TP." : "Chỉ hiển thị giá trị thật từ semantic contract."}
      >
        {uiState === "WAITING" ? (
          <Alert severity="warning" variant="outlined">Bot đang chờ setup hợp lệ. Entry / Stoploss / TP được ẩn.</Alert>
        ) : uiState === "SETUP_READY" ? (
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, md: 4 }}><InfoRow label="Strategy" valueText={clean(setup?.strategy, strategy)} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><InfoRow label="Side" valueText={clean(setup?.side, "—")} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><InfoRow label="Setup" valueText={clean(setup?.name, "—")} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><InfoRow label="Entry" valueText={clean(setup?.entry, "—")} tone="info" /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><InfoRow label="Stoploss" valueText={clean(setup?.stopLoss, "—")} tone="error" /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><InfoRow label="TP1 / TP2" valueText={`${clean(setup?.tp1, "—")} / ${clean(setup?.tp2, "—")}`} tone="success" /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><InfoRow label="Lot" valueText={clean(setup?.finalLot, "—")} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><InfoRow label="Risk %" valueText={clean(setup?.estimatedRiskPercent, "—")} /></Grid>
          </Grid>
        ) : (
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, md: 4 }}><InfoRow label="Ticket" valueText={clean(position?.ticket, "—")} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><InfoRow label="Strategy" valueText={clean(position?.strategy, "—")} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><InfoRow label="Side" valueText={clean(position?.side, "—")} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><InfoRow label="Entry" valueText={clean(position?.entry, "—")} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><InfoRow label="Current SL" valueText={clean(position?.stopLoss, "—")} tone="error" /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><InfoRow label="TP1 / TP2" valueText={`${clean(position?.tp1, "—")} / ${clean(position?.tp2, "—")}`} tone="success" /></Grid>
          </Grid>
        )}
      </PanelCard>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <PanelCard title="TREND BOT — ENTRY CONTRACT" subtitle="Mô tả mức contract; indicator cụ thể chỉ được nêu khi engine trả về.">
            <Stack spacing={0.7}>
              <ContractLine>Regime và Mode phải cho phép Trend executor.</ContractLine>
              <ContractLine>Signal engine phải xác nhận setup M15 hợp lệ và các filter hiện hành phải PASS.</ContractLine>
              <ContractLine>Stoploss cấu trúc hợp lệ; vùng chuẩn 6–10 giá.</ContractLine>
              <ContractLine>Nếu SL &gt; 10 giá: không vào đuổi, chuyển sang chờ pullback M15.</ContractLine>
              <ContractLine>Risk, lot và safety gate phải PASS trước khi executor được phép hành động.</ContractLine>
            </Stack>
          </PanelCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <PanelCard title="SIDEWAY BOT — ENTRY CONTRACT" subtitle="Không tự thêm RSI, pin bar hoặc volume nếu runtime không xác nhận.">
            <Stack spacing={0.7}>
              <ContractLine>Regime và Mode phải cho phép Sideway executor.</ContractLine>
              <ContractLine>Phải có supply/demand range hợp lệ.</ContractLine>
              <ContractLine>Setup phản ứng tại vùng phải được engine xác nhận.</ContractLine>
              <ContractLine>Risk calculation phải PASS và lot không vượt Sideway Max Lot.</ContractLine>
              <ContractLine>Quản trị chuẩn: +6 → BE; +10 → chốt 1/3.</ContractLine>
            </Stack>
          </PanelCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <PanelCard title="REVERSAL FILTER" subtitle="Đây là filter bảo vệ, không gọi là Reversal Bot khi chưa có executor riêng.">
            <Stack spacing={0.7}>
              <ContractLine>Khi classifier xác nhận rủi ro đảo chiều mạnh, filter có thể chặn lệnh mới.</ContractLine>
              <ContractLine>Semantic runtime quyết định trạng thái BLOCKING/CLEAR và recommended mode.</ContractLine>
              <ContractLine>Ở trạng thái hiện tại nếu recommended = PAUSE thì executor không mở setup mới.</ContractLine>
            </Stack>
          </PanelCard>
        </Grid>
      </Grid>
    </Stack>
  );
}
