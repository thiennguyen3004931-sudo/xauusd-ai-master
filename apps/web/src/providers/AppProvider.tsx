import { ThemeProvider } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { theme } from "../theme";

import ErrorBoundary from "../core/components/ErrorBoundary";
import NotificationProvider from "../core/providers/NotificationProvider";
import { LoadingProvider } from "../core/providers/LoadingProvider";

const queryClient = new QueryClient();

type Props = {
  children: React.ReactNode;
};

export default function AppProvider({ children }: Props) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <LoadingProvider>
            <NotificationProvider>
              {children}
            </NotificationProvider>
          </LoadingProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}