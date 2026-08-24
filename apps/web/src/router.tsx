import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { DashboardLayout } from "./ui/DashboardLayout";
import { LoadingState } from "./ui/PageState";
import { Phase7BDemoPage } from "./pages/Phase7BDemoPage";

const Phase7BPatternCheckPage = lazy(() =>
  import("./pages/Phase7BPatternCheckPage").then((module) => ({ default: module.Phase7BPatternCheckPage })),
);
const Phase7BOpsPage = lazy(() =>
  import("./pages/Phase7BOpsPage").then((module) => ({ default: module.Phase7BOpsPage })),
);
const Phase7CControlCenterPage = lazy(() =>
  import("./pages/Phase7CControlCenterPage").then((module) => ({ default: module.Phase7CControlCenterPage })),
);
const PerformancePage = lazy(() =>
  import("./pages/PerformancePage").then((module) => ({ default: module.PerformancePage })),
);

function DeferredPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <DashboardLayout />,
    children: [
      { index: true, element: <Phase7BDemoPage /> },
      { path: "phase7b-demo", element: <Navigate to="/" replace /> },
      {
        path: "phase7b-pattern-check",
        element: <DeferredPage><Phase7BPatternCheckPage /></DeferredPage>,
      },
      {
        path: "phase7b-ops",
        element: <DeferredPage><Phase7BOpsPage /></DeferredPage>,
      },
      {
        path: "phase7c-control-center",
        element: <DeferredPage><Phase7CControlCenterPage /></DeferredPage>,
      },
      {
        path: "performance",
        element: <DeferredPage><PerformancePage /></DeferredPage>,
      },
      { path: "system", element: <Navigate to="/phase7b-ops" replace /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
