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
import DnsRounded from "@mui/icons-material/DnsRounded";
import SettingsRounded from "@mui/icons-material/SettingsRounded";
import MenuRounded from "@mui/icons-material/MenuRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import { useDashboard } from "../hooks";
import { StatusChip } from "./StatusChip";

const drawerWidth = 250;

const operationsLinks = [
  ["/phase7b-demo", "Phase 7B Demo", SmartToyRounded],
  ["/phase7b-pattern-check", "M15 Pattern Check", CandlestickChartRounded],
  ["/performance", "MT5 Performance", InsightsRounded],
  ["/system", "Hệ thống", DnsRounded],
] as const;

const researchLinks = [
  ["/", "Tổng quan", DashboardRounded],
  ["/signals", "Tín hiệu", ShowChartRounded],
  ["/risk", "Rủi ro", ShieldRounded],
  ["/ai", "AI Review", PsychologyRounded],
  ["/backtest", "Backtest", AssessmentRounded],
] as const;

const configLinks = [
  ["/settings", "Cài đặt legacy", SettingsRounded],
] as const;

type LinkRow = readonly [string, string, typeof DashboardRounded];

function NavGroup({
  title,
  links,
  onNavigate,
}: {
  title: string;
  links: readonly LinkRow[];
  onNavigate?: () => void;
}) {
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography
        variant="caption"
        color="text.disabled"
        sx={{ px: 1.5, letterSpacing: ".12em", fontWeight: 800 }}
      >
        {title}
      </Typography>
      <List dense sx={{ pt: .5 }}>
        {links.map(([href, label, Icon]) => (
          <ListItemButton
            key={href}
            component={NavLink}
            to={href}
            end={href === "/"}
            onClick={onNavigate}
            sx={{
              my: .5,
              borderRadius: 2,
              color: "text.secondary",
              "&.active": {
                color: "text.primary",
                backgroundColor: "rgba(233,185,73,.09)",
                border: "1px solid rgba(233,185,73,.14)",
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 38, color: "inherit" }}>
              <Icon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={label}
              primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }}
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", p: 2 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: 1, py: 1.5 }}>
        <Box className="brand-mark">AU</Box>
        <Box>
          <Typography variant="caption" color="primary" sx={{ letterSpacing: ".18em" }}>
            XAUUSD
          </Typography>
          <Typography variant="subtitle2" fontWeight={800}>AI MASTER</Typography>
        </Box>
      </Stack>

      <NavGroup title="VẬN HÀNH DEMO" links={operationsLinks} onNavigate={onNavigate} />
      <NavGroup title="NGHIÊN CỨU / LEGACY" links={researchLinks} onNavigate={onNavigate} />
      <NavGroup title="CẤU HÌNH" links={configLinks} onNavigate={onNavigate} />

      <Box
        sx={{
          mt: "auto",
          p: 2,
          borderRadius: 3,
          border: "1px solid rgba(148,163,184,.12)",
          bgcolor: "rgba(255,255,255,.02)",
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <LockRounded fontSize="small" color="primary" />
          <Typography variant="caption" fontWeight={800}>LIVE LOCKED</Typography>
        </Stack>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 1, lineHeight: 1.5 }}
        >
          Phase 7B chỉ được phép giao dịch trên tài khoản DEMO đã allow-list.
          Web monitor không có route đặt, sửa hoặc đóng lệnh.
        </Typography>
      </Box>
    </Box>
  );
}

export function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const isPhase7B = location.pathname.startsWith("/phase7b-demo");
  const isPatternCheck = location.pathname.startsWith("/phase7b-pattern-check");
  const isPerformance = location.pathname.startsWith("/performance");
  const isSystem = location.pathname.startsWith("/system");
  const isOperational = isPhase7B || isPatternCheck || isPerformance || isSystem;
  const dashboard = useDashboard(!isOperational);
  const mode = dashboard.data?.control.mode ?? "SHADOW";

  let headerTitle = "Research / Legacy Dashboard";
  let headerSubtitle = dashboard.isError
    ? "Legacy research API unavailable · Phase 7B DEMO is independent"
    : "Canonical research snapshot · polling 5s";
  let headerMode: string = mode;

  if (isPhase7B) {
    headerTitle = "Phase 7B DEMO Operations";
    headerSubtitle = "Forward execution monitor · MT5 DEMO · read-only web";
    headerMode = "DEMO ONLY";
  } else if (isPatternCheck) {
    headerTitle = "M15 Pattern Check";
    headerSubtitle = "Engulfing / Two-candle / MA diagnostics · tolerance-aware · read-only";
    headerMode = "DEMO ONLY";
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
        sx={{
          display: { xs: "block", lg: "none" },
          "& .MuiDrawer-paper": { width: drawerWidth, bgcolor: "#08111f" },
        }}
      >
        <Navigation onNavigate={() => setMobileOpen(false)} />
      </Drawer>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            bgcolor: "rgba(6,11,20,.88)",
            backdropFilter: "blur(14px)",
            borderBottom: "1px solid rgba(148,163,184,.10)",
          }}
        >
          <Toolbar>
            <IconButton
              onClick={() => setMobileOpen(true)}
              sx={{ display: { lg: "none" }, mr: 1 }}
            >
              <MenuRounded />
            </IconButton>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" fontWeight={800}>{headerTitle}</Typography>
              <Typography variant="caption" color="text.secondary">
                {headerSubtitle}
              </Typography>
            </Box>
            <StatusChip value={headerMode} />
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ p: { xs: 2, md: 3 }, maxWidth: 1700, mx: "auto" }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
