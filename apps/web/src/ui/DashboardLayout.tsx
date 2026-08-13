import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
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
import DnsRounded from "@mui/icons-material/DnsRounded";
import SettingsRounded from "@mui/icons-material/SettingsRounded";
import MenuRounded from "@mui/icons-material/MenuRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import { useDashboard } from "../hooks";
import { StatusChip } from "./StatusChip";

const drawerWidth = 250;
const links = [
  ["/", "Tổng quan", DashboardRounded],
  ["/signals", "Tín hiệu", ShowChartRounded],
  ["/risk", "Rủi ro", ShieldRounded],
  ["/ai", "AI Review", PsychologyRounded],
  ["/backtest", "Backtest", AssessmentRounded],
  ["/performance", "MT5 Performance", InsightsRounded],
  ["/phase7b-demo", "Phase 7B Demo", SmartToyRounded],
  ["/system", "Hệ thống", DnsRounded],
  ["/settings", "Cài đặt", SettingsRounded],
] as const;

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
      <List sx={{ mt: 2 }}>
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
            <ListItemIcon sx={{ minWidth: 38, color: "inherit" }}><Icon fontSize="small" /></ListItemIcon>
            <ListItemText primary={label} primaryTypographyProps={{ fontSize: 14, fontWeight: 600 }} />
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ mt: "auto", p: 2, borderRadius: 3, border: "1px solid rgba(148,163,184,.12)", bgcolor: "rgba(255,255,255,.02)" }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <LockRounded fontSize="small" color="primary" />
          <Typography variant="caption" fontWeight={800}>LIVE LOCKED</Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, lineHeight: 1.5 }}>
          Dashboard không có quyền mở giao dịch thật.
        </Typography>
      </Box>
    </Box>
  );
}

export function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const dashboard = useDashboard();
  const mode = dashboard.data?.control.mode ?? "SHADOW";

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          display: { xs: "none", lg: "block" },
          "& .MuiDrawer-paper": { width: drawerWidth, bgcolor: "#08111f", borderRightColor: "rgba(148,163,184,.12)" },
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
              <Typography variant="subtitle2" fontWeight={800}>Trading Operations</Typography>
              <Typography variant="caption" color="text.secondary">
                {dashboard.isError ? "API unavailable" : "Engine snapshot · polling 5s"}
              </Typography>
            </Box>
            <StatusChip value={mode} />
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ p: { xs: 2, md: 3 }, maxWidth: 1700, mx: "auto" }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
