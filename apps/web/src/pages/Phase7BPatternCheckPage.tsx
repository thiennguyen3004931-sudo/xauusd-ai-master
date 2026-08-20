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
import { price } from "../format";
import { ErrorState, LoadingState } from "../ui/PageState";

type Side = "BUY" | "SELL";
type Confidence = "CHƯA_ĐÁNH_GIÁ" | "TIÊU_CHUẨN" | "CAO" | "RẤT_CAO";
type EntryDiagnostics = {
  closeTime: number;
  nextCloseTime: number;
  pattern: { matched: boolean; name: string | null; side: Side | null };
  trend: {
    ma20?: number;
    ma50?: number;
    ma200?: number;
    matchedPatternSide?: boolean;
    m15Supertrend: Side | null;
    m5Supertrend: Side | null;
    m5FlipAgeBars: number | null;
    m5FreshAligned?: boolean;
    m15SupertrendLine?: number | null;
    m5SupertrendLine?: number | null;
    m15TrendlineDistance?: number | null;
    m5TrendlineDistance?: number | null;
    m15TrendlineReaction?: boolean;
    m5TrendlineReaction?: boolean;
    confidenceSide?: Side | null;
    confidenceM5Supertrend?: Side | null;
    confidenceScore?: number | null;
    confidenceLevel?: Confidence;
  };
  fvg: { sameDirectionConfirmed: boolean; requiredForEntry: false };
  entry: {
    eligible: boolean;
    side: Side | null;
    referenceEntry: number;
    structuralStopDistance: number | null;
    stopDistance: number | null;
    action: "WAIT_SIGNAL" | "ENTRY_IMMEDIATE" | "WAIT_PULLBACK";
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
  if (name === "THREE_CANDLE_BODY_DOMINANCE") return "Ba nến B+C+D > A";
  return "Chưa có mô hình";
}

function tenDoTinCay(value: Confidence | undefined) {
  if (value === "RẤT_CAO") return "RẤT CAO";
  if (value === "CAO") return "CAO";
  if (value === "TIÊU_CHUẨN") return "TIÊU CHUẨN";
  return "CHƯA ĐÁNH GIÁ";
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

function vietnamDateTime(timestamp: number) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(timestamp));
}

