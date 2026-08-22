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
  compactReason,
  fetchPhase7CWebStatus,
  raw,
  stageTone,
  value,
} from "../phase7c-panel-status";

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? (value as Record<string, any>) : {};
}

function PanelCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <Card variant="outlined" sx={{ height: "100%", borderRadius: 4 }}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight={950}>{title}</Typography>
        <Typography variant="body2" color="text.secondary" mt={0.6}>{subtitle}</Typography>
        <Box mt={2}>{children}</Box>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, valueText }: { label: string; valueText: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" gap={2} py={0.9} sx={{ borderBottom: "1px solid rgba(148,163,184,.08)" }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={900} textAlign="right">{valueText}</Typography>
    </Stack>
  );
}

export function Phase7BPatternCheckPage() {
  const query = useQuery({
    queryKey: ["phase7c-web-status-signal-v5"],
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
  const accountRisk = asRecord(data?.accountRisk);
  const quote = asRecord(accountRisk.quote);
  const approved = raw(panel, "approved") === "true";
  const stage = value(panel, "stage", "—");
  const regime = value(panel, "regime", "—");
  const activeMode = value(panel, "activeMode", "—");
  const strategy = value(panel, "effectiveStrategy", "—");
  const confidence = value(panel, "confidence", "—");
  const entryReasons = compactReason(raw(panel, "entryReason"), "Chưa có lý do vào lệnh.");
  const holdReasons = compactReason(raw(panel, "holdReason"), "Đang chờ setup hợp lệ.");

  return (
    <Stack spacing={3}>
      <Box sx={{ p: 3, borderRadius: 5, border: "1px solid rgba(148,163,184,.14)", bgcolor: "rgba(15,23,42,.45)" }}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2} alignItems={{ md: "center" }}>
          <Box>
            <Typography variant="overline" color="primary" fontWeight={900}>TÍN HIỆU & QUYẾT ĐỊNH v5</Typography>
            <Typography variant="h4" fontWeight={950}>Một màn hình cho entry logic</Typography>
            <Typography variant="body2" color="text.secondary" mt={1}>
              Trang này chỉ hiển thị tín hiệu, stage, lý do chờ/vào lệnh và điều kiện vào lệnh. Không lặp thông tin tài khoản/hệ thống.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label={`Regime ${regime}`} color={regime === "REVERSAL" ? "warning" : "default"} variant="outlined" sx={{ fontWeight: 900 }} />
            <Chip label={`Stage ${stage}`} color={stageTone(stage)} variant="outlined" sx={{ fontWeight: 900 }} />
            <Chip label={approved ? "SETUP HỢP LỆ" : "ĐANG CHỜ"} color={approved ? "success" : "warning"} variant="outlined" sx={{ fontWeight: 900 }} />
          </Stack>
        </Stack>
      </Box>

      {data?.usedDirectFallback && <Alert severity="info">Đã fallback trực tiếp sang Control API 3711 vì web proxy 5717 chưa ổn định.</Alert>}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <PanelCard title="Regime" subtitle="Bối cảnh thị trường hiện tại.">
            <Typography variant="h5" fontWeight={950}>{regime}</Typography>
            <Typography variant="body2" color="text.secondary" mt={1}>Confidence {confidence}/100</Typography>
          </PanelCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <PanelCard title="Decision" subtitle="Kết luận mở lệnh.">
            <Typography variant="h5" fontWeight={950}>{stage}</Typography>
            <Typography variant="body2" color="text.secondary" mt={1}>Mode {activeMode} → {strategy}</Typography>
          </PanelCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <PanelCard title="Approved" subtitle="Entry gate cuối cùng.">
            <Typography variant="h5" fontWeight={950}>{boolText(approved)}</Typography>
            <Typography variant="body2" color="text.secondary" mt={1}>{value(panel, "limitReason", "Chưa có setup hợp lệ.")}</Typography>
          </PanelCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <PanelCard title="Giá XAUUSD" subtitle="Quote từ MT5 nếu endpoint account-risk sẵn sàng.">
            <Typography variant="h5" fontWeight={950}>{clean(quote.bid, "—")}</Typography>
            <Typography variant="body2" color="text.secondary" mt={1}>Ask {clean(quote.ask, "—")} · Spread {clean(quote.spread, "—")}</Typography>
          </PanelCard>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <PanelCard title={approved ? "Kế hoạch lệnh" : "Chưa có kế hoạch lệnh"} subtitle={approved ? "Chỉ hiện khi setup hợp lệ." : "Đang bị BLOCKED/WAITING nên không render bảng Entry/SL/TP giả."}>
            {approved ? (
              <Box>
                <InfoRow label="Entry" valueText={value(panel, "entry", "—")} />
                <InfoRow label="Stoploss" valueText={value(panel, "stopLoss", "—")} />
                <InfoRow label="Khoảng SL" valueText={value(panel, "stopDistance", "—")} />
                <InfoRow label="TP1" valueText={value(panel, "tp1", "—")} />
                <InfoRow label="TP2" valueText={value(panel, "tp2", "—")} />
                <InfoRow label="Lot" valueText={value(panel, "finalLot", "—")} />
              </Box>
            ) : (
              <Alert severity="warning" variant="outlined">Bot đang chờ setup hợp lệ. Không có Entry/SL/TP để hiển thị.</Alert>
            )}
          </PanelCard>
        </Grid>
        <Grid size={{ xs: 12, lg: 7 }}>
          <PanelCard title="Lý do quyết định" subtitle="Nội dung rút gọn từ Decision Monitor.">
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="primary" fontWeight={900}>Lý do vào / chờ lệnh</Typography>
                <Stack spacing={1.1} mt={1.2}>{entryReasons.map((reason) => <Typography key={reason} variant="body2">• {reason}</Typography>)}</Stack>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="subtitle2" color="primary" fontWeight={900}>Lý do giữ / không vào</Typography>
                <Stack spacing={1.1} mt={1.2}>{holdReasons.map((reason) => <Typography key={reason} variant="body2" color="text.secondary">• {reason}</Typography>)}</Stack>
              </Grid>
            </Grid>
          </PanelCard>
        </Grid>
      </Grid>

      <PanelCard title="Điều kiện vào lệnh chuẩn" subtitle="Quy tắc chung đồng bộ với MT5 panel.">
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 3 }}><InfoRow label="SL chuẩn" valueText="6–10 giá" /></Grid>
          <Grid size={{ xs: 12, md: 3 }}><InfoRow label="SL > 10" valueText="Chờ pullback sau M15" /></Grid>
          <Grid size={{ xs: 12, md: 3 }}><InfoRow label="Break-even" valueText="+6" /></Grid>
          <Grid size={{ xs: 12, md: 3 }}><InfoRow label="Partial" valueText="+10, chốt 1/3" /></Grid>
        </Grid>
      </PanelCard>
    </Stack>
  );
}
