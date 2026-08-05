import { Chip } from "@mui/material";

type Props = {
  action: "BUY" | "SELL" | "WAIT";
};

export default function SignalBadge({
  action,
}: Props) {
  const color =
    action === "BUY"
      ? "success"
      : action === "SELL"
      ? "error"
      : "warning";

  return (
    <Chip
      label={action}
      color={color}
      size="medium"
    />
  );
}