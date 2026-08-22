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
  fetchPhase7CPanelStatus,
  modeDisplay,
  shortValue,
  stageTone,
  value,
} from "../phase7c-panel-status";

function SystemCard({ label, valueText, detail, chip, tone = "default" }: { label: string; valueText: string; detail: string; chip: string; tone?: "success" | "warning" | "error" | "default" }) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
          <Typography variant="caption" color="text.secondary" fontWeight={900}>{label}</Typography>
          <Chip size="small" label={chip} color={tone} variant="outlined" sx={{ fontWeight: 900 }} />
        </Stack>
        <Typography variant="h5" fontWeight={950} mt={1.5}>{valueText}</Typography>
        <Typography variant="body2" color="text.secondary" mt={1}>{detail}</Typography>
      </CardContent>
    </Card>
  );
}

function Row({ label, valueText }: { label: string; valueText: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" gap={2} py={0.8}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={900} textAlign="right">{valueText}</Typography>
    </Stack>
  );
}

export function Phase7BOpsPage() {
  const query = useQuery({
    queryKey: ["phase7c-panel-status-system"],
    queryFn: fetchPhase7CPanelStatus,
    refetchInterval: 3_000,
    retry: false,
    placeholderData: (previous) => previous,
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError && !query.data) return <ErrorState message={query.error instanceof Error ? query.error.message : "Không đọc được trạng thái hệ thống."} />;

  const data = query.data;
  const activeMode = shortValue(data, "activeMode");
  const stage = shortValue(data, "stage");
  const regime = shortValue(data, "regime");

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5} alignItems={{ md: "center" }}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={900}>VẬN HÀNH DEMO</Typography>
          <Typography variant="h4" fontWeight={950}>Hệ thống & Telegram</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.8}>
            Màn hình này ưu tiên nguồn Decision Monitor đang được MT5 panel sử dụng, nên không hiển thị lỗi HTTP 502 thô.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label={`Mode ${activeMode}`} color={activeMode === "AUTO" ? "success" : "warning"} variant="outlined" sx={{ fontWeight: 900 }} />
          <Chip label={`Stage ${stage}`} color={stageTone(stage)} variant="outlined" sx={{ fontWeight: 900 }} />
          <Chip label="ORDER NONE" color="success" variant="outlined" sx={{ fontWeight: 900 }} />
        </Stack>
      </Stack>

      {query.isError && query.data && <Alert severity="warning">Đang hiển thị dữ liệu gần nhất từ Decision Monitor. Trang sẽ tự thử lại.</Alert>}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <SystemCard label="DECISION MONITOR" valueText="ĐANG PHẢN HỒI" detail={`Stage ${stage} · Regime ${regime}`} chip="OK" tone="success" />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <SystemCard label="BOT MODE" valueText={modeDisplay(data)} detail="Mode này được đồng bộ với Telegram control." chip={activeMode} tone={activeMode === "AUTO" ? "success" : "warning"} />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <SystemCard label="MT5 PANEL" valueText="READ ONLY" detail="Panel chỉ hiển thị trạng thái, không gửi lệnh." chip="SAFE" tone="success" />
        </Grid>
        <Grid size={{ xs: 12, md: 6, xl: 3 }}>
          <SystemCard label="SAFETY" valueText="ORDER PERMISSION = NONE" detail="DEMO only · không có route gửi lệnh từ panel." chip="PASS" tone="success" />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined">
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={950}>Trạng thái vận hành</Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>Các dòng này lấy từ payload đang cấp cho MT5 panel.</Typography>
              <Box mt={2}>
                <Row label="Active mode" valueText={activeMode} />
                <Row label="Effective strategy" valueText={value(data, "effectiveStrategy", "Đang chờ")} />
                <Row label="Regime" valueText={regime} />
                <Row label="Confidence" valueText={value(data, "confidence", "—")} />
                <Row label="Decision stage" valueText={stage} />
                <Row label="Approved" valueText={value(data, "approved", "Chưa")} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined">
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={950}>Quy tắc an toàn</Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>Giữ đúng cấu hình DEMO và read-only.</Typography>
              <Box mt={2}>
                <Row label="Account mode" valueText="DEMO" />
                <Row label="MT5 panel" valueText="READ ONLY" />
                <Row label="Order permission" valueText="NONE" />
                <Row label="BE rule" valueText="+6 giá" />
                <Row label="Partial rule" valueText="+10 giá, chốt 1/3" />
                <Row label="Gửi lệnh từ panel" valueText="Không cho phép" />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
