import { Stack } from "@mui/material";
import { Phase7BOpsPage } from "./Phase7BOpsPage";
import { Phase7CAccountSwitchCard } from "../ui/Phase7CAccountSwitchCard";
import { Phase7CStrategyEntryConditionsCard } from "../ui/Phase7CStrategyEntryConditionsCard";

export function Phase7CAccountRiskPage() {
  return (
    <Stack spacing={3}>
      <Phase7CAccountSwitchCard />
      <Phase7CStrategyEntryConditionsCard />
      <Phase7BOpsPage />
    </Stack>
  );
}