function countdown(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function fmtDistance(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${value.toFixed(2)} giá`;
}

export function Phase7BPatternCheckPage() {
  const [now, setNow] = useState(Date.now());
  const query = useQuery({ queryKey: ["phase7b-live-entry-gate"], queryFn: getSnapshot, refetchInterval: 3_000, retry: false });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const d = query.data?.entryDiagnostics ?? null;
  const rawRemainingMs = d ? d.nextCloseTime - now : 0;
  const remainingMs = Math.max(0, Math.min(15 * 60_000, rawRemainingMs));
  const progress = useMemo(() => d ? Math.max(0, Math.min(100, ((15 * 60_000 - remainingMs) / (15 * 60_000)) * 100)) : 0, [d, remainingMs]);

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) return <ErrorState message={query.error instanceof Error ? query.error.message : "Không đọc được điều kiện vào lệnh."} />;
  if (!d) return <ErrorState message={query.data.entryDiagnosticsError ?? "Dữ liệu điều kiện vào lệnh chưa sẵn sàng."} />;

  const wanted = d.pattern.side;
  const m15Pass = Boolean(wanted && d.trend.m15Supertrend === wanted);
  const m5Pass = Boolean(wanted && d.trend.m5Supertrend === wanted);
  const immediateEntry = d.entry.action === "ENTRY_IMMEDIATE" && d.entry.eligible;
  const waitPullback = d.entry.action === "WAIT_PULLBACK";
  const stopPass = immediateEntry || waitPullback;
  const quote = query.data.mt5?.quote;
  const mid = quote?.bid !== undefined && quote?.ask !== undefined ? (Number(quote.bid) + Number(quote.ask)) / 2 : null;
  const confidence = d.trend.confidenceLevel ?? "CHƯA_ĐÁNH_GIÁ";

  const reasons = [
    {
      ok: d.pattern.matched,
      text: d.pattern.matched
        ? `Mô hình ${tenMoHinh(d.pattern.name)} theo hướng ${tenHuong(d.pattern.side)} đã xuất hiện trên nến đóng.`
        : "Chưa xuất hiện một trong 3 mô hình nến bắt buộc.",
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
        ? (m5Pass ? `Supertrend M5 đang cùng hướng ${tenHuong(wanted)}.` : `Supertrend M5 chưa cùng hướng ${tenHuong(wanted)}.`)
        : "Chưa có hướng mô hình để đối chiếu Supertrend M5.",
    },
    {
      ok: stopPass,
      text: waitPullback
        ? `SL cấu trúc ${d.entry.structuralStopDistance?.toFixed(2)} giá vượt 10: setup hợp lệ nhưng phải chờ giá hồi trong cửa sổ M15 kế tiếp.`
        : immediateEntry
          ? `SL vận hành ${d.entry.stopDistance?.toFixed(2)} giá (SL cấu trúc ${d.entry.structuralStopDistance?.toFixed(2)}; tối thiểu 6, tối đa 10).`
          : "Chưa xác định được SL cấu trúc hợp lệ.",
    },
  ];

  return (
    <Stack spacing={2.2}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1.5} alignItems={{ md: "center" }}>
        <Box>
          <Typography variant="overline" color="primary" fontWeight={900}>KIỂM TRA TÍN HIỆU</Typography>
          <Typography variant="h4" fontWeight={950}>Điều kiện vào lệnh</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>Chỉ đánh giá dữ liệu nến M15/M5 đã đóng. Flip age chỉ để tham khảo, không chặn lệnh.</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label={immediateEntry ? `${tenHuong(d.entry.side)} · VÀO NGAY` : waitPullback ? `${tenHuong(d.entry.side)} · CHỜ HỒI` : "CHỜ TÍN HIỆU"} color={immediateEntry ? "success" : waitPullback ? "warning" : "default"} sx={{ fontWeight: 900 }} />
          <Chip label={`ĐỘ TIN CẬY ${d.trend.confidenceScore ?? "—"}/100 · ${tenDoTinCay(confidence)}`} color={confidence === "RẤT_CAO" || confidence === "CAO" ? "success" : "default"} variant="outlined" sx={{ fontWeight: 900 }} />
        </Stack>
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
            <Typography variant="caption" color="text.secondary" display="block" mt={1}>Nến vừa đóng (giờ Việt Nam): {vietnamDateTime(d.closeTime)}</Typography>
            <Typography variant="caption" color="text.secondary" display="block">Đóng nến tiếp theo (giờ Việt Nam): {vietnamDateTime(d.nextCloseTime)}</Typography>
          </CardContent></Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card variant="outlined" sx={{ borderColor: immediateEntry ? "success.main" : waitPullback ? "warning.main" : undefined }}><CardContent>
            <Typography variant="caption" color="text.secondary" fontWeight={900}>DỰ KIẾN VÀO LỆNH</Typography>
            <Typography variant="h6" fontWeight={950}>{immediateEntry ? `${tenHuong(d.entry.side)} · SẴN SÀNG` : waitPullback ? `${tenHuong(d.entry.side)} · CHỜ HỒI` : "CHỜ TÍN HIỆU"}</Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>{waitPullback ? `Giá tín hiệu ${price(d.entry.referenceEntry)} · SL cấu trúc ${fmtDistance(d.entry.structuralStopDistance)}` : `Giá tham chiếu ${price(d.entry.referenceEntry)} · SL vận hành ${fmtDistance(d.entry.stopDistance)}`}</Typography>
          </CardContent></Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <GateCard label="1 · MÔ HÌNH NẾN" value={tenMoHinh(d.pattern.name)} status={d.pattern.matched ? "ĐẠT" : "CHỜ"} detail={d.pattern.side ? `Hướng ${tenHuong(d.pattern.side)}` : "Chờ nhấn chìm, 2 nến thân chiếm ưu thế, hoặc 3 nến B+C+D > A"} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <GateCard label="2 · SUPERTREND M15" value={tenHuong(d.trend.m15Supertrend)} status={wanted ? (m15Pass ? "ĐẠT" : "CHỜ") : "THÔNG TIN"} detail={wanted ? `Phải cùng hướng ${tenHuong(wanted)}` : "Đối chiếu sau khi có mô hình nến"} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <GateCard label="3 · SUPERTREND M5" value={tenHuong(d.trend.m5Supertrend)} status={wanted ? (m5Pass ? "ĐẠT" : "CHỜ") : "THÔNG TIN"} detail={d.trend.m5FlipAgeBars === null ? "Flip age: chưa xác định · chỉ tham khảo" : `Flip age ${d.trend.m5FlipAgeBars} nến · chỉ tham khảo, không chặn lệnh`} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, xl: 3 }}>
          <GateCard label="4 · DỪNG LỖ" value={waitPullback ? `${fmtDistance(d.entry.structuralStopDistance)} · CHỜ HỒI` : fmtDistance(d.entry.stopDistance)} status={immediateEntry ? "ĐẠT" : "CHỜ"} detail={waitPullback ? "Vượt 10: không vào đuổi; chờ hồi trong M15 kế tiếp" : "SL cấu trúc, vận hành tối thiểu 6 và tối đa 10 giá"} />
        </Grid>
      </Grid>

      <Card variant="outlined" sx={{ borderColor: confidence === "RẤT_CAO" || confidence === "CAO" ? "success.main" : undefined }}>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={1}>
            <Box>
              <Typography variant="h6" fontWeight={900}>Độ tin cậy liên tục: {d.trend.confidenceScore ?? "—"}/100 · hướng {tenHuong(d.trend.confidenceSide)}</Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>Điểm được cập nhật cả khi chưa có mô hình entry: ST M15 20, ST M5 20, MA20/50 20, MA200 10, phản ứng gần ST M15/M5 mỗi khung 10 và FVG cùng hướng 10. Điểm chỉ diễn giải chất lượng, không thay thế 4 gate vào lệnh.</Typography>
            </Box>
            <Chip label={tenDoTinCay(confidence)} color={confidence === "RẤT_CAO" || confidence === "CAO" ? "success" : "default"} variant="outlined" />
          </Stack>
          <Grid container spacing={2} mt={0.4}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="body2" fontWeight={800}>M15: {d.trend.m15TrendlineReaction ? "✓ Có phản ứng gần đường Supertrend" : "Không có phản ứng gần rõ ràng"}</Typography>
              <Typography variant="caption" color="text.secondary">Đường ST {price(d.trend.m15SupertrendLine ?? null)} · khoảng cách {fmtDistance(d.trend.m15TrendlineDistance)}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="body2" fontWeight={800}>M5 live ({tenHuong(d.trend.confidenceM5Supertrend)}): {d.trend.m5TrendlineReaction ? "✓ Có phản ứng gần đường Supertrend" : "Không có phản ứng gần rõ ràng"}</Typography>
              <Typography variant="caption" color="text.secondary">Đường ST {price(d.trend.m5SupertrendLine ?? null)} · khoảng cách {fmtDistance(d.trend.m5TrendlineDistance)}</Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" justifyContent="space-between" gap={1} alignItems="center">
            <Typography variant="h6" fontWeight={900}>{immediateEntry ? "Vì sao hệ thống được phép vào lệnh?" : waitPullback ? "Vì sao hệ thống đang chờ hồi?" : "Vì sao hệ thống chưa vào lệnh?"}</Typography>
            <Chip label={immediateEntry ? "ĐỦ 4 ĐIỀU KIỆN" : waitPullback ? "SETUP ĐẠT · SL > 10" : `${reasons.filter((item) => !item.ok).length} ĐIỀU KIỆN CHƯA ĐẠT`} color={immediateEntry ? "success" : "warning"} variant="outlined" />
          </Stack>
          <Stack spacing={1.1} mt={2}>
            {reasons.map((item, index) => (
              <Typography key={index} variant="body2" color={item.ok ? "success.main" : "warning.main"} fontWeight={700}>
                {item.ok ? "✓" : "•"} {item.text}
              </Typography>
            ))}
            <Typography variant="body2" color="text.secondary" fontWeight={700}>
              ℹ MA20/50: {d.trend.matchedPatternSide ? "CÙNG HƯỚNG MÔ HÌNH" : "CHƯA CÙNG HƯỚNG MÔ HÌNH"}. Chỉ dùng xác nhận độ tin cậy, không phải entry gate.
            </Typography>
            <Typography variant="body2" color="text.secondary" fontWeight={700}>
              ℹ MA200: {d.trend.ma200 === undefined ? "—" : price(d.trend.ma200)}. Chỉ xác nhận xu hướng khung lớn; không chặn entry và không trực tiếp chốt runner.
            </Typography>
            <Typography variant="body2" color="text.secondary" fontWeight={700}>
              ℹ Flip age M5: {d.trend.m5FlipAgeBars ?? "—"} nến. Chỉ để tham khảo độ mới của xu hướng, không phải entry gate.
            </Typography>
            <Typography variant="body2" color="text.secondary" fontWeight={700}>
              ℹ FVG cùng hướng: {d.fvg.sameDirectionConfirmed ? "CÓ" : "KHÔNG"}. FVG chỉ là bối cảnh chất lượng, không bắt buộc để vào lệnh.
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Alert severity={immediateEntry ? "success" : waitPullback ? "warning" : "info"}>
        {immediateEntry
          ? `KẾT LUẬN: Có thể vào ${tenHuong(d.entry.side)} vì mô hình nến, Supertrend M15, Supertrend M5 và khoảng SL đều đạt. Độ tin cậy hiện tại: ${tenDoTinCay(confidence)}.`
          : waitPullback
            ? `KẾT LUẬN: Không vào đuổi. Bot chờ giá hồi để SL cấu trúc còn tối đa 10 giá trong cửa sổ M15 kế tiếp; setup hết hạn hoặc mất đồng thuận M15/M5 thì hủy.`
            : "KẾT LUẬN: Chưa gửi lệnh. Bot tiếp tục chờ đến khi 4 điều kiện bắt buộc cùng đạt trên dữ liệu nến đã đóng."}
      </Alert>
      <Alert severity="info">Trend NORMAL: +6 → BE, +10 → chốt 1/3; runner siết SL theo cấu trúc M15 và đóng khi M15 phá MA50 ngược hướng hoặc có FVG ngược hướng kèm nến từ chối. Sideway NORMAL: +6 → BE, +10 → chốt 1/3, phần còn lại chốt ở biên đối diện vùng giá. RECOVERY_TP dùng TP full-position thích ứng 6–10 giá, không tăng lot.</Alert>
    </Stack>
  );
}
