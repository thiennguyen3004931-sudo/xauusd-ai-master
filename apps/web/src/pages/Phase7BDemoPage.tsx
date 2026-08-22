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
  compactReason,
  fetchPhase7CPanelStatus,
  modeDisplay,
  raw,
  shortValue,
  stageTone,
  value,
} from "../phase7c-panel-status";

function StatusCard({
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
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
          <Typography variant="caption" color="text.secondary" fontWeight={900}>{label}</Typography>
          {chip && <Chip size="small" label={chip} color={tone} variant="outlined" sx={{ fontWeight: 900 }} />}
        </Stack>
        <Typography variant="h5" fontWeight={950} mt={1.5}>{valueText}</Typography>
        <Typography variant="body2" color="text.secondary" mt={1}>{detail}</Typography>
      </CardContent>
    </Card>
  );
}

function Info({ label, valueText }: { label: string; valueText: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" gap={2} py={0.7}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={900} textAlign="right">{valueText}</Typography>
    </Stack>
  );
}

export function Phase7BDemoPage() {
  const query = useQuery({
    queryKey: ["phase7c-panel-status-overview"],
    queryFn: fetchPhase7CPanelStatus,
    refetchInterval: 3_000,
    retry: false,
    placeholderData: (previous) => previous,
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError && !query.data) {
    return <ErrorState message={query.error instanceof Error ? query.error.message : "Không đọc được Decision Monitor."} />;
  }

  const data = query.data;
  const stage = shortValue(data, "stage");
  const regime = shortValue(data, "regime");
  const confidence = value(data, "confidence", "—");
  const strategy = shortValue(data, "effectiveStrategy");
  const activeMode = shortValue(data, "activeMode");
  const entryReasons = compactReason(raw(data, "entryReason"), "Chưa có lý do vào lệnh.");
  const holdReasons = compactReason(raw(data, "holdReason"), "Đang chờ setup hợp lệ.");

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5} alignItems={{ md: "center" }}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={900}>XAUUSD · MT5 DEMO</Typography>
          <Typography variant="h4" fontWeight={950}>Tổng quan giao dịch DEMO</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.8}>
            Đồng bộ trực tiếp với Decision Monitor dùng cho panel MT5: mode, regime, entry, TP, Stoploss và lý do chờ lệnh.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label={`Mode ${activeMode}`} color={activeMode === "AUTO" ? "success" : "warning"} variant="outlined" sx={{ fontWeight: 900 }} />
          <Chip label={`Stage ${stage}`} color={stageTone(stage)} variant="outlined" sx={{ fontWeight: 900 }} />
          <Chip label={`Regime ${regime}`} color={regime === "REVERSAL" ? "warning" : "default"} variant="outlined" sx={{ fontWeight: 900 }} />
        </Stack>
      </Stack>

      {query.isError && query.data && (
        <Alert severity="warning">
          Đang hiển thị dữ liệu gần nhất từ Decision Monitor. Trang sẽ tự thử lại trong vài giây.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <StatusCard
            label="BOT MODE"
            valueText={modeDisplay(data)}
            detail={`Regime ${regime} · Confidence ${confidence}`}
            chip={activeMode}
            tone={activeMode === "AUTO" ? "success" : "warning"}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <StatusCard
            label="DECISION"
            valueText={stage}
            detail={`Strategy ${strategy}`}
            chip={stage}
            tone={stageTone(stage)}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <StatusCard
            label="LỆNH KẾ TIẾP"
            valueText={value(data, "entry", "Đang chờ setup")}
            detail={`SL ${value(data, "stopLoss", "Chưa có")} · TP1 ${value(data, "tp1", "Chưa có")}`}
            chip={value(data, "side", "Chờ")}
            tone="default"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <StatusCard
            label="SAFETY"
            valueText="READ ONLY"
            detail="DEMO · ORDER PERMISSION = NONE"
            chip="ORDER NONE"
            tone="success"
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined">
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={950}>Kế hoạch lệnh</Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>Các giá trị này phải khớp với panel MT5.</Typography>
              <Box mt={2}>
                <Info label="Điểm vào" valueText={value(data, "entry", "Đang chờ setup")} />
                <Info label="Stoploss" valueText={value(data, "stopLoss", "Chưa có")} />
                <Info label="Khoảng SL" valueText={value(data, "stopDistance", "Chưa có")} />
                <Info label="TP1" valueText={value(data, "tp1", "Chưa có")} />
                <Info label="TP2" valueText={value(data, "tp2", "Chưa có")} />
                <Info label="Lot cuối" valueText={value(data, "finalLot", "Chưa có")} />
                <Info label="Risk USD" valueText={value(data, "estimatedRiskUsd", "Chưa có")} />
                <Info label="BE / Partial" valueText={`${value(data, "breakEvenApplied", "Chưa")} / ${value(data, "partialApplied", "Chưa")}`} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined">
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={950}>Lý do vào / giữ lệnh</Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>Rút gọn để dễ đọc, không lặp lỗi HTTP thô.</Typography>
              <Box mt={2}>
                <Typography variant="subtitle2" color="primary" fontWeight={900}>Lý do vào lệnh / chờ lệnh</Typography>
                <Stack spacing={0.8} mt={1}>{entryReasons.map((reason) => <Typography key={reason} variant="body2">• {reason}</Typography>)}</Stack>
                <Typography variant="subtitle2" color="primary" fontWeight={900} mt={2.2}>Lý do giữ / chờ lệnh</Typography>
                <Stack spacing={0.8} mt={1}>{holdReasons.map((reason) => <Typography key={reason} variant="body2" color="text.secondary">• {reason}</Typography>)}</Stack>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
