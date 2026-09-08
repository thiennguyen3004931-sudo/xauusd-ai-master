import { Grid, Stack } from "@mui/material";
import { Phase7CAccountSwitchCard } from "../ui/Phase7CAccountSwitchCard";
import { Phase7CExecutionAuthorizationCard } from "../ui/Phase7CExecutionAuthorizationCard";
import { Phase7CIntelligenceSummaryCard } from "../ui/Phase7CIntelligenceSummaryCard";
import { Phase7COperatorStatusBar } from "../ui/Phase7COperatorStatusBar";
import { Phase7CRuntimeSourceAttestationCard } from "../ui/Phase7CRuntimeSourceAttestationCard";
import { Phase7CControlCenterPage } from "./Phase7CControlCenterPage";

export function Phase7CControlCenterShellPage() {
  return (
    <Stack spacing={2}>
      <Phase7COperatorStatusBar />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, xl: 6 }}>
          <Phase7CExecutionAuthorizationCard />
        </Grid>
        <Grid size={{ xs: 12, xl: 6 }}>
          <Phase7CAccountSwitchCard />
        </Grid>
      </Grid>

      <Phase7CControlCenterPage />
      <Phase7CIntelligenceSummaryCard />
      <Phase7CRuntimeSourceAttestationCard />
    </Stack>
  );
}
