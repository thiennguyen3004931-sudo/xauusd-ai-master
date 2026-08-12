import { useState } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";

import { useMt5Performance } from "../hooks";
import type {
  Mt5PerformanceBucket,
  Mt5PerformanceMetrics,
} from "../types";
import { ErrorState, LoadingState } from "../ui/PageState";
import { MetricCard } from "../ui/MetricCard";
import { Sparkline } from "../ui/Sparkline";

function money(
  value: number,
  currency: string,
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function pf(value: number | null): string {
  return value === null ? "∞" : value.toFixed(2);
}

function dateTime(value: number): string {
  return new Date(value).toLocaleString("vi-VN");
}

function MetricGrid({
  metrics,
  currency,
}: {
  metrics: Mt5PerformanceMetrics;
  currency: string;
}) {
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
        <MetricCard
          label="Net P/L"
          value={money(metrics.netPnl, currency)}
          detail={`${metrics.totalTrades} trades`}
          tone={metrics.netPnl >= 0 ? "success.main" : "error.main"}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
        <MetricCard
          label="Win rate"
          value={`${metrics.winRatePercent.toFixed(1)}%`}
          detail={`${metrics.wins} win · ${metrics.losses} loss`}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
        <MetricCard
          label="Profit factor"
          value={pf(metrics.profitFactor)}
          detail={`Expectancy ${money(metrics.expectancy, currency)}`}
          tone={(metrics.profitFactor ?? 999) >= 1 ? "success.main" : "error.main"}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
        <MetricCard
          label="Max drawdown"
          value={`${metrics.maxDrawdownPercent.toFixed(2)}%`}
          detail={money(metrics.maxDrawdown, currency)}
          tone="error.main"
        />
      </Grid>
    </Grid>
  );
}

