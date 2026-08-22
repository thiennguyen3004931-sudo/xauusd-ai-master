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
import SmartToyRounded from "@mui/icons-material/SmartToyRounded";
import CandlestickChartRounded from "@mui/icons-material/CandlestickChartRounded";
import PowerSettingsNewRounded from "@mui/icons-material/PowerSettingsNewRounded";
import TuneRounded from "@mui/icons-material/TuneRounded";
import InsightsRounded from "@mui/icons-material/InsightsRounded";
import MenuRounded from "@mui/icons-material/MenuRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import { StatusChip } from "./StatusChip";

const drawerWidth = 250;

type LinkRow = readonly [string, string, typeof SmartToyRounded];

const links: readonly LinkRow[] = [
  ["/", "Dashboard", SmartToyRounded],
  ["/phase7b-pattern-check", "Tín hiệu", CandlestickChartRounded],
  ["/phase7b-ops", "Tài khoản & Risk", PowerSettingsNewRounded],
  ["/phase7c-control-center", "Control Center", TuneRounded],
  ["/performance", "Hiệu suất", InsightsRounded],
] as const;

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Box
      sx={{ height: "100%", display: "flex", flexDirection: "column", p: 2 }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        sx={{ px: 1, py: 1.5 }}
      >
        <Box className="brand-mark">AU</Box>
        <Box>
          <Typography
            variant="caption"
            color="primary"
            sx={{ letterSpacing: ".18em" }}
          >
            XAUUSD
          </Typography>
          <Typography variant="subtitle2" fontWeight={900}>
            AI MASTER
          </Typography>
        </Box>
      </Stack>

      <Typography
        variant="caption"
        color="text.disabled"
        sx={{ px: 1.5, mt: 1.5, letterSpacing: ".12em", fontWeight: 800 }}
      >
        VẬN HÀNH DEMO
      </Typography>
      <List dense sx={{ pt: 0.7 }}>
        {links.map(([href, label, Icon]) => (
          <ListItemButton
            key={href}
            component={NavLink}
            to={href}
            end={href === "/"}
            onClick={onNavigate}
            sx={{
              my: 0.4,
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
              primaryTypographyProps={{ fontSize: 14, fontWeight: 700 }}
            />
          </ListItemButton>
        ))}
      </List>

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
          <Typography variant="caption" fontWeight={900}>
            CHỈ TÀI KHOẢN DEMO
          </Typography>
        </Stack>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 1, lineHeight: 1.5 }}
        >
          Tài khoản thật luôn bị khóa. Panel MT5 chỉ đọc, không có quyền gửi lệnh.
          Lot/Risk chỉ áp dụng cho lệnh mới trong môi trường demo.
        </Typography>
      </Box>
    </Box>
  );
}

export function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  let headerTitle = "Dashboard vận hành DEMO";
  let headerSubtitle = "XAUUSD · AUTO/PAUSE · Regime · tài khoản · risk · hệ thống";
  if (location.pathname.startsWith("/phase7b-pattern-check")) {
    headerTitle = "Tín hiệu & quyết định";
    headerSubtitle = "Regime, stage, lý do chờ/vào lệnh và điều kiện entry M15";
  } else if (location.pathname.startsWith("/phase7b-ops")) {
    headerTitle = "Tài khoản & Risk";
    headerSubtitle = "Thông tin tài khoản giao dịch, lot/risk, safety và runtime";
  } else if (location.pathname.startsWith("/phase7c-control-center")) {
    headerTitle = "Control Center";
    headerSubtitle = "MT5 · Bot · Telegram · quyết định giao dịch và Risk/Lot đồng bộ";
  } else if (location.pathname.startsWith("/performance")) {
    headerTitle = "Hiệu suất";
    headerSubtitle = "Kết quả giao dịch XAUUSD do hệ thống thực hiện";
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
              <Typography variant="subtitle2" fontWeight={900}>
                {headerTitle}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {headerSubtitle}
              </Typography>
            </Box>
            <StatusChip value="CHỈ DEMO" />
          </Toolbar>
        </AppBar>
        <Box
          component="main"
          sx={{ p: { xs: 2, md: 3 }, maxWidth: 1500, mx: "auto" }}
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
