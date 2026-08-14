import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
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
import { getPhase7CAccountRisk } from "../api";
import { MetricCard } from "../ui/MetricCard";
import { ErrorState, LoadingState } from "../ui/PageState";

function money(value: number | null | undefined, currency = "USD") {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
}

export function Phase7CRiskPage() {
  const [riskPercent, setRiskPercent] = useState(0.25);
  const [maxLot, setMaxLot] = useState(0.03);
  const q = useQuery({
    queryKey: ["phase7c-risk", riskPercent, maxLot],
    queryFn: () => getPhase7CAccountRisk(riskPercent, maxLot),
    refetchInterval: 5000,
    retry: false,
  });

  if (q.isLoading) return <LoadingState />;
  if (!q.data) return <ErrorState message={q.error instanceof Error ? q.error.message : "Không đọc được Risk & Auto Lot."} />;

  const data = q.data;
  const currency = data.account.accountCurrency ?? "USD";

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={800}>PHASE 7C · RISK</Typography>
          <Typography variant="h5" fontWeight={900}>Risk & Auto Lot SHADOW</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Tính lot theo balance + SL thực tế của XAUUSD nhưng chỉ hiển thị khuyến nghị. Phase 7B vẫn giữ fixed 0.03 lot.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip color="warning" label="SHADOW ONLY" />
          <Chip variant="outlined" label="EXECUTION MUTATION = FALSE" />
        </Stack>
      </Stack>

      <Alert severity="info">
        Không Martingale, không tăng lot để gỡ lỗ. Nếu lot tối thiểu của broker vượt risk target thì hệ thống đề xuất <b>BLOCK</b>, không ép mở 0.01 lot.
      </Alert>

      <Card>
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField fullWidth size="small" type="number" label="Risk target / trade (%)" value={riskPercent} onChange={(e) => setRiskPercent(Number(e.target.value))} slotProps={{ htmlInput: { min: 0.01, max: 5, step: 0.05 } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField fullWidth size="small" type="number" label="Max Auto Lot cap" value={maxLot} onChange={(e) => setMaxLot(Number(e.target.value))} slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <MetricCard label="Target risk" value={money(data.configuration.targetRiskUsd, currency)} detail={`${data.configuration.riskPercent.toFixed(2)}% balance`} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <MetricCard label="Phase 7B actual" value={`${data.configuration.currentFixedVolume.toFixed(2)} lot`} detail="UNCHANGED · forward sample" />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}><MetricCard label="Account" value={String(data.account.accountLogin ?? "—")} detail={`${data.account.server ?? "—"} · ${String(data.account.accountMode ?? "—").toUpperCase()}`} /></Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}><MetricCard label="Balance / Equity" value={money(data.account.accountBalance, currency)} detail={money(data.account.accountEquity, currency)} /></Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}><MetricCard label="Leverage" value={`1:${data.account.accountLeverage ?? "—"}`} detail={`Free margin ${money(data.account.accountFreeMargin, currency)}`} /></Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}><MetricCard label="Spread" value={`${data.quote.spread.toFixed(2)} giá`} detail={`Guard ${data.spec.maxSpread.toFixed(2)} · ${data.quote.spread <= data.spec.maxSpread ? "PASS" : "BLOCK"}`} tone={data.quote.spread <= data.spec.maxSpread ? "success.main" : "error.main"} /></Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography fontWeight={900}>Auto Lot Shadow Matrix</Typography>
          <Typography variant="caption" color="text.secondary">
            Công thức dùng broker-native cash/price-unit/lot. Lot luôn floor theo volumeStep và clamp bởi Max Auto Lot cap.
          </Typography>
          <TableContainer sx={{ mt: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>SL distance</TableCell>
                  <TableCell align="right">Loss @ 1.00 lot</TableCell>
                  <TableCell align="right">Raw lot</TableCell>
                  <TableCell align="right">Recommended</TableCell>
                  <TableCell align="right">Risk $</TableCell>
                  <TableCell align="right">Risk %</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.stopDistance}>
                    <TableCell><b>{row.stopDistance.toFixed(0)} giá</b></TableCell>
                    <TableCell align="right">{money(row.lossAtSlOneLot, currency)}</TableCell>
                    <TableCell align="right">{row.rawLot.toFixed(4)}</TableCell>
                    <TableCell align="right"><b>{row.recommendedLot.toFixed(2)} lot</b></TableCell>
                    <TableCell align="right">{money(row.estimatedRiskUsd, currency)}</TableCell>
                    <TableCell align="right">{row.estimatedRiskPercent.toFixed(3)}%</TableCell>
                    <TableCell><Chip size="small" color={row.approved ? "success" : "error"} variant="outlined" label={row.approved ? "SHADOW APPROVED" : "BLOCK"} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, xl: 6 }}>
          <Card sx={{ height: "100%" }}><CardContent>
            <Typography fontWeight={900}>Broker / Symbol Specification</Typography>
            <Stack spacing={1} sx={{ mt: 2 }}>
              <Typography>Symbol: <b>{data.spec.brokerSymbol}</b></Typography>
              <Typography>Tick size: <b>{data.spec.tickSize}</b> · Point: <b>{data.spec.point}</b></Typography>
              <Typography>Cash / 1 giá / 1 lot: <b>${data.spec.cashPerPriceUnitPerLot.toFixed(2)}</b></Typography>
              <Typography>Contract size: <b>{data.spec.contractSize}</b></Typography>
              <Typography>Lot: min <b>{data.spec.minVolume}</b> · step <b>{data.spec.volumeStep}</b> · max <b>{data.spec.maxVolume}</b></Typography>
              <Typography>Stops level: <b>{(data.spec.stopsLevelTicks * data.spec.point).toFixed(2)} giá</b></Typography>
              <Typography variant="caption" color="text.secondary">Risk value source: {data.spec.riskValueSource}</Typography>
            </Stack>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, xl: 6 }}>
          <Card sx={{ height: "100%" }}><CardContent>
            <Typography fontWeight={900}>Trading Permission</Typography>
            <Stack spacing={1.2} sx={{ mt: 2 }}>
              <Status label="Bridge trading" value={data.account.tradingEnabled} />
              <Status label="Terminal Algo Trading" value={data.account.terminalTradeAllowed} />
              <Status label="Expert trading" value={data.account.expertTradeAllowed} />
              <Status label="Account mode DEMO" value={data.account.accountMode === "demo"} />
              <Status label="Auto Lot execution" value={false} blockedText="OFF · SHADOW ONLY" />
            </Stack>
          </CardContent></Card>
        </Grid>
      </Grid>

      <Alert severity="warning">
        Chưa bật Auto Lot vào execution. Sau khi SHADOW + canonical backtest đủ dữ liệu, mới tạo một thay đổi riêng để cho DEMO dùng lot động; LIVE vẫn khóa.
      </Alert>
    </Stack>
  );
}

function Status({ label, value, blockedText }: { label: string; value: boolean; blockedText?: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography>{label}</Typography>
      <Chip size="small" color={value ? "success" : "warning"} variant="outlined" label={value ? "PASS" : blockedText ?? "OFF"} />
    </Stack>
  );
}
