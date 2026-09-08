import { useState } from "react";
import { Button, Grid, Stack } from "@mui/material";
import { Phase7CAccountSwitchCard } from "../ui/Phase7CAccountSwitchCard";
import { Phase7CControlCenterCompactSection } from "../ui/Phase7CControlCenterCompactSection";
import { Phase7CCounterfactualIntelligenceCard } from "../ui/Phase7CCounterfactualIntelligenceCard";
import { Phase7CExecutionAuthorizationCard } from "../ui/Phase7CExecutionAuthorizationCard";
import { Phase7CIntelligenceSummaryCard } from "../ui/Phase7CIntelligenceSummaryCard";
import { Phase7COperatorStatusBar } from "../ui/Phase7COperatorStatusBar";
import { Phase7CPerformanceEffectivenessCard } from "../ui/Phase7CPerformanceEffectivenessCard";
import { Phase7CPerformanceIntelligenceCard } from "../ui/Phase7CPerformanceIntelligenceCard";
import { Phase7CRecommendationIntelligenceCard } from "../ui/Phase7CRecommendationIntelligenceCard";
import { Phase7CRuntimeSourceAttestationCard } from "../ui/Phase7CRuntimeSourceAttestationCard";

export function Phase7CControlCenterShellPage() {
  const [showIntelligenceDetails, setShowIntelligenceDetails] = useState(false);

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

      <Phase7CControlCenterCompactSection />
      <Phase7CIntelligenceSummaryCard />
      <Button
        size="small"
        variant="text"
        onClick={() => setShowIntelligenceDetails((value) => !value)}
        sx={{ alignSelf: "flex-start", fontWeight: 900 }}
      >
        {showIntelligenceDetails ? "Ẩn Intelligence chi tiết" : "Mở Intelligence chi tiết"}
      </Button>
      {showIntelligenceDetails ? (
        <Stack spacing={2}>
          <Phase7CPerformanceIntelligenceCard />
          <Phase7CPerformanceEffectivenessCard />
          <Phase7CCounterfactualIntelligenceCard />
          <Phase7CRecommendationIntelligenceCard />
        </Stack>
      ) : null}
      <Phase7CRuntimeSourceAttestationCard />
    </Stack>
  );
}
