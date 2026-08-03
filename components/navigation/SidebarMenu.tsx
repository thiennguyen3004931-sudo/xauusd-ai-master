import {
  LayoutDashboard,
  TrendingUp,
  BarChart3,
  Bot,
  Newspaper,
  BookOpen,
  Settings,
} from "lucide-react";

export const menuItems = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    href: "/",
  },
  {
    title: "Trading",
    icon: TrendingUp,
    href: "/trading",
  },
  {
    title: "Market",
    icon: BarChart3,
    href: "/market",
  },
  {
    title: "AI Signals",
    icon: Bot,
    href: "/signals",
  },
  {
    title: "News",
    icon: Newspaper,
    href: "/news",
  },
  {
    title: "Journal",
    icon: BookOpen,
    href: "/journal",
  },
  {
    title: "Settings",
    icon: Settings,
    href: "/settings",
  },
];