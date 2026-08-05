import { Card, CardContent, Typography, Chip, Stack } from "@mui/material";

type Props = {
  title: string;
  status: "ONLINE" | "OFFLINE" | "READY" | "WAITING" | "CONNECTED";
};

const colorMap = {
  ONLINE: "success",
  READY: "primary",
  CONNECTED: "success",
  WAITING: "warning",
  OFFLINE: "error",
} as const;

export default function StatusCard({
  title,
  status,
}: Props) {
  return (
    <Card sx={{ minWidth: 240 }}>
      <CardContent>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography variant="h6">
            {title}
          </Typography>

          <Chip
            label={status}
            color={colorMap[status]}
          />
        </Stack>
      </CardContent>
    </Card>
  );
}