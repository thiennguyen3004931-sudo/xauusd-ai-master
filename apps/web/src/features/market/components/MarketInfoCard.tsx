import {
  Card,
  CardContent,
  Typography,
  Stack,
  Divider,
} from "@mui/material";

import { useMarket } from "../hooks/useMarket";

export default function MarketInfoCard() {
  const market = useMarket();

  if (!market) {
    return (
      <Card sx={{ height: "100%" }}>
        <CardContent>
          <Typography>Loading market...</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="h6">
          Market Information
        </Typography>

        <Divider sx={{ my: 2 }} />

        <Stack spacing={1}>
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
            <b>High:</b> {market.high}
          </Typography>

          <Typography>
            <b>Low:</b> {market.low}
          </Typography>

          <Typography>
            <b>Trend:</b> {market.trend}
          </Typography>

          <Typography>
            <b>Session:</b> {market.session}
          </Typography>

          <Typography>
            <b>Volatility:</b> {market.volatility}
          </Typography>

          <Typography>
            <b>Time:</b> {market.time}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}