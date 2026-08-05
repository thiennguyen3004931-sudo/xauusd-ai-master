import { Box, Grid, Typography } from "@mui/material";

import OverviewCards from "../components/OverviewCards";
import TradingViewCard from "../../tradingview/components/TradingViewCard";
import MarketInfoCard from "../../market/components/MarketInfoCard";
import MarketStatus from "../components/MarketStatus";
import SignalCard from "../components/SignalCard";
import JournalCard from "../components/JournalCard";
import OpenPositionCard from "../../position/components/OpenPositionCard";

export default function DashboardPage() {
  return (
    <Box>
      <Typography
        variant="h4"
        sx={{ fontWeight: 700, mb: 3 }}
      >
        XAUUSD AI MASTER
      </Typography>

      <OverviewCards />

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid size={12}>
          <TradingViewCard />
        </Grid>

        {/* Hàng 1 */}
        <Grid size={{ xs: 12, md: 6 }}>
          <MarketInfoCard />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <SignalCard />
        </Grid>

        {/* Hàng 2 */}
        <Grid size={{ xs: 12, md: 6 }}>
          <MarketStatus />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <OpenPositionCard />
        </Grid>

        {/* Hàng 3 */}
        <Grid size={12}>
          <JournalCard />
        </Grid>
      </Grid>
    </Box>
  );
}