import { Box, Card, CardContent, Grid, Stack, Typography } from "@mui/material";
import { useDashboard } from "../hooks";
import { ErrorState, LoadingState } from "../ui/PageState";
import { StatusChip } from "../ui/StatusChip";
import { price } from "../format";

export function SignalsPage() {
  const query = useDashboard();
  if (query.isLoading) return <LoadingState />;
  if (!query.data) return <ErrorState message="Không có dữ liệu Signal Engine." />;
  const { signal, analysis, strategy } = query.data;
  return <Stack spacing={2}>
    <Header eyebrow="PACK 05" title="Signal Engine" subtitle="Giải thích tín hiệu sau Analysis + Indicators. Không có nút gửi lệnh trực tiếp." />
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 5 }}><Card><CardContent><Stack direction="row" justifyContent="space-between"><Typography fontWeight={800}>Tín hiệu hiện tại</Typography><StatusChip value={signal.direction} /></Stack><Typography variant="h2" fontWeight={800} sx={{ mt: 3 }}>{signal.confidence.toFixed(1)}%</Typography><Typography variant="caption" color="text.secondary">Confidence · {signal.strength}</Typography><Grid container spacing={1.5} sx={{ mt: 2 }}>{[["Entry",price(signal.entry)],["Stop Loss",price(signal.stopLoss)],["Take Profit",price(signal.takeProfit)],["Risk:Reward",signal.riskReward?.toFixed(2) ?? "—"]].map(([l,v]) => <Grid size={6} key={l}><Box className="mini-card"><Typography variant="caption" color="text.secondary">{l}</Typography><Typography fontWeight={800}>{v}</Typography></Box></Grid>)}</Grid></CardContent></Card></Grid>
      <Grid size={{ xs: 12, md: 7 }}><Card><CardContent><Typography fontWeight={800}>Lý do & gates</Typography><Stack spacing={1.5} sx={{ mt: 2 }}>{signal.reasons.map((reason, i) => <Box key={reason} className="reason-row"><span>{i+1}</span><Typography variant="body2">{reason}</Typography></Box>)}</Stack><Stack spacing={1} sx={{ mt: 3 }}><Info label="Analysis" value={`${analysis.trend} / ${analysis.structure} · score ${analysis.score.toFixed(1)}`} /><Info label="Risk" value={query.data.risk.approved ? "APPROVED" : query.data.risk.rejectionCodes.join(", ") || "BLOCKED"} /><Info label="Strategy" value={`${strategy.action} · ${strategy.strategyId ?? "no candidate"}`} /></Stack></CardContent></Card></Grid>
    </Grid>
  </Stack>;
}
function Header({eyebrow,title,subtitle}:{eyebrow:string;title:string;subtitle:string}){return <Box><Typography variant="overline" color="primary" fontWeight={800}>{eyebrow}</Typography><Typography variant="h5" fontWeight={800}>{title}</Typography><Typography variant="body2" color="text.secondary" sx={{mt:1}}>{subtitle}</Typography></Box>}
function Info({label,value}:{label:string;value:string}){return <Stack direction="row" justifyContent="space-between" gap={2}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="caption" fontWeight={800} textAlign="right">{value}</Typography></Stack>}
