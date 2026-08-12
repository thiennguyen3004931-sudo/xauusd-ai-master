import { createBrowserRouter } from "react-router-dom";
import { DashboardLayout } from "./ui/DashboardLayout";
import { OverviewPage } from "./pages/OverviewPage";
import { SignalsPage } from "./pages/SignalsPage";
import { RiskPage } from "./pages/RiskPage";
import { AiPage } from "./pages/AiPage";
import { BacktestPage } from "./pages/BacktestPage";
import { PerformancePage } from "./pages/PerformancePage";
import { SystemPage } from "./pages/SystemPage";
import { SettingsPage } from "./pages/SettingsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <DashboardLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "signals", element: <SignalsPage /> },
      { path: "risk", element: <RiskPage /> },
      { path: "ai", element: <AiPage /> },
      { path: "backtest", element: <BacktestPage /> },
      { path: "performance", element: <PerformancePage /> },
      { path: "system", element: <SystemPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
