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
import { Phase7BDemoPage } from "./pages/Phase7BDemoPage";
import { Phase7BPatternCheckPage } from "./pages/Phase7BPatternCheckPage";
import { Phase7BOpsPage } from "./pages/Phase7BOpsPage";
import { Phase7CControlCenterPage } from "./pages/Phase7CControlCenterPage";
import { Phase7CBacktestPage } from "./pages/Phase7CBacktestPage";
import { Phase7CAutoLotBacktestPage } from "./pages/Phase7CAutoLotBacktestPage";
import { Phase7CRiskPage } from "./pages/Phase7CRiskPage";
import { Phase7DDailyPnlPage } from "./pages/Phase7DDailyPnlPage";
import { Phase7DManagementPage } from "./pages/Phase7DManagementPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <DashboardLayout />,
    children: [
      { index: true, element: <Phase7CControlCenterPage /> },
      { path: "phase7b-demo", element: <Phase7BDemoPage /> },
      { path: "phase7b-pattern-check", element: <Phase7BPatternCheckPage /> },
      { path: "phase7b-ops", element: <Phase7BOpsPage /> },
      { path: "phase7c-backtest", element: <Phase7CBacktestPage /> },
      { path: "phase7d-daily-pnl", element: <Phase7DDailyPnlPage /> },
      { path: "phase7d-management", element: <Phase7DManagementPage /> },
      { path: "phase7c-auto-lot", element: <Phase7CAutoLotBacktestPage /> },
      { path: "phase7c-risk", element: <Phase7CRiskPage /> },
      { path: "performance", element: <PerformancePage /> },
      { path: "system", element: <SystemPage /> },
      { path: "legacy-overview", element: <OverviewPage /> },
      { path: "signals", element: <SignalsPage /> },
      { path: "risk", element: <RiskPage /> },
      { path: "ai", element: <AiPage /> },
      { path: "backtest", element: <BacktestPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);