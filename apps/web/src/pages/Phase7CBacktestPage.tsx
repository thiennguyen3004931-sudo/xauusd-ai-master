import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
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
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import { getMt5Performance, runPhase7CBacktest } from "../api";
import type { Phase7CBacktestResult } from "../phase7c-types";
import { MetricCard } from "../ui/MetricCard";
import { Sparkline } from "../ui/Sparkline";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function initialRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 90 * 24 * 60 * 60_000);
  return { from: isoDate(from), to: isoDate(to) };
}

function money(value: number) {
  return `${value >= 0 ? "+" : "−"}$${Math.abs(value).toFixed(2)}`;
}

function pf(value: number | null) {
  return value === null ? "∞" : value.toFixed(2);
}

function dateTime(value: number) {
  return new Date(value).toLocaleString("vi-VN");
}

export function Phase7CBacktestPage() {
  const range = initialRange();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [fixedVolume, setFixedVolume] = useState(0.03);
  const [result, setResult] = useState<Phase7CBacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const forward = useQuery({
    queryKey: ["phase7c-forward-90"],
    queryFn: () => getMt5Performance(90),
    refetchInterval: 30_000,
    retry: false,
  });

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setRunning(true);
    setError(null);
    try {
      setResult(await runPhase7CBacktest({ from, to, fixedVolume }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backtest failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={800}>PHASE 7C · RESEARCH</Typography>
          <Typography variant="h5" fontWeight={900}>Canonical Phase 7B Backtest</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Chọn khoảng thời gian tùy ý. Dữ liệu lấy trực tiếp từ lịch sử MT5/DBGMarkets, không dùng Pack 10 MockProvider.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip color="success" variant="outlined" label="BROKER HISTORY" />
          <Chip color="warning" variant="outlined" label="CLOSED-BAR REPLAY" />
        </Stack>
      </Stack>

      <Alert severity="warning">
        Replay này chạy đúng rule Phase 7B trên M15 đóng + M5 execution approximation. Nó không thể tái tạo chính xác cửa sổ pre-close 5–10 giây nếu không có snapshot/tick lịch sử, nên <b>productionEquivalent=false</b>.
      </Alert>

      <Card>
        <CardContent component="form" onSubmit={run}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField fullWidth size="small" type="date" label="Từ ngày" value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField fullWidth size="small" type="date" label="Đến ngày" value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField fullWidth size="small" type="number" label="Fixed volume" value={fixedVolume} onChange={(e) => setFixedVolume(Number(e.target.value))} slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Button fullWidth type="submit" variant="contained" startIcon={<PlayArrowRounded />} disabled={running} sx={{ height: 40 }}>
                {running ? "Đang tải MT5 + replay..." : "Chạy Canonical Backtest"}
              </Button>
            </Grid>
          </Grid>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Giới hạn hiện tại: tối đa 370 ngày/lần để tránh tải quá nặng M5 history. Volume chỉ áp dụng cho research, không đổi bot DEMO.
          </Typography>
        </CardContent>
      </Card>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {result ? <BacktestResultView result={result} forward={forward.data?.systemOwned.metrics ?? null} /> : null}
    </Stack>
  );
}

function BacktestResultView({ result, forward }: { result: Phase7CBacktestResult; forward: { totalTrades: number; winRatePercent: number; netPnl: number; profitFactor: number | null } | null }) {
  const m = result.metrics;
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1}>
        <Box>
          <Typography fontWeight={900}>{result.range.from} → {result.range.to}</Typography>
          <Typography variant="caption" color="text.secondary">
            {result.account.server} · login {result.account.login ?? "—"} · {result.range.m15Bars} M15 · {result.range.m5Bars} M5
          </Typography>
        </Box>
        <Chip label={`${m.trades} trades · ${m.tradesPerTradingDay.toFixed(2)}/day`} />
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}><MetricCard label="Net P/L" value={money(m.netPnl)} detail={`Expectancy ${money(m.expectancy)}`} tone={m.netPnl >= 0 ? "success.main" : "error.main"} /></Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}><MetricCard label="Win rate" value={`${m.winRatePercent.toFixed(1)}%`} detail={`${m.signals} signals`} /></Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}><MetricCard label="Profit factor" value={pf(m.profitFactor)} detail={`Avg R ${m.averageR.toFixed(3)}`} tone={(m.profitFactor ?? 999) >= 1 ? "success.main" : "error.main"} /></Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}><MetricCard label="Max drawdown" value={`$${m.maxDrawdownUsd.toFixed(2)}`} detail={`Hold ${m.averageHoldHours.toFixed(2)}h`} tone="error.main" /></Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, xl: 7 }}>
          <Card><CardContent><Typography fontWeight={900}>Cumulative P/L</Typography><Box sx={{ mt: 2 }}><Sparkline values={result.equityCurve.map((p) => p.pnl)} positive={m.netPnl >= 0} /></Box></CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, xl: 5 }}>
          <Card sx={{ height: "100%" }}><CardContent>
            <Typography fontWeight={900}>Management counters</Typography>
            <Stack spacing={1} sx={{ mt: 2 }}>
              <Typography>+6 → BE: <b>{m.breakEvenApplied}</b></Typography>
              <Typography>+10 → chốt 1/3: <b>{m.partialApplied}</b></Typography>
              <Typography>Structural SL updates: <b>{m.structuralTrailUpdates}</b></Typography>
              <Typography>Skipped vì max 1 position: <b>{m.skippedWhilePositionOpen}</b></Typography>
              <Typography>Exit: STOP <b>{m.exitReasons.STOP ?? 0}</b> · MA20 <b>{m.exitReasons.TREND_MA20 ?? 0}</b> · reversal <b>{m.exitReasons.REVERSAL_FVG_REJECTION ?? 0}</b></Typography>
            </Stack>
          </CardContent></Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}><Breakdown title="BUY" item={result.breakdown.buy} /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><Breakdown title="SELL" item={result.breakdown.sell} /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><Breakdown title="ENGULFING" item={result.breakdown.engulfing} /></Grid>
        <Grid size={{ xs: 12, md: 6 }}><Breakdown title="TWO-CANDLE" item={result.breakdown.twoCandle} /></Grid>
      </Grid>

      {forward ? (
        <Card><CardContent>
          <Typography fontWeight={900}>Forward vs Backtest</Typography>
          <Typography variant="caption" color="text.secondary">Forward bên dưới là SYSTEM-owned 90 ngày hiện tại; khoảng thời gian có thể khác backtest nên chỉ dùng như bảng đối chiếu nhanh, không phải A/B đồng kỳ.</Typography>
          <Table size="small" sx={{ mt: 1 }}>
            <TableHead><TableRow><TableCell>Lane</TableCell><TableCell align="right">Trades</TableCell><TableCell align="right">Win %</TableCell><TableCell align="right">Net P/L</TableCell><TableCell align="right">PF</TableCell></TableRow></TableHead>
            <TableBody>
              <TableRow><TableCell>Backtest selected range</TableCell><TableCell align="right">{m.trades}</TableCell><TableCell align="right">{m.winRatePercent.toFixed(1)}%</TableCell><TableCell align="right">{money(m.netPnl)}</TableCell><TableCell align="right">{pf(m.profitFactor)}</TableCell></TableRow>
              <TableRow><TableCell>Forward SYSTEM · 90d</TableCell><TableCell align="right">{forward.totalTrades}</TableCell><TableCell align="right">{forward.winRatePercent.toFixed(1)}%</TableCell><TableCell align="right">{money(forward.netPnl)}</TableCell><TableCell align="right">{pf(forward.profitFactor)}</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent></Card>
      ) : null}

      <Card><CardContent>
        <Typography fontWeight={900}>Trade Journal · backtest</Typography>
        <TableContainer sx={{ mt: 1, maxHeight: 520 }}>
          <Table size="small" stickyHeader>
            <TableHead><TableRow><TableCell>Entry</TableCell><TableCell>Side</TableCell><TableCell>Pattern</TableCell><TableCell align="right">Lot</TableCell><TableCell align="right">Entry</TableCell><TableCell align="right">SL</TableCell><TableCell align="right">Exit</TableCell><TableCell>Reason</TableCell><TableCell align="right">P/L</TableCell><TableCell align="right">R</TableCell></TableRow></TableHead>
            <TableBody>
              {result.trades.map((trade, index) => (
                <TableRow key={`${trade.entryTime}-${trade.side}-${index}`}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{dateTime(trade.entryTime)}</TableCell>
                  <TableCell><Chip size="small" color={trade.side === "BUY" ? "success" : "error"} variant="outlined" label={trade.side} /></TableCell>
                  <TableCell>{trade.pattern === "TWO_CANDLE_BODY_DOMINANCE" ? "TWO-CANDLE" : trade.pattern}</TableCell>
                  <TableCell align="right">{trade.volume.toFixed(2)}</TableCell>
                  <TableCell align="right">{trade.entry.toFixed(2)}</TableCell>
                  <TableCell align="right">{trade.stopLoss.toFixed(2)}</TableCell>
                  <TableCell align="right">{trade.exit.toFixed(2)}</TableCell>
                  <TableCell>{trade.exitReason}</TableCell>
                  <TableCell align="right" sx={{ color: trade.pnl >= 0 ? "success.main" : "error.main", fontWeight: 800 }}>{money(trade.pnl)}</TableCell>
                  <TableCell align="right">{trade.rMultiple.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent></Card>

      {result.notes.map((note) => <Alert key={note} severity="info">{note}</Alert>)}
    </Stack>
  );
}

function Breakdown({ title, item }: { title: string; item: { trades: number; winRatePercent: number; netPnl: number; profitFactor: number | null; expectancy: number; averageR: number } }) {
  return (
    <Card><CardContent>
      <Stack direction="row" justifyContent="space-between"><Typography fontWeight={900}>{title}</Typography><Chip size="small" label={`${item.trades} trades`} /></Stack>
      <Grid container spacing={2} sx={{ mt: 0.5 }}>
        <Grid size={{ xs: 6 }}><Typography variant="caption" color="text.secondary">Win rate</Typography><Typography fontWeight={800}>{item.winRatePercent.toFixed(1)}%</Typography></Grid>
        <Grid size={{ xs: 6 }}><Typography variant="caption" color="text.secondary">Net P/L</Typography><Typography fontWeight={800} color={item.netPnl >= 0 ? "success.main" : "error.main"}>{money(item.netPnl)}</Typography></Grid>
        <Grid size={{ xs: 6 }}><Typography variant="caption" color="text.secondary">PF</Typography><Typography fontWeight={800}>{pf(item.profitFactor)}</Typography></Grid>
        <Grid size={{ xs: 6 }}><Typography variant="caption" color="text.secondary">Avg R</Typography><Typography fontWeight={800}>{item.averageR.toFixed(3)}</Typography></Grid>
      </Grid>
    </CardContent></Card>
  );
}
