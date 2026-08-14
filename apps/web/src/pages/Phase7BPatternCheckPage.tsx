import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import CancelRounded from "@mui/icons-material/CancelRounded";
import CandlestickChartRounded from "@mui/icons-material/CandlestickChartRounded";
import { useQuery } from "@tanstack/react-query";
import { dateTime, price } from "../format";
import { ErrorState, LoadingState } from "../ui/PageState";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

type Check = {
  key: string;
  label: string;
  pass: boolean;
  actual: string;
  rule: string;
  difference?: number;
};

type SideResult = {
  eligible: boolean;
  pattern: "ENGULFING" | "TWO_CANDLE_BODY_DOMINANCE" | null;
  engulfing: { pass: boolean; checks: Check[] };
  twoCandle: { pass: boolean; checks: Check[] };
  trend: { pass: boolean; checks: Check[] };
  fvgConfirmed: boolean;
  reason: string;
};

type Snapshot = {
  readOnly: true;
  generatedAt: number;
  symbol: string;
  timeframe: string;
  closeTime: number;
  nextCloseTime: number;
  rules: {
    entry: string;
    engulfBodyTolerancePrice: number;
    fvgRequiredForEntry: false;
    twoCandle: string;
  };
  candles: Record<"A" | "B" | "C", {
    closeTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    body: number;
    color: "BULL" | "BEAR" | "DOJI";
  }>;
  ma: { ma20: number; ma50: number; ma200: number };
  buy: SideResult;
  sell: SideResult;
};

async function getPatternCheck(): Promise<Snapshot> {
  const response = await fetch(`${API_BASE}/api/v1/phase7b-pattern-check`, { cache: "no-store" });
  const payload = await response.json() as Snapshot | { error?: string };
  if (!response.ok) throw new Error("error" in payload && payload.error ? payload.error : `HTTP ${response.status}`);
  return payload as Snapshot;
}

function PassChip({ pass }: { pass: boolean }) {
  return (
    <Chip
      size="small"
      icon={pass ? <CheckCircleRounded /> : <CancelRounded />}
      label={pass ? "PASS" : "FAIL"}
      color={pass ? "success" : "error"}
      variant="outlined"
      sx={{ fontWeight: 800 }}
    />
  );
}

function CandleCard({ label, candle }: { label: string; candle: Snapshot["candles"]["A"] }) {
  const color = candle.color === "BULL" ? "success" : candle.color === "BEAR" ? "error" : "default";
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
          <Typography fontWeight={900}>{label}</Typography>
          <Chip size="small" label={candle.color} color={color} variant="outlined" />
        </Stack>
        <Typography variant="caption" color="text.secondary">Đóng: {dateTime(candle.closeTime)}</Typography>
        <Grid container spacing={1.2} mt={0.5}>
          <Grid size={6}><Typography variant="caption" color="text.secondary">Open</Typography><Typography fontWeight={800}>{price(candle.open)}</Typography></Grid>
          <Grid size={6}><Typography variant="caption" color="text.secondary">Close</Typography><Typography fontWeight={800}>{price(candle.close)}</Typography></Grid>
          <Grid size={6}><Typography variant="caption" color="text.secondary">High</Typography><Typography>{price(candle.high)}</Typography></Grid>
          <Grid size={6}><Typography variant="caption" color="text.secondary">Low</Typography><Typography>{price(candle.low)}</Typography></Grid>
        </Grid>
        <Divider sx={{ my: 1.5 }} />
        <Typography variant="caption" color="text.secondary">Thân nến</Typography>
        <Typography variant="h6" fontWeight={900}>{price(candle.body)}</Typography>
      </CardContent>
    </Card>
  );
}

