import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { dateTime, price } from "../format";
import { ErrorState, LoadingState } from "../ui/PageState";

type Side = "BUY" | "SELL";
type EntryDiagnostics = {
  closeTime: number;
  nextCloseTime: number;
  pattern: { matched: boolean; name: string | null; side: Side | null };
  trend: {
    m15Supertrend: Side | null;
    m5Supertrend: Side | null;
    m5FlipAgeBars: number | null;
    m5FreshAligned: boolean;
  };
  fvg: { sameDirectionConfirmed: boolean; requiredForEntry: false };
  entry: {
    eligible: boolean;
    side: Side | null;
    referenceEntry: number;
    stopDistance: number | null;
    reason: string;
  };
};

type Snapshot = {
  botStatus: string;
  entryDiagnostics: EntryDiagnostics | null;
  entryDiagnosticsError?: string | null;
  mt5?: {
    quote?: { bid?: number; ask?: number } | null;
    health?: { accountMode?: string; accountLogin?: number | null; server?: string | null } | null;
  };
};

async function getSnapshot(): Promise<Snapshot> {
  const response = await fetch("/api/v1/phase7b-demo", { cache: "no-store" });
  const text = await response.text();
  if (!response.ok) {
    try {
      const parsed = JSON.parse(text) as { error?: string };
      throw new Error(parsed.error || `HTTP ${response.status}`);
    } catch (error) {
      if (error instanceof Error && error.message !== text) throw error;
      throw new Error(text || `HTTP ${response.status}`);
    }
  }
  return JSON.parse(text) as Snapshot;
}

function tenHuong(side: Side | null | undefined) {
  if (side === "BUY") return "MUA";
  if (side === "SELL") return "BÁN";
  return "—";
}

function tenMoHinh(name: string | null | undefined) {
  if (name === "ENGULFING") return "Nến nhấn chìm";
  if (name === "TWO_CANDLE_BODY_DOMINANCE") return "Hai nến thân chiếm ưu thế";
  return "Chưa có mô hình";
}

type GateStatus = "ĐẠT" | "CHỜ" | "THÔNG TIN";

function GateCard({ label, value, status, detail }: { label: string; value: string; status: GateStatus; detail: string }) {
  const color = status === "ĐẠT" ? "success" : status === "CHỜ" ? "warning" : "default";
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
          <Typography variant="caption" color="text.secondary" fontWeight={900}>{label}</Typography>
          <Chip size="small" label={status} color={color} variant="outlined" />
        </Stack>
        <Typography variant="h6" fontWeight={950} mt={1}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{detail}</Typography>
      </CardContent>
    </Card>
  );
}

