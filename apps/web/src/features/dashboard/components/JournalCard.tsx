import { Card, CardContent, Typography } from "@mui/material";

export default function JournalCard() {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="h6">
          Trading Journal
        </Typography>

        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 2 }}
        >
          No journal entries.
        </Typography>
      </CardContent>
    </Card>
  );
}