function ChecksTable({ title, pass, checks }: { title: string; pass: boolean; checks: Check[] }) {
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography fontWeight={900}>{title}</Typography>
        <PassChip pass={pass} />
      </Stack>
      <TableContainer sx={{ border: "1px solid rgba(148,163,184,.12)", borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Điều kiện</TableCell>
              <TableCell>Kết quả thực tế</TableCell>
              <TableCell width={90}>Trạng thái</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {checks.map((item) => (
              <TableRow key={item.key}>
                <TableCell>
                  <Typography variant="body2" fontWeight={700}>{item.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{item.rule}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: "monospace" }}>{item.actual}</Typography>
                  {item.difference !== undefined && (
                    <Typography variant="caption" color="text.secondary">
                      Chênh lệch: {price(item.difference)} giá
                    </Typography>
                  )}
                </TableCell>
                <TableCell><PassChip pass={item.pass} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

function SidePanel({ side, result }: { side: "BUY" | "SELL"; result: SideResult }) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={1} alignItems={{ sm: "center" }}>
          <Box>
            <Typography variant="h6" fontWeight={900}>{side} ENTRY CHECK</Typography>
            <Typography variant="body2" color="text.secondary">{result.reason}</Typography>
          </Box>
          <Chip
            label={result.eligible ? `${side} READY` : `${side} WAIT`}
            color={result.eligible ? "success" : "default"}
            sx={{ fontWeight: 900 }}
          />
        </Stack>

        <Stack direction="row" spacing={1} mt={2} flexWrap="wrap" useFlexGap>
          <Chip label={`Pattern: ${result.pattern ?? "NONE"}`} color={result.pattern ? "success" : "default"} variant="outlined" />
          <Chip label={`MA trend: ${result.trend.pass ? "PASS" : "FAIL"}`} color={result.trend.pass ? "success" : "error"} variant="outlined" />
          <Chip label={`FVG: ${result.fvgConfirmed ? "CONFIRMED" : "OPTIONAL"}`} color={result.fvgConfirmed ? "success" : "default"} variant="outlined" />
        </Stack>

        <Stack spacing={2.5} mt={2.5}>
          <ChecksTable title="Engulfing" pass={result.engulfing.pass} checks={result.engulfing.checks} />
          <ChecksTable title="Mẫu 2 nến" pass={result.twoCandle.pass} checks={result.twoCandle.checks} />
          <ChecksTable title="MA20 / MA50 / MA200" pass={result.trend.pass} checks={result.trend.checks} />
        </Stack>
      </CardContent>
    </Card>
  );
}

export function Phase7BPatternCheckPage() {
  const query = useQuery({
    queryKey: ["phase7b-pattern-check"],
    queryFn: getPatternCheck,
    refetchInterval: 5_000,
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState error={query.error} />;
  const data = query.data;

  return (
    <Stack spacing={2}>
      <Alert severity="info" icon={<CandlestickChartRounded />}>
        <b>Engulfing cho phép sai số tối đa 0,10 giá ở mép thân nến.</b> Ví dụ SELL: Open hiện tại thấp hơn Close nến trước 0,04 giá vẫn PASS. Mẫu 2 nến giữ nguyên: thân B &lt; thân A và thân B + C &gt; thân A. FVG không bắt buộc entry.
      </Alert>

      <Card variant="outlined">
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2}>
            <Box>
              <Typography variant="h6" fontWeight={900}>M15 Pattern Check · {data.symbol}</Typography>
              <Typography variant="body2" color="text.secondary">
                Cây vừa đóng: {dateTime(data.closeTime)} · cập nhật mỗi 5 giây · read-only
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label={`Tolerance ${price(data.rules.engulfBodyTolerancePrice)} giá`} color="primary" variant="outlined" />
              <Chip label={`MA20 ${price(data.ma.ma20)}`} variant="outlined" />
              <Chip label={`MA50 ${price(data.ma.ma50)}`} variant="outlined" />
              <Chip label={`MA200 ${price(data.ma.ma200)}`} variant="outlined" />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}><CandleCard label="A · nến trước 2" candle={data.candles.A} /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><CandleCard label="B · nến trước 1" candle={data.candles.B} /></Grid>
        <Grid size={{ xs: 12, md: 4 }}><CandleCard label="C · nến vừa đóng" candle={data.candles.C} /></Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, xl: 6 }}><SidePanel side="BUY" result={data.buy} /></Grid>
        <Grid size={{ xs: 12, xl: 6 }}><SidePanel side="SELL" result={data.sell} /></Grid>
      </Grid>
    </Stack>
  );
}