function BreakdownTable({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: Mt5PerformanceBucket[];
  currency: string;
}) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Typography fontWeight={800}>{title}</Typography>
        <TableContainer sx={{ mt: 1, maxHeight: 310 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Nhóm</TableCell>
                <TableCell align="right">Trades</TableCell>
                <TableCell align="right">Win %</TableCell>
                <TableCell align="right">P/L</TableCell>
                <TableCell align="right">PF</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>{row.label}</TableCell>
                  <TableCell align="right">{row.totalTrades}</TableCell>
                  <TableCell align="right">
                    {row.winRatePercent.toFixed(1)}%
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      color:
                        row.netPnl >= 0
                          ? "success.main"
                          : "error.main",
                    }}
                  >
                    {money(row.netPnl, currency)}
                  </TableCell>
                  <TableCell align="right">{pf(row.profitFactor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}

export function PerformancePage() {
  const [days, setDays] = useState(90);
  const query = useMt5Performance(days);

  if (query.isLoading) {
    return <LoadingState />;
  }

  if (!query.data) {
    return (
      <ErrorState
        message={
          query.error instanceof Error
            ? query.error.message
            : "Không đọc được MT5 performance."
        }
      />
    );
  }

  const data = query.data;
  const all = data.accountWide.metrics;
  const system = data.systemOwned.metrics;
  const curve = data.accountWide.equityCurve;

  return (
    <Stack spacing={2}>
      <Box>
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          gap={2}
        >
          <Box>
            <Typography
              variant="overline"
              color="primary"
              fontWeight={800}
            >
              MT5 DEMO · READ ONLY
            </Typography>
            <Typography variant="h5" fontWeight={800}>
              MT5 Performance / Nhật ký chiến lược
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mt: 1 }}
            >
              Lịch sử deal MT5 thật. Account-wide để theo dõi tài khoản;
              SYSTEM-only để rút kinh nghiệm chiến lược.
            </Typography>
          </Box>

          <TextField
            select
            size="small"
            label="Khoảng thời gian"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            sx={{ minWidth: 160 }}
          >
            {[30, 90, 180, 365].map((value) => (
              <MenuItem key={value} value={value}>
                {value} ngày
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Box>

      <Alert severity="info">
        Strategy auto-change: DISABLED · LIVE: LOCKED · dữ liệu review
        không có quyền đặt/sửa/đóng lệnh.
      </Alert>

      <Typography fontWeight={800}>Toàn tài khoản MT5</Typography>
      <MetricGrid metrics={all} currency={data.currency} />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, xl: 6 }}>
          <Card>
            <CardContent>
              <Typography fontWeight={800}>Equity curve reconstructed</Typography>
              <Box sx={{ mt: 2 }}>
                <Sparkline
                  values={curve.map((point) => point.balance)}
                  positive={all.netPnl >= 0}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, xl: 6 }}>
          <Card>
            <CardContent>
              <Typography fontWeight={800}>Drawdown curve</Typography>
              <Box sx={{ mt: 2 }}>
                <Sparkline
                  values={curve.map((point) => point.drawdownPercent)}
                  positive={false}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        alignItems={{ md: "center" }}
        gap={1}
      >
        <Box>
          <Typography fontWeight={800}>
            System-owned strategy
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Chỉ opening deal đúng system magic và loại validation/gate trades.
          </Typography>
        </Box>
        <Chip
          color={data.systemOwned.sampleReady ? "success" : "warning"}
          label={
            data.systemOwned.sampleReady
              ? "ĐỦ MẪU REVIEW"
              : `${system.totalTrades}/${data.systemOwned.minimumRecommendationSample} TRADES`
          }
        />
      </Stack>

      <MetricGrid metrics={system} currency={data.currency} />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, xl: 6 }}>
          <BreakdownTable
            title="BUY vs SELL"
            rows={data.breakdown.side}
            currency={data.currency}
          />
        </Grid>
        <Grid size={{ xs: 12, xl: 6 }}>
          <BreakdownTable
            title="Phiên giao dịch"
            rows={data.breakdown.session}
            currency={data.currency}
          />
        </Grid>
        <Grid size={{ xs: 12, xl: 6 }}>
          <BreakdownTable
            title="Theo ngày trong tuần"
            rows={data.breakdown.weekday}
            currency={data.currency}
          />
        </Grid>
        <Grid size={{ xs: 12, xl: 6 }}>
          <BreakdownTable
            title="Ownership"
            rows={data.breakdown.ownership}
            currency={data.currency}
          />
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography fontWeight={800}>
            Rút kinh nghiệm / Đề xuất
          </Typography>

          <Stack spacing={1.5} sx={{ mt: 2 }}>
            {data.recommendations.map((item) => (
              <Alert
                key={`${item.severity}-${item.title}`}
                severity={
                  item.severity === "ACTION"
                    ? "error"
                    : item.severity === "WATCH"
                      ? "warning"
                      : "info"
                }
              >
                <Typography fontWeight={800}>{item.title}</Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {item.evidence}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  → {item.suggestion}
                </Typography>
              </Alert>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography fontWeight={800}>Lịch sử lệnh MT5</Typography>
          <TableContainer sx={{ mt: 1, maxHeight: 560 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Đóng lúc</TableCell>
                  <TableCell>Side</TableCell>
                  <TableCell>Scope</TableCell>
                  <TableCell>Session</TableCell>
                  <TableCell align="right">Lot</TableCell>
                  <TableCell align="right">Entry</TableCell>
                  <TableCell align="right">Exit</TableCell>
                  <TableCell align="right">Phút</TableCell>
                  <TableCell align="right">P/L</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.trades.map((trade) => (
                  <TableRow key={trade.id}>
                    <TableCell>{dateTime(trade.closedAt)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={trade.side}
                        color={trade.side === "BUY" ? "success" : "error"}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{trade.ownership}</TableCell>
                    <TableCell>{trade.session}</TableCell>
                    <TableCell align="right">
                      {trade.volume.toFixed(2)}
                    </TableCell>
                    <TableCell align="right">
                      {trade.entry.toFixed(2)}
                    </TableCell>
                    <TableCell align="right">
                      {trade.exit.toFixed(2)}
                    </TableCell>
                    <TableCell align="right">
                      {trade.durationMinutes.toFixed(1)}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        color:
                          trade.netPnl >= 0
                            ? "success.main"
                            : "error.main",
                        fontWeight: 800,
                      }}
                    >
                      {money(trade.netPnl, data.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Alert severity="warning">
        Exit reason hiện hiển thị UNKNOWN vì payload deal MT5 hiện tại chưa
        cung cấp trường reason. Không suy đoán SL/TP từ dữ liệu thiếu.
      </Alert>
    </Stack>
  );
}