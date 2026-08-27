import { Stack } from "@mui/material";
import { Phase7CExecutionAuthorizationCard } from "../ui/Phase7CExecutionAuthorizationCard";
import { Phase7CControlCenterPage } from "./Phase7CControlCenterPage";

export function Phase7CControlCenterShellPage() {
  return (
    <Stack spacing={3}>
      <Phase7CExecutionAuthorizationCard />
      <Phase7CControlCenterPage />
    </Stack>
  );
}
