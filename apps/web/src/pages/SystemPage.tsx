import {
  Alert,
  Box,
  Card,
  CardContent,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import { useDashboard, useMt5Telemetry } from "../hooks";
import { dateTime, price } from "../format";
import { LoadingState } from "../ui/PageState";
import { StatusChip } from "../ui/StatusChip";

export function SystemPage() {
  const dashboard = useDashboard();
  const mt5 = useMt5Telemetry("XAUUSD");

  if (mt5.isLoading && !mt5.data) return <LoadingState />;

  const telemetry = mt5.data;
  const health = telemetry?.health;

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="overline" color="primary" fontWeight={800}>
          DEMO OPERATIONS
        </Typography>
        <Typography variant="h5" fontWeight={800}>System health</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          MT5/Bridge là health vận hành của Phase 7B. Canonical dashboard bên dưới chỉ là research/legacy và không điều khiển bot DEMO.
        </Typography>
      </Box>

      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" gap={2} alignItems="center">
            <Box>
              <Typography fontWeight={800}>MT5 Bridge / Phase 7B execution path</Typography>
              <Typography variant="caption" color="text.secondary">
                API web chỉ đọc telemetry; lệnh DEMO do controller Phase 7B riêng quản lý.
              </Typography>
            </Box>
            <StatusChip value={telemetry?.reachable ? "HEALTHY" : "OFFLINE"} />
          </Stack>

          <Grid container spacing={1.5} sx={{ mt: 1 }}>
            <Info label="Reachable" value={telemetry?.reachable ? "YES" : "NO"} />
            <Info label="Account mode" value={health?.accountMode?.toUpperCase() ?? "UNKNOWN"} />
            <Info label="Bridge trading" value={health?.tradingEnabled ? "ENABLED" : "DISABLED"} />
            <Info label="Terminal algo" value={health?.terminalTradeAllowed ? "ALLOWED" : "BLOCKED"} />
            <Info label="Expert trading" value={health?.expertTradeAllowed ? "ALLOWED" : "BLOCKED"} />
            <Info label="Server" value={health?.server ?? "—"} />
            <Info label="XAUUSD Bid" value={price(telemetry?.quote?.bid ?? null)} />
            <Info label="XAUUSD Ask" value={price(telemetry?.quote?.ask ?? null)} />
            <Info label="Open XAUUSD" value={String(telemetry?.positions.length ?? 0)} />
            <Info label="Checked" value={telemetry?.checkedAt ? dateTime(telemetry.checkedAt) : "—"} />
          </Grid>

          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
            {telemetry?.message ?? (mt5.error instanceof Error ? mt5.error.message : "MT5 telemetry unavailable.")}
          </Typography>
        </CardContent>
      </Card>

      {dashboard.data ? (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography fontWeight={800}>Canonical research pipeline</Typography>
              <Typography variant="caption" color="text.secondary">
                Tham khảo nghiên cứu; không phải trạng thái execution của Phase 7B.
              </Typography>
            </Box>
            <StatusChip value={dashboard.data.source} />
          </Stack>
          <Grid container spacing={2}>
            {dashboard.data.services.map((service) => (
              <Grid key={service.id} size={{ xs: 12, sm: 6, xl: 4 }}>
                <Card sx={{ height: "100%" }}>
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" gap={2}>
                      <Typography fontWeight={800}>{service.name}</Typography>
                      <StatusChip value={service.status} />
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2, minHeight: 42 }}>
                      {service.message}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
                      Latency {service.latencyMs} ms · {dateTime(service.checkedAt)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </>
      ) : (
        <Alert severity="info">
          Canonical research dashboard hiện không khả dụng. Điều này không ảnh hưởng Phase 7B DEMO nếu trang Phase 7B vẫn hiển thị WAITING SIGNAL/MANAGING và MT5 Guard đều PASS.
        </Alert>
      )}

      <Alert severity="warning">
        LIVE vẫn khóa. Không dùng trang Hệ thống hoặc Cài đặt legacy để suy ra rằng Phase 7B đã được phép giao dịch tài khoản thật.
      </Alert>
    </Stack>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Grid size={{ xs: 12, sm: 6, md: 4, xl: 3 }}>
      <Box className="mini-card" sx={{ height: "100%" }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography fontWeight={800} sx={{ mt: .5, overflowWrap: "anywhere" }}>{value}</Typography>
      </Box>
    </Grid>
  );
}
