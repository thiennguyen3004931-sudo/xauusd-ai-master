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
            Stop Loss: <b>{signal.sl}</b>
          </Typography>

          <Typography>
            Take Profit 1: <b>{signal.tp1}</b>
          </Typography>

          <Typography>
            Take Profit 2: <b>{signal.tp2}</b>
          </Typography>

          <Typography>
            Take Profit 3: <b>{signal.tp3}</b>
          </Typography>

          <Typography>
            RR: <b>1 : {signal.rr}</b>
          </Typography>

          <Typography>
            Confidence: <b>{signal.confidence}%</b>
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
          {signal.reason.map((item) => (
            <Typography key={item} variant="body2">
              • {item}
            </Typography>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}