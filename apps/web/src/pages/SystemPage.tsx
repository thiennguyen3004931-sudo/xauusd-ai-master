import {
  Alert,
  Box,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import { useDashboard, useMt5Telemetry } from "../hooks";
import { dateTime, price } from "../format";
import { ErrorState, LoadingState } from "../ui/PageState";
import { StatusChip } from "../ui/StatusChip";
import type { Mt5TelemetrySnapshot } from "../types";

export function SystemPage() {
  const dashboard = useDashboard();
  const mt5 = useMt5Telemetry("XAUUSD");

  if (dashboard.isLoading) return <LoadingState />;
  if (!dashboard.data) {
    return (
      <ErrorState
        message={
          dashboard.error instanceof Error
            ? dashboard.error.message
            : "Không có system health."
        }
      />
    );
  }

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="overline" color="primary" fontWeight={800}>
          OPERATIONS
        </Typography>
        <Typography variant="h5" fontWeight={800}>
          System health
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Pipeline health và MT5 broker telemetry. Dashboard không có route đặt,
          sửa hoặc đóng lệnh MT5.
        </Typography>
      </Box>

      <Mt5TelemetryCard
        telemetry={mt5.data}
        loading={mt5.isLoading}
        error={mt5.error}
        pipelineSource={dashboard.data.source}
      />

      <Grid container spacing={2}>
        {dashboard.data.services.map((service) => (
          <Grid key={service.id} size={{ xs: 12, sm: 6, xl: 4 }}>
            <Card sx={{ height: "100%" }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" gap={2}>
                  <Typography fontWeight={800}>{service.name}</Typography>
                  <StatusChip value={service.status} />
                </Stack>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 2, minHeight: 42 }}
                >
                  {service.message}
                </Typography>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  sx={{ mt: 2 }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Latency
                  </Typography>
                  <Typography variant="caption" fontWeight={800}>
                    {service.latencyMs === null
                      ? "—"
                      : `${service.latencyMs} ms`}
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {dateTime(service.checkedAt)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
}

function Mt5TelemetryCard({
  telemetry,
  loading,
  error,
  pipelineSource,
}: {
  telemetry: Mt5TelemetrySnapshot | undefined;
  loading: boolean;
  error: unknown;
  pipelineSource: string;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent>
          <Typography fontWeight={800}>MT5 Real Telemetry</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Đang đọc MT5 Bridge…
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (!telemetry) {
    return (
      <Card>
        <CardContent>
          <Typography fontWeight={800}>MT5 Real Telemetry</Typography>
          <Alert severity="error" sx={{ mt: 2 }}>
            {error instanceof Error
              ? error.message
              : "Không đọc được MT5 telemetry."}
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const health = telemetry.health;
  const quote = telemetry.quote;
  const spec = telemetry.spec;
  const spreadRatio =
    quote && spec && spec.maxSpread > 0
      ? Math.min(100, (quote.spread / spec.maxSpread) * 100)
      : 0;
  const spreadSafe =
    quote && spec ? quote.spread <= spec.maxSpread : false;

  return (
    <Card>
      <CardContent>
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          gap={2}
        >
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Typography fontWeight={800}>MT5 Real Telemetry</Typography>
              <StatusChip value={telemetry.status} />
              {health?.accountMode && (
                <StatusChip value={health.accountMode.toUpperCase()} />
              )}
              <StatusChip value="READ ONLY" />
            </Stack>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 1 }}
            >
              {telemetry.message}
            </Typography>
          </Box>

          <Stack alignItems={{ xs: "flex-start", md: "flex-end" }}>
            <Typography variant="caption" color="text.secondary">
              Bridge latency
            </Typography>
            <Typography fontWeight={800}>
              {telemetry.latencyMs === null
                ? "—"
                : `${telemetry.latencyMs} ms`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {dateTime(telemetry.checkedAt)}
            </Typography>
          </Stack>
        </Stack>

        {health?.accountMode === "real" && (
          <Alert severity="error" sx={{ mt: 2 }}>
            REAL account detected. Không tiếp tục execution integration.
          </Alert>
        )}

        {health?.tradingEnabled && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            MT5 Bridge đang bật trading. Giai đoạn Dashboard hiện tại chỉ yêu cầu
            telemetry/read-only.
          </Alert>
        )}

        <Alert severity="info" sx={{ mt: 2 }}>
          Broker quote bên dưới là dữ liệu MT5 thật. Market pipeline hiện vẫn là{" "}
          <strong>{pipelineSource}</strong>; quote MT5 chưa được đưa vào
          Analysis → Signal → Risk → Strategy.
        </Alert>

        <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
          <TelemetryMetric
            label="Connection"
            value={health?.connected ? "CONNECTED" : "DISCONNECTED"}
          />
          <TelemetryMetric
            label="Bridge trading"
            value={health?.tradingEnabled ? "ENABLED" : "LOCKED"}
          />
          <TelemetryMetric
            label="Terminal Algo"
            value={health?.terminalTradeAllowed ? "ALLOWED" : "BLOCKED"}
          />
          <TelemetryMetric
            label="Expert trading"
            value={health?.expertTradeAllowed ? "ALLOWED" : "BLOCKED"}
          />
          <TelemetryMetric
            label="Open positions"
            value={String(telemetry.positions.length)}
          />
          <TelemetryMetric
            label="API execution"
            value="NOT EXPOSED"
          />
        </Grid>

        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Box className="mini-card">
              <Typography variant="caption" color="text.secondary">
                MT5 XAUUSD quote
              </Typography>
              <Stack
                direction="row"
                spacing={3}
                alignItems="end"
                sx={{ mt: 1 }}
              >
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Bid
                  </Typography>
                  <Typography variant="h5" fontWeight={800}>
                    {price(quote?.bid ?? null)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Ask
                  </Typography>
                  <Typography variant="h6" fontWeight={800}>
                    {price(quote?.ask ?? null)}
                  </Typography>
                </Box>
              </Stack>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mt: 1 }}
              >
                Broker symbol {quote?.brokerSymbol ?? "—"} · Server{" "}
                {health?.server ?? "—"}
              </Typography>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Box className="mini-card">
              <Stack direction="row" justifyContent="space-between" gap={2}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Current spread
                  </Typography>
                  <Typography variant="h5" fontWeight={800}>
                    {price(quote?.spread ?? null)}
                  </Typography>
                </Box>
                <Box textAlign="right">
                  <Typography variant="caption" color="text.secondary">
                    Spread guard
                  </Typography>
                  <Typography variant="h6" fontWeight={800}>
                    {price(spec?.maxSpread ?? null)}
                  </Typography>
                </Box>
              </Stack>

              <LinearProgress
                variant="determinate"
                value={spreadRatio}
                color={spreadSafe ? "success" : "error"}
                sx={{ mt: 2, height: 7, borderRadius: 10 }}
              />

              <Stack
                direction="row"
                justifyContent="space-between"
                sx={{ mt: 1 }}
              >
                <Typography variant="caption" color="text.secondary">
                  Utilization
                </Typography>
                <Typography variant="caption" fontWeight={800}>
                  {quote && spec
                    ? `${((quote.spread / spec.maxSpread) * 100).toFixed(1)}%`
                    : "—"}
                </Typography>
              </Stack>
            </Box>
          </Grid>
        </Grid>

        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={3}
          sx={{ mt: 2 }}
        >
          <Typography variant="caption" color="text.secondary">
            Tick size {spec ? price(spec.tickSize) : "—"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Min lot {spec?.minVolume ?? "—"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Volume step {spec?.volumeStep ?? "—"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Terminal {health?.terminalVersion ?? "—"}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

function TelemetryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Grid size={{ xs: 6, md: 4, xl: 2 }}>
      <Box className="mini-card">
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography fontWeight={800} sx={{ mt: 0.5 }}>
          {value}
        </Typography>
      </Box>
    </Grid>
  );
}
