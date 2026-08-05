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
  const { data: market, isLoading, error } = useMarket();

  if (isLoading) {
    return (
      <Card sx={{ height: "100%" }}>
        <CardContent>
          <Typography>Loading market...</Typography>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card sx={{ height: "100%" }}>
        <CardContent>
          <Typography color="error">
            Cannot connect to Market API
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (!market) {
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
          label={market.trend}
          color={market.trend === "Bullish" ? "success" : "error"}
          sx={{ mb: 2 }}
        />

        <Divider sx={{ mb: 2 }} />

        <Stack spacing={1.2}>
          <Typography>
            <b>Symbol:</b> {market.symbol}
          </Typography>

          <Typography>
            <b>Bid:</b> {market.bid}
          </Typography>

          <Typography>
            <b>Ask:</b> {market.ask}
          </Typography>

          <Typography>
            <b>Spread:</b> {market.spread}
          </Typography>

          <Typography>
            <b>Session:</b> {market.session}
          </Typography>

          <Typography>
            <b>Trend:</b> {market.trend}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}