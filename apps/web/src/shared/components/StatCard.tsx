import { Card, CardContent, Typography } from "@mui/material";

type Props = {
  title: string;
  value: string | number;
};

export default function StatCard({ title, value }: Props) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>

        <Typography variant="h5" sx={{ fontWeight: 700, mt: 1 }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}