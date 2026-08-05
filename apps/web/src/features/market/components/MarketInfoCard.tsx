import {
  Card,
  CardContent,
  Typography,
  Stack,
  Divider,
} from "@mui/material";

import { useMarket } from "../hooks/useMarket";

export default function MarketInfoCard() {
  const { data } = useMarket();

  if (!data) return null;

  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>

        <Typography variant="h6">
          Market Information
        </Typography>

        <Divider sx={{ my: 2 }} />

        <Stack spacing={1}>

          <Typography>Symbol : {data.symbol}</Typography>

          <Typography>Bid : {data.bid}</Typography>

          <Typography>Ask : {data.ask}</Typography>

          <Typography>Spread : {data.spread}</Typography>

          <Typography>High : {data.high}</Typography>

          <Typography>Low : {data.low}</Typography>

          <Typography>Trend : {data.trend}</Typography>

          <Typography>Session : {data.session}</Typography>

          <Typography>Volatility : {data.volatility}</Typography>

          <Typography>Time : {data.time}</Typography>

        </Stack>

      </CardContent>
    </Card>
  );
}