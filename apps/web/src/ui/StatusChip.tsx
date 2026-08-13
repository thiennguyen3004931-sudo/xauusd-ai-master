import { Chip } from "@mui/material";

export function StatusChip({ value }: { value: string }) {
  const normalized = value.toUpperCase();
  const color =
    ["BUY", "CONFIRM", "APPROVED", "HEALTHY", "EXECUTE", "WAITING_SIGNAL", "MANAGING"].includes(normalized)
      ? "success"
      : ["SELL", "REJECT", "BLOCKED", "OFFLINE", "MT5_OFFLINE", "BOT_STALE", "POSITION_NOT_MANAGED"].includes(normalized)
        ? "error"
        : ["WAIT", "DEGRADED", "DOWNGRADE_TO_WAIT", "READY_NOT_ARMED", "STARTING"].includes(normalized)
          ? "warning"
          : "default";

  return (
    <Chip
      size="small"
      color={color}
      variant="outlined"
      label={value.replaceAll("_", " ")}
      sx={{ fontWeight: 700, letterSpacing: ".06em", fontSize: 10 }}
    />
  );
}
