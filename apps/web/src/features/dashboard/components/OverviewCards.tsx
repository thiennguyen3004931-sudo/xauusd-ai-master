import Grid from "@mui/material/Grid";
import StatCard from "../../../shared/components/StatCard";

const cards = [
  { title: "Balance", value: "$10,000" },
  { title: "Equity", value: "$10,120" },
  { title: "Profit Today", value: "+120" },
  { title: "Win Rate", value: "82%" },
];

export default function OverviewCards() {
  return (
    <Grid container spacing={2}>
      {cards.map((item) => (
        <Grid key={item.title} size={{ xs: 12, md: 3 }}>
          <StatCard
            title={item.title}
            value={item.value}
          />
        </Grid>
      ))}
    </Grid>
  );
}