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
import { ErrorState, LoadingState } from "../ui/PageState";
import {
  compactReason,
  fetchPhase7CPanelStatus,
  modeDisplay,
  raw,
  shortValue,
  stageTone,
  value,
} from "../phase7c-panel-status";

function GateCard({ label, valueText, detail, status }: { label: string; valueText: string; detail: string; status: string }) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
          <Typography variant="caption" color="text.secondary" fontWeight={900}>{label}</Typography>
          <Chip size="small" label={status} color={stageTone(status)} variant="outlined" sx={{ fontWeight: 900 }} />
        </Stack>
        <Typography variant="h5" fontWeight={950} mt={1.5}>{valueText}</Typography>
        <Typography variant="body2" color="text.secondary" mt={1}>{detail}</Typography>
      </CardContent>
    </Card>
  );
}

function TradeRow({ label, valueText }: { label: string; valueText: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" gap={2} py={0.8}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={900} textAlign="right">{valueText}</Typography>
    </Stack>
  );
}

export function Phase7BPatternCheckPage() {
  const query = useQuery({
    queryKey: ["phase7c-panel-status-signal"],
    queryFn: fetchPhase7CPanelStatus,
    refetchInterval: 3_000,
    retry: false,
    placeholderData: (previous) => previous,
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError && !query.data) return <ErrorState message={query.error instanceof Error ? query.error.message : "Không đọc được tín hiệu Phase7C."} />;

  const data = query.data;
  const stage = shortValue(data, "stage");
  const regime = shortValue(data, "regime");
  const confidence = value(data, "confidence", "—");
  const approved = raw(data, "approved") === "true";
  const entryReasons = compactReason(raw(data, "entryReason"), "Chưa có setup hợp lệ để vào lệnh.");
  const holdReasons = compactReason(raw(data, "holdReason"), "Đang chờ setup hợp lệ.");

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5} alignItems={{ md: "center" }}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={900}>TÍN HIỆU & QUYẾT ĐỊNH</Typography>
          <Typography variant="h4" fontWeight={950}>Điều kiện tín hiệu</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.8}>
            Đồng bộ với panel MT5: Entry, TP, Stoploss, lý do vào lệnh và lý do giữ/chờ lệnh.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label={`Mode ${modeDisplay(data)}`} color="success" variant="outlined" sx={{ fontWeight: 900 }} />
          <Chip label={`Stage ${stage}`} color={stageTone(stage)} variant="outlined" sx={{ fontWeight: 900 }} />
          <Chip label={`Conf ${confidence}`} color="default" variant="outlined" sx={{ fontWeight: 900 }} />
        </Stack>
      </Stack>

      {query.isError && query.data && <Alert severity="warning">Đang hiển thị dữ liệu gần nhất từ Decision Monitor. Trang sẽ tự thử lại.</Alert>}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <GateCard label="REGIME" valueText={regime} detail={`Khuyến nghị: ${value(data, "effectiveStrategy", "Đang chờ")}`} status={regime} />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <GateCard label="ENTRY GATE" valueText={approved ? "SETUP HỢP LỆ" : "ĐANG CHỜ SETUP"} detail={`Stage: ${stage}`} status={approved ? "READY" : stage} />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <GateCard label="HƯỚNG LỆNH" valueText={value(data, "side", "Chưa có hướng")} detail={`Setup: ${value(data, "setup", "Chưa có")}`} status={value(data, "side", "WAITING")} />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <GateCard label="LOT / RISK" valueText={value(data, "finalLot", "Chưa có lot")} detail={`Risk USD: ${value(data, "estimatedRiskUsd", "Chưa có")}`} status="CHECK" />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined">
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={950}>Kế hoạch lệnh</Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>Khi chưa có setup, các ô sẽ ghi rõ đang chờ thay vì lỗi JSON/HTTP.</Typography>
              <Box mt={2}>
                <TradeRow label="Điểm vào" valueText={value(data, "entry", "Đang chờ setup")} />
                <TradeRow label="Stoploss" valueText={value(data, "stopLoss", "Chưa có")} />
                <TradeRow label="Khoảng SL" valueText={value(data, "stopDistance", "Chưa có")} />
                <TradeRow label="TP1" valueText={value(data, "tp1", "Chưa có")} />
                <TradeRow label="TP2" valueText={value(data, "tp2", "Chưa có")} />
                <TradeRow label="BE / Partial" valueText="BE +6 / Partial +10 (1/3)" />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined">
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={950}>Lý do quyết định</Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>Dòng lý do được rút gọn để dễ đọc và khớp với MT5 panel.</Typography>
              <Typography variant="subtitle2" color="primary" fontWeight={900} mt={2}>Lý do vào / chờ lệnh</Typography>
              <Stack spacing={0.8} mt={1}>{entryReasons.map((reason) => <Typography key={reason} variant="body2">• {reason}</Typography>)}</Stack>
              <Typography variant="subtitle2" color="primary" fontWeight={900} mt={2.2}>Lý do giữ / chờ lệnh</Typography>
              <Stack spacing={0.8} mt={1}>{holdReasons.map((reason) => <Typography key={reason} variant="body2" color="text.secondary">• {reason}</Typography>)}</Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
