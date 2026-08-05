import {
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Typography,
} from "@mui/material";

import { useMarket } from "../../market/hooks/useMarket";

export default function MarketStatus() {
  const { data, isLoading } = useMarket();

  if (isLoading) {
    return (
      <Card sx={{ height: "100%" }}>
        <CardContent>
          <Typography>Loading market...</Typography>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card sx={{ height: "100%" }}>
        <CardContent>
          <Typography>No market data.</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>

        <Typography variant="h6" gutterBottom>
          Market Status
        </Typography>

        <Chip
          label={data.trend}
          color={data.trend === "Bullish" ? "success" : "error"}
          sx={{ mb: 2 }}
        />

        <Divider sx={{ mb: 2 }} />

        <Stack spacing={1.2}>

          <Typography>
            <b>Symbol:</b> {data.symbol}
          </Typography>

          <Typography>
            <b>Bid:</b> {data.bid}
          </Typography>

          <Typography>
            <b>Ask:</b> {data.ask}
          </Typography>

          <Typography>
            <b>Spread:</b> {data.spread}
          </Typography>

          <Typography>
            <b>Session:</b> {data.session}
          </Typography>

          <Typography>
            <b>Trend:</b> {data.trend}
          </Typography>

        </Stack>

      </CardContent>
    </Card>
  );
}