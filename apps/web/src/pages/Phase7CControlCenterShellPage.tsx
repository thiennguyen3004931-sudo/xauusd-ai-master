import { Stack } from "@mui/material";
import { Phase7CAccountSwitchCard } from "../ui/Phase7CAccountSwitchCard";
import { Phase7CExecutionAuthorizationCard } from "../ui/Phase7CExecutionAuthorizationCard";
import { Phase7CPerformanceIntelligenceCard } from "../ui/Phase7CPerformanceIntelligenceCard";
import { Phase7CPerformanceEffectivenessCard } from "../ui/Phase7CPerformanceEffectivenessCard";
import { Phase7CCounterfactualIntelligenceCard } from "../ui/Phase7CCounterfactualIntelligenceCard";
import { Phase7CRecommendationIntelligenceCard } from "../ui/Phase7CRecommendationIntelligenceCard";
import { Phase7CRuntimeSourceAttestationCard } from "../ui/Phase7CRuntimeSourceAttestationCard";
import { Phase7CControlCenterPage } from "./Phase7CControlCenterPage";

export function Phase7CControlCenterShellPage() {
  return (
    <Stack spacing={3}>
      <Phase7CExecutionAuthorizationCard />
      <Phase7CAccountSwitchCard />
      <Phase7CControlCenterPage />
      <Phase7CPerformanceIntelligenceCard />
      <Phase7CPerformanceEffectivenessCard />
      <Phase7CCounterfactualIntelligenceCard />
      <Phase7CRecommendationIntelligenceCard />
      <Phase7CRuntimeSourceAttestationCard />
    </Stack>
  );
}
