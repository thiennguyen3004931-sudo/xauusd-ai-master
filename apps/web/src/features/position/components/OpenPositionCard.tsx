import { Card, CardContent, Typography } from "@mui/material";

export default function OpenPositionCard() {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="h6">
          Open Positions
        </Typography>
      </CardContent>
    </Card>
  );
}