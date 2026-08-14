import {
  Alert,
  Box,
  Card,
  CardContent,
  Grid,
  Stack,
  Typography,
} from "@mui/material";
import { useMt5Telemetry } from "../hooks";
import { dateTime, price } from "../format";
import { LoadingState } from "../ui/PageState";
import { StatusChip } from "../ui/StatusChip";

export function SystemPage() {
  const mt5 = useMt5Telemetry("XAUUSD");
  if (mt5.isLoading && !mt5.data) return <LoadingState />;

  const telemetry = mt5.data;
  const health = telemetry?.health;
  const ready = Boolean(
    telemetry?.reachable &&
    health?.accountMode === "demo" &&
    health?.tradingEnabled &&
    health?.terminalTradeAllowed &&
    health?.expertTradeAllowed,
  );

  return (
    <Stack spacing={2.2}>
      <Box>
        <Typography variant="overline" color="primary" fontWeight={900}>DEMO SYSTEM</Typography>
        <Typography variant="h4" fontWeight={950}>System Health</Typography>
        <Typography variant="body2" color="text.secondary" mt={0.5}>Chỉ hiển thị đường vận hành MT5 DEMO hiện tại.</Typography>
      </Box>

      <Alert severity={ready ? "success" : "warning"}>
        {ready ? "MT5 DEMO / Bridge / Algo Trading đều sẵn sàng." : "Hệ thống chưa đủ điều kiện chạy Bot DEMO."}
      </Alert>

      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" justifyContent="space-between" gap={2} alignItems="center">
            <Typography variant="h6" fontWeight={900}>MT5 Bridge</Typography>
            <StatusChip value={telemetry?.reachable ? "ONLINE" : "OFFLINE"} />
          </Stack>
          <Grid container spacing={1.5} mt={0.5}>
            <Info label="Account mode" value={health?.accountMode?.toUpperCase() ?? "UNKNOWN"} />
            <Info label="Account" value={String(health?.accountLogin ?? "—")} />
            <Info label="Server" value={health?.server ?? "—"} />
            <Info label="Bridge trading" value={health?.tradingEnabled ? "ON" : "OFF"} />
            <Info label="Terminal Algo" value={health?.terminalTradeAllowed ? "ON" : "OFF"} />
            <Info label="Expert Trading" value={health?.expertTradeAllowed ? "ON" : "OFF"} />
            <Info label="XAUUSD Bid" value={price(telemetry?.quote?.bid ?? null)} />
            <Info label="XAUUSD Ask" value={price(telemetry?.quote?.ask ?? null)} />
            <Info label="Open XAUUSD" value={String(telemetry?.positions.length ?? 0)} />
            <Info label="Checked" value={telemetry?.checkedAt ? dateTime(telemetry.checkedAt) : "—"} />
          </Grid>
          <Typography variant="caption" color="text.secondary" display="block" mt={2}>
            {telemetry?.message ?? (mt5.error instanceof Error ? mt5.error.message : "MT5 telemetry unavailable.")}
          </Typography>
        </CardContent>
      </Card>

      <Alert severity="info">Real account luôn khóa trong DEMO Forward.</Alert>
    </Stack>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Grid size={{ xs: 12, sm: 6, md: 4, xl: 3 }}>
      <Box className="mini-card" sx={{ height: "100%" }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography fontWeight={850} mt={0.5} sx={{ overflowWrap: "anywhere" }}>{value}</Typography>
      </Box>
    </Grid>
  );
}