function countdown(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function Phase7BPatternCheckPage() {
  const [now, setNow] = useState(Date.now());
  const query = useQuery({ queryKey: ["phase7b-live-entry-gate"], queryFn: getSnapshot, refetchInterval: 3_000, retry: false });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const d = query.data?.entryDiagnostics ?? null;
  const remainingMs = d ? d.nextCloseTime - now : 0;
  const progress = useMemo(() => d ? Math.max(0, Math.min(100, ((15 * 60_000 - remainingMs) / (15 * 60_000)) * 100)) : 0, [d, remainingMs]);

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState message={query.error instanceof Error ? query.error.message : "Không đọc được điều kiện vào lệnh."} />;
  if (!d) return <ErrorState message={query.data.entryDiagnosticsError ?? "Dữ liệu điều kiện vào lệnh chưa sẵn sàng."} />;

  const wanted = d.pattern.side;
  const m15Pass = Boolean(wanted && d.trend.m15Supertrend === wanted);
  const m5DirectionPass = Boolean(wanted && d.trend.m5Supertrend === wanted);
  const m5FreshPass = Boolean(wanted && d.trend.m5FreshAligned && d.trend.m5FlipAgeBars !== null && d.trend.m5FlipAgeBars <= 2);
  const m5Pass = m5DirectionPass && m5FreshPass;
  const stopPass = d.entry.stopDistance !== null && d.entry.stopDistance >= 6 && d.entry.stopDistance <= 10;
  const quote = query.data.mt5?.quote;
  const mid = quote?.bid !== undefined && quote?.ask !== undefined ? (Number(quote.bid) + Number(quote.ask)) / 2 : null;

  const reasons = [
    {
      ok: d.pattern.matched,
      text: d.pattern.matched
        ? `Mô hình ${tenMoHinh(d.pattern.name)} theo hướng ${tenHuong(d.pattern.side)} đã xuất hiện trên nến đóng.`
        : "Chưa xuất hiện một trong 2 mô hình nến bắt buộc.",
    },
    {
      ok: m15Pass,
      text: wanted
        ? (m15Pass ? `Supertrend M15 đang cùng hướng ${tenHuong(wanted)}.` : `Supertrend M15 chưa cùng hướng ${tenHuong(wanted)}.`)
        : "Chưa có hướng mô hình để đối chiếu Supertrend M15.",
    },
    {
      ok: m5Pass,
      text: wanted
        ? (m5Pass
          ? `M5 cùng hướng ${tenHuong(wanted)} và fresh flip còn ${d.trend.m5FlipAgeBars ?? "—"} nến đóng (yêu cầu ≤ 2).`
          : `M5 chưa đạt đồng thời cùng hướng và fresh flip ≤ 2 nến đóng.`)
        : "Chưa có hướng mô hình để đối chiếu M5.",
    },
    {
      ok: stopPass,
      text: stopPass
        ? `Khoảng dừng lỗ hợp lệ: ${d.entry.stopDistance?.toFixed(2)} giá.`
        : "Chưa xác định được khoảng dừng lỗ hợp lệ trong vùng 6–10 giá.",
    },
  ];

  return (
    <Stack spacing={2.2}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5} alignItems={{ md: "center" }}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={900}>KIỂM TRA TÍN HIỆU</Typography>
          <Typography variant="h4" fontWeight={950}>Điều kiện vào lệnh</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>Chỉ đánh giá dữ liệu nến M15/M5 đã đóng, không dùng nến đang hình thành.</Typography>
        </Box>
        <Chip label={d.entry.eligible ? `${tenHuong(d.entry.side)} · ĐỦ ĐIỀU KIỆN` : "CHƯA ĐỦ ĐIỀU KIỆN"} color={d.entry.eligible ? "success" : "default"} sx={{ fontWeight: 900 }} />
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined"><CardContent>
            <Typography variant="caption" color="text.secondary" fontWeight={900}>GIÁ XAUUSD</Typography>
            <Typography variant="h4" fontWeight={950}>{mid === null ? "—" : price(mid)}</Typography>
            <Typography variant="caption" color="text.secondary">Bid {quote?.bid === undefined ? "—" : price(Number(quote.bid))} · Ask {quote?.ask === undefined ? "—" : price(Number(quote.ask))}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined"><CardContent>
            <Typography variant="caption" color="text.secondary" fontWeight={900}>CÒN LẠI ĐẾN KHI ĐÓNG NẾN M15</Typography>
            <Typography variant="h4" fontWeight={950}>{countdown(remainingMs)}</Typography>
            <LinearProgress value={progress} variant="determinate" sx={{ mt: 1.5, height: 7, borderRadius: 99 }} />
            <Typography variant="caption" color="text.secondary" display="block" mt={1}>Nến vừa đóng: {dateTime(d.closeTime)}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ borderColor: d.entry.eligible ? "success.main" : undefined }}><CardContent>
            <Typography variant="caption" color="text.secondary" fontWeight={900}>DỰ KIẾN VÀO LỆNH</Typography>
            <Typography variant="h6" fontWeight={950}>{d.entry.eligible ? `${tenHuong(d.entry.side)} · SẴN SÀNG` : "CHỜ TÍN HIỆU"}</Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>Giá tham chiếu {price(d.entry.referenceEntry)} · SL {d.entry.stopDistance === null ? "—" : `${d.entry.stopDistance.toFixed(2)} giá`}</Typography>
          </CardContent></Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <GateCard label="1 · MÔ HÌNH NẾN" value={tenMoHinh(d.pattern.name)} status={d.pattern.matched ? "ĐẠT" : "CHỜ"} detail={d.pattern.side ? `Hướng ${tenHuong(d.pattern.side)}` : "Chờ nến nhấn chìm hoặc hai nến thân chiếm ưu thế"} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <GateCard label="2 · SUPERTREND M15" value={tenHuong(d.trend.m15Supertrend)} status={wanted ? (m15Pass ? "ĐẠT" : "CHỜ") : "THÔNG TIN"} detail={wanted ? `Phải cùng hướng ${tenHuong(wanted)}` : "Đối chiếu sau khi có mô hình nến"} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <GateCard label="3 · M5 CÙNG HƯỚNG + FRESH FLIP" value={tenHuong(d.trend.m5Supertrend)} status={wanted ? (m5Pass ? "ĐẠT" : "CHỜ") : "THÔNG TIN"} detail={d.trend.m5FlipAgeBars === null ? "Chưa có fresh flip" : `Fresh flip cách ${d.trend.m5FlipAgeBars} nến đóng · yêu cầu ≤ 2`} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <GateCard label="4 · DỪNG LỖ" value={d.entry.stopDistance === null ? "—" : `${d.entry.stopDistance.toFixed(2)} giá`} status={stopPass ? "ĐẠT" : "CHỜ"} detail="Khoảng SL vận hành: 6–10 giá" />
        </Grid>
      </Grid>

      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
            <Typography variant="h6" fontWeight={900}>{d.entry.eligible ? "Vì sao hệ thống được phép vào lệnh?" : "Vì sao hệ thống chưa vào lệnh?"}</Typography>
            <Chip label={d.entry.eligible ? "ĐỦ 4 ĐIỀU KIỆN" : `${reasons.filter((item) => !item.ok).length} ĐIỀU KIỆN CHƯA ĐẠT`} color={d.entry.eligible ? "success" : "warning"} variant="outlined" />
          </Stack>
          <Stack spacing={1.1} mt={2}>
            {reasons.map((item, index) => (
              <Typography key={index} variant="body2" color={item.ok ? "success.main" : "warning.main"} fontWeight={700}>
                {item.ok ? "✓" : "•"} {item.text}
              </Typography>
            ))}
            <Typography variant="body2" color="text.secondary" fontWeight={700}>
              ℹ FVG cùng hướng: {d.fvg.sameDirectionConfirmed ? "CÓ" : "KHÔNG"}. FVG chỉ là bối cảnh chất lượng, <b>không phải điều kiện bắt buộc để vào lệnh</b>.
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Alert severity={d.entry.eligible ? "success" : "info"}>
        {d.entry.eligible
          ? `KẾT LUẬN: Có thể vào ${tenHuong(d.entry.side)} vì mô hình nến, Supertrend M15, M5 fresh flip và khoảng SL đều đạt.`
          : "KẾT LUẬN: Chưa gửi lệnh. Bot tiếp tục chờ đến khi tất cả điều kiện bắt buộc cùng đạt trên dữ liệu nến đã đóng."}
      </Alert>
      <Alert severity="info">Quản lý sau khi khớp: +6 giá → dời SL về hòa vốn · +10 giá → chốt 1/3 · phần còn lại tiếp tục runner theo quản lý canonical. H1/H4 và FVG không phải TP cứng.</Alert>
    </Stack>
  );
}
