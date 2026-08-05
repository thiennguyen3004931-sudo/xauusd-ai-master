import {
  Stack,
  Typography,
} from "@mui/material";

type Props = {
  label: string;
  value: React.ReactNode;
};

export default function ValueRow({
  label,
  value,
}: Props) {
  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      sx={{ py: 0.5 }}
    >
      <Typography color="text.secondary">
        {label}
      </Typography>

      <Typography fontWeight={600}>
        {value}
      </Typography>
    </Stack>
  );
}