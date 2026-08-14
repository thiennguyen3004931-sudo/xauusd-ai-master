import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import DashboardRounded from "@mui/icons-material/DashboardRounded";
import ShowChartRounded from "@mui/icons-material/ShowChartRounded";
import ShieldRounded from "@mui/icons-material/ShieldRounded";
import PsychologyRounded from "@mui/icons-material/PsychologyRounded";
import AssessmentRounded from "@mui/icons-material/AssessmentRounded";
import InsightsRounded from "@mui/icons-material/InsightsRounded";
import SmartToyRounded from "@mui/icons-material/SmartToyRounded";
import CandlestickChartRounded from "@mui/icons-material/CandlestickChartRounded";
import PowerSettingsNewRounded from "@mui/icons-material/PowerSettingsNewRounded";
import DnsRounded from "@mui/icons-material/DnsRounded";
import SettingsRounded from "@mui/icons-material/SettingsRounded";
import MenuRounded from "@mui/icons-material/MenuRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import TuneRounded from "@mui/icons-material/TuneRounded";
import { useDashboard } from "../hooks";
import { StatusChip } from "./StatusChip";

const drawerWidth = 270;

type LinkRow = readonly [string, string, typeof DashboardRounded];

const dashboardLinks = [
  ["/", "Control Center", DashboardRounded],
] as const;

const tradingLinks = [
  ["/phase7b-demo", "Phase 7B Monitor", SmartToyRounded],
  ["/phase7b-pattern-check", "M15 Pattern Check", CandlestickChartRounded],
  ["/phase7b-ops", "Bot & Telegram", PowerSettingsNewRounded],
] as const;

const researchLinks = [
  ["/phase7c-backtest", "Canonical Backtest", AssessmentRounded],
  ["/phase7e-supertrend", "Pattern + Supertrend", CandlestickChartRounded],
  ["/phase7d-daily-pnl", "Daily P/L Optimizer", ShowChartRounded],
  ["/phase7d-management", "BE + Partial Optimizer", TuneRounded],
  ["/phase7d-daily-scale", "Daily 10/20 Scale", InsightsRounded],
  ["/phase7c-auto-lot", "Auto Lot vs Fixed", TuneRounded],
] as const;

const performanceLinks = [
  ["/performance", "Forward Performance", InsightsRounded],
] as const;

const riskLinks = [
  ["/phase7c-risk", "Risk & Auto Lot", ShieldRounded],
] as const;

const systemLinks = [
  ["/system", "System Health", DnsRounded],
] as const;

const legacyLinks = [
  ["/legacy-overview", "Legacy Overview", DashboardRounded],
  ["/signals", "Legacy Signals", ShowChartRounded],
  ["/risk", "Legacy Risk", ShieldRounded],
  ["/ai", "Legacy AI Review", PsychologyRounded],
  ["/backtest", "Pack 10 Backtest", AssessmentRounded],
  ["/settings", "Legacy Settings", SettingsRounded],
] as const;

function NavGroup({ title, links, onNavigate }: { title: string; links: readonly LinkRow[]; onNavigate?: () => void }) {
  return (
    <Box sx={{ mt: 1.2 }}>
      <Typography variant="caption" color="text.disabled" sx={{ px: 1.5, letterSpacing: ".12em", fontWeight: 800 }}>
        {title}
      </Typography>
      <List dense sx={{ pt: .4 }}>
        {links.map(([href, label, Icon]) => (
          <ListItemButton
            key={href}
            component={NavLink}
            to={href}
            end={href === "/"}
            onClick={onNavigate}
            sx={{
              my: .35,
              borderRadius: 2,
              color: "text.secondary",
              "&.active": {
                color: "text.primary",
                backgroundColor: "rgba(233,185,73,.09)",
                border: "1px solid rgba(233,185,73,.14)",
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 38, color: "inherit" }}><Icon fontSize="small" /></ListItemIcon>
            <ListItemText primary={label} primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", p: 2, overflowY: "auto" }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: 1, py: 1.5 }}>
        <Box className="brand-mark">AU</Box>
        <Box>
          <Typography variant="caption" color="primary" sx={{ letterSpacing: ".18em" }}>XAUUSD</Typography>
          <Typography variant="subtitle2" fontWeight={800}>AI MASTER</Typography>
        </Box>
      </Stack>

      <NavGroup title="DASHBOARD" links={dashboardLinks} onNavigate={onNavigate} />
      <NavGroup title="TRADING" links={tradingLinks} onNavigate={onNavigate} />
      <NavGroup title="RESEARCH" links={researchLinks} onNavigate={onNavigate} />
      <NavGroup title="PERFORMANCE" links={performanceLinks} onNavigate={onNavigate} />
      <NavGroup title="RISK" links={riskLinks} onNavigate={onNavigate} />
      <NavGroup title="SYSTEM" links={systemLinks} onNavigate={onNavigate} />
      <NavGroup title="LEGACY" links={legacyLinks} onNavigate={onNavigate} />

      <Box sx={{ mt: 2, p: 2, borderRadius: 3, border: "1px solid rgba(148,163,184,.12)", bgcolor: "rgba(255,255,255,.02)" }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <LockRounded fontSize="small" color="primary" />
          <Typography variant="caption" fontWeight={800}>LIVE LOCKED</Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, lineHeight: 1.5 }}>
          Phase 7B chỉ giao dịch DEMO allow-list. Phase 7C/7D/7E Control, Backtest, Supertrend, Daily P/L, Management, Scale và Auto Lot là research/read-only, không tự thay đổi execution.
        </Typography>
      </Box>
    </Box>
  );
}

export function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const isControlCenter = location.pathname === "/";
  const isPhase7B = location.pathname.startsWith("/phase7b-demo");
  const isPatternCheck = location.pathname.startsWith("/phase7b-pattern-check");
  const isPhase7BOps = location.pathname.startsWith("/phase7b-ops");
  const isPhase7CBacktest = location.pathname.startsWith("/phase7c-backtest");
  const isPhase7DDailyPnl = location.pathname.startsWith("/phase7d-daily-pnl");
  const isPhase7DManagement = location.pathname.startsWith("/phase7d-management");
  const isPhase7DDailyScale = location.pathname.startsWith("/phase7d-daily-scale");
  const isPhase7ESupertrend = location.pathname.startsWith("/phase7e-supertrend");
  const isPhase7CAutoLot = location.pathname.startsWith("/phase7c-auto-lot");
  const isPhase7CRisk = location.pathname.startsWith("/phase7c-risk");
  const isPerformance = location.pathname.startsWith("/performance");
  const isSystem = location.pathname.startsWith("/system");
  const isOperational = isControlCenter || isPhase7B || isPatternCheck || isPhase7BOps || isPhase7CBacktest || isPhase7DDailyPnl || isPhase7DManagement || isPhase7DDailyScale || isPhase7ESupertrend || isPhase7CAutoLot || isPhase7CRisk || isPerformance || isSystem;
  const dashboard = useDashboard(!isOperational);
  const mode = dashboard.data?.control.mode ?? "SHADOW";

  let headerTitle = "Research / Legacy Dashboard";
  let headerSubtitle = dashboard.isError
    ? "Legacy research API unavailable · Phase 7B DEMO is independent"
    : "Legacy research snapshot · polling 5s";
  let headerMode: string = mode;

  if (isControlCenter) {
    headerTitle = "Phase 7C Control Center";
    headerSubtitle = "DBGMarkets DEMO · Phase 7B operations · M15 readiness · read-only";
    headerMode = "DEMO ONLY";
  } else if (isPhase7B) {
    headerTitle = "Phase 7B DEMO Operations";
    headerSubtitle = "Forward execution monitor · MT5 DEMO · read-only web";
    headerMode = "DEMO ONLY";
  } else if (isPatternCheck) {
    headerTitle = "M15 Pattern Check";
    headerSubtitle = "Engulfing / Two-candle / MA diagnostics · tolerance-aware · read-only";
    headerMode = "DEMO ONLY";
  } else if (isPhase7BOps) {
    headerTitle = "Bot & Telegram";
    headerSubtitle = "Local Scheduled Task control · DEMO-only process launcher · no MT5 order route";
    headerMode = "DEMO ONLY";
  } else if (isPhase7CBacktest) {
    headerTitle = "Canonical Phase 7B Backtest";
    headerSubtitle = "Broker-native MT5 history · selectable date range · closed-bar replay";
    headerMode = "RESEARCH";
  } else if (isPhase7ESupertrend) {
    headerTitle = "Phase 7E Pattern + Dual Supertrend";
    headerSubtitle = "Engulfing / Two-candle + closed M5/M15 Supertrend alignment · MA entry filter removed";
    headerMode = "RESEARCH";
  } else if (isPhase7DDailyPnl) {
    headerTitle = "Phase 7D Daily P/L Optimizer";
    headerSubtitle = "Baseline vs Recovery vs Positive Lock combinations · research only";
    headerMode = "RESEARCH";
  } else if (isPhase7DManagement) {
    headerTitle = "Phase 7D BE + Partial Optimizer";
    headerSubtitle = "+6 BE vs +10 BE · one-third vs theoretical half · exact per-variant contention";
    headerMode = "RESEARCH";
  } else if (isPhase7DDailyScale) {
    headerTitle = "Phase 7D Daily 10/20 Scale Optimizer";
    headerSubtitle = "Negative-day Recovery 6–10 · Positive Lock · +10/+20 thirds · final runner";
    headerMode = "RESEARCH";
  } else if (isPhase7CAutoLot) {
    headerTitle = "Auto Lot SHADOW vs Fixed";
    headerSubtitle = "Risk-based sizing overlay · exact one-third management compatibility · no execution mutation";
    headerMode = "SHADOW";
  } else if (isPhase7CRisk) {
    headerTitle = "Risk & Auto Lot SHADOW";
    headerSubtitle = "Broker-native XAUUSD sizing · no execution mutation";
    headerMode = "SHADOW";
  } else if (isPerformance) {
    headerTitle = "MT5 DEMO Performance";
    headerSubtitle = "System-owned forward results · read-only analytics";
    headerMode = "DEMO ONLY";
  } else if (isSystem) {
    headerTitle = "DEMO System Health";
    headerSubtitle = "MT5 / Bridge / Phase 7B operational telemetry";
    headerMode = "DEMO ONLY";
  }

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          display: { xs: "none", lg: "block" },
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            bgcolor: "#08111f",
            borderRightColor: "rgba(148,163,184,.12)",
          },
        }}
      >
        <Navigation />
      </Drawer>
      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{ display: { xs: "block", lg: "none" }, "& .MuiDrawer-paper": { width: drawerWidth, bgcolor: "#08111f" } }}
      >
        <Navigation onNavigate={() => setMobileOpen(false)} />
      </Drawer>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <AppBar position="sticky" elevation={0} sx={{ bgcolor: "rgba(6,11,20,.88)", backdropFilter: "blur(14px)", borderBottom: "1px solid rgba(148,163,184,.10)" }}>
          <Toolbar>
            <IconButton onClick={() => setMobileOpen(true)} sx={{ display: { lg: "none" }, mr: 1 }}><MenuRounded /></IconButton>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" fontWeight={800}>{headerTitle}</Typography>
              <Typography variant="caption" color="text.secondary">{headerSubtitle}</Typography>
            </Box>
            <StatusChip value={headerMode} />
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ p: { xs: 2, md: 3 }, maxWidth: 1700, mx: "auto" }}><Outlet /></Box>
      </Box>
    </Box>
  );
}
