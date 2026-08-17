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
import InsightsRounded from "@mui/icons-material/InsightsRounded";
import DnsRounded from "@mui/icons-material/DnsRounded";
import MenuRounded from "@mui/icons-material/MenuRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import { StatusChip } from "./StatusChip";

const drawerWidth = 250;

type LinkRow = readonly [string, string, typeof SmartToyRounded];

const links: readonly LinkRow[] = [
  ["/", "Theo dõi giao dịch", SmartToyRounded],
  ["/phase7b-pattern-check", "Điều kiện vào lệnh", CandlestickChartRounded],
  ["/phase7b-ops", "Bot & Telegram", PowerSettingsNewRounded],
  ["/performance", "Hiệu suất", InsightsRounded],
  ["/system", "Trạng thái hệ thống", DnsRounded],
] as const;

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", p: 2 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: 1, py: 1.5 }}>
        <Box className="brand-mark">AU</Box>
        <Box>
          <Typography variant="caption" color="primary" sx={{ letterSpacing: ".18em" }}>XAUUSD</Typography>
          <Typography variant="subtitle2" fontWeight={900}>AI MASTER</Typography>
        </Box>
      </Stack>

      <Typography variant="caption" color="text.disabled" sx={{ px: 1.5, mt: 1.5, letterSpacing: ".12em", fontWeight: 800 }}>
        VẬN HÀNH DEMO
      </Typography>
      <List dense sx={{ pt: .7 }}>
        {links.map(([href, label, Icon]) => (
          <ListItemButton
            key={href}
            component={NavLink}
            to={href}
            end={href === "/"}
            onClick={onNavigate}
            sx={{
              my: .4,
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
            <ListItemText primary={label} primaryTypographyProps={{ fontSize: 14, fontWeight: 700 }} />
          </ListItemButton>
        ))}
      </List>

      <Box sx={{ mt: "auto", p: 2, borderRadius: 3, border: "1px solid rgba(148,163,184,.12)", bgcolor: "rgba(255,255,255,.02)" }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <LockRounded fontSize="small" color="primary" />
          <Typography variant="caption" fontWeight={900}>CHỈ TÀI KHOẢN DEMO</Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, lineHeight: 1.5 }}>
          Tài khoản thật luôn bị khóa. Entry: 3 mô hình nến + Supertrend M15 10/3 + Supertrend M5 10/3 + SL cấu trúc. MA20/50 chỉ tăng độ tin cậy. Sau +10 chốt 1/3, runner dời SL theo cấu trúc M15 và chỉ chốt khi M15 đóng phá MA50 ngược hướng. MA200 chỉ xác nhận bối cảnh khung lớn.
        </Typography>
      </Box>
    </Box>
  );
}

export function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  let headerTitle = "Theo dõi giao dịch DEMO";
  let headerSubtitle = "XAUUSD · MT5 DEMO · tín hiệu / vị thế / quản lý lệnh";
  if (location.pathname.startsWith("/phase7b-pattern-check")) {
    headerTitle = "Điều kiện vào lệnh";
    headerSubtitle = "3 mô hình nến → Supertrend M15 10/3 → Supertrend M5 10/3 → SL cấu trúc · MA20/50 = độ tin cậy · runner: cấu trúc M15 + MA50 · MA200 = khung lớn";
  } else if (location.pathname.startsWith("/phase7b-ops")) {
    headerTitle = "Điều khiển Bot & Telegram";
    headerSubtitle = "Bật / dừng Bot DEMO · bật / tắt / kiểm tra thông báo Telegram";
  } else if (location.pathname.startsWith("/performance")) {
    headerTitle = "Hiệu suất giao dịch DEMO";
    headerSubtitle = "Kết quả giao dịch XAUUSD do hệ thống thực hiện";
  } else if (location.pathname.startsWith("/system")) {
    headerTitle = "Trạng thái hệ thống";
    headerSubtitle = "MT5 · Bridge · API · tiến trình DEMO";
  }

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Drawer
        variant="permanent"
        sx={{ width: drawerWidth, display: { xs: "none", lg: "block" }, "& .MuiDrawer-paper": { width: drawerWidth, bgcolor: "#08111f", borderRightColor: "rgba(148,163,184,.12)" } }}
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
              <Typography variant="subtitle2" fontWeight={900}>{headerTitle}</Typography>
              <Typography variant="caption" color="text.secondary">{headerSubtitle}</Typography>
            </Box>
            <StatusChip value="CHỈ DEMO" />
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ p: { xs: 2, md: 3 }, maxWidth: 1500, mx: "auto" }}><Outlet /></Box>
      </Box>
    </Box>
  );
}
