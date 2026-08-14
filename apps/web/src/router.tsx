import { createBrowserRouter, Navigate } from "react-router-dom";
import { DashboardLayout } from "./ui/DashboardLayout";
import { Phase7BDemoPage } from "./pages/Phase7BDemoPage";
import { Phase7BPatternCheckPage } from "./pages/Phase7BPatternCheckPage";
import { Phase7BOpsPage } from "./pages/Phase7BOpsPage";
import { PerformancePage } from "./pages/PerformancePage";
import { SystemPage } from "./pages/SystemPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <DashboardLayout />,
    children: [
      { index: true, element: <Phase7BDemoPage /> },
      { path: "phase7b-demo", element: <Navigate to="/" replace /> },
      { path: "phase7b-pattern-check", element: <Phase7BPatternCheckPage /> },
      { path: "phase7b-ops", element: <Phase7BOpsPage /> },
      { path: "performance", element: <PerformancePage /> },
      { path: "system", element: <SystemPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
