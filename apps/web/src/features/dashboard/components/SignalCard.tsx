import {
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Typography,
} from "@mui/material";

import { useAI } from "../../ai/hooks/useAI";

export default function SignalCard() {
  const signal = useAI();

  if (!signal) {
    return (
      <Card sx={{ height: "100%" }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            AI Signal
          </Typography>

          <Typography color="text.secondary">
            Loading AI Signal...
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          AI Signal
        </Typography>

        <Chip
          label={signal.action}
          color={
            signal.action === "BUY"
              ? "success"
              : signal.action === "SELL"
              ? "error"
              : "warning"
          }
          sx={{ mb: 2 }}
        />

        <Divider sx={{ mb: 2 }} />

        <Stack spacing={1}>
          <Typography>
            Entry: <b>{signal.entry}</b>
          </Typography>

          <Typography>
            Stop Loss: <b>{signal.stopLoss}</b>
          </Typography>

          <Typography>
            Take Profit 1: <b>{signal.takeProfit.tp1}</b>
          </Typography>

          <Typography>
            Take Profit 2: <b>{signal.takeProfit.tp2}</b>
          </Typography>

          <Typography>
            Take Profit 3: <b>{signal.takeProfit.tp3}</b>
          </Typography>

          <Typography>
            Risk : Reward: <b>1 : {signal.rr}</b>
          </Typography>

          <Typography>
            Confidence: <b>{signal.confidence}%</b>
          </Typography>

          <Typography>
            Strategy: <b>{signal.strategy}</b>
          </Typography>
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Typography
          variant="subtitle2"
          sx={{ mb: 1, fontWeight: 700 }}
        >
          AI Reasons
        </Typography>

        <Stack spacing={0.5}>
          {signal.reasons.map((item: string) => (
            <Typography
              key={item}
              variant="body2"
            >
              • {item}
            </Typography>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}