import { Stack } from "@mui/material";
import { Phase7BOpsPage } from "./Phase7BOpsPage";
import { Phase7CAccountSwitchCard } from "../ui/Phase7CAccountSwitchCard";

export function Phase7CAccountRiskPage() {
  return (
    <Stack spacing={3}>
      <Phase7CAccountSwitchCard />
      <Phase7BOpsPage />
    </Stack>
  );
}
