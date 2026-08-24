import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}

function forbidText(source, needle, label) {
  if (source.includes(needle)) throw new Error(`${label}: forbidden legacy text ${needle}`);
}

const performance = read("apps/api/src/services/mt5-performance.service.ts");
requireText(performance, 'source: "MT5_ACCOUNT_READ_ONLY"', "performance source");
requireText(performance, 'accountMode: "DEMO" | "LIVE"', "performance account mode");
requireText(performance, "readOnly: true", "performance safety");
forbidText(performance, "MT5 performance analytics is DEMO-only.", "performance LIVE support");
forbidText(performance, "/v1/orders", "performance mutation boundary");
forbidText(performance, "order_send", "performance mutation boundary");

const telemetry = read("apps/api/src/services/mt5.service.ts");
requireText(telemetry, "MT5 LIVE/real connected", "LIVE telemetry message");
forbidText(telemetry, "Phase 7B DEMO must not execute on this account", "legacy REAL warning");

const semantic = read("apps/api/src/services/phase7c-ui-contract.service.ts");
for (const key of ["auto", "trendWait", "sidewayWait", "stopMove", "partial", "exit"]) {
  requireText(semantic, `${key}:`, `semantic reasons ${key}`);
}
requireText(semantic, "AUTO: regime", "AUTO selector reason");
requireText(semantic, "Trend: chưa xuất hiện một trong 3 mẫu nến M15 hợp lệ", "Trend wait reason");
requireText(semantic, "Sideway: chưa có xác nhận M5 hợp lệ", "Sideway wait reason");

const shell = read("apps/web/src/ui/DashboardLayout.tsx");
requireText(shell, "Vận hành {runtime}", "runtime-aware sidebar");
requireText(shell, "Web không có quyền đặt lệnh hoặc chuyển tài khoản", "web account switch boundary");
forbidText(shell, "Bảng điều khiển vận hành DEMO", "hard-coded dashboard mode");
forbidText(shell, "Chỉ tài khoản DEMO", "hard-coded dashboard mode");

const dashboard = read("apps/web/src/pages/Phase7BDemoPage.tsx");
requireText(dashboard, "AUTO / REGIME — LÝ DO CHỌN STRATEGY", "AUTO reason section");
requireText(dashboard, "TREND — LÝ DO CHƯA VÀO LỆNH", "Trend reason section");
requireText(dashboard, "SIDEWAY — LÝ DO CHƯA VÀO LỆNH", "Sideway reason section");
requireText(dashboard, "LÝ DO DỜI STOP LOSS", "stop move section");
requireText(dashboard, "LÝ DO CHỐT 1/3", "partial section");
requireText(dashboard, "LÝ DO ĐÓNG TOÀN BỘ", "exit section");
forbidText(dashboard, "DEMO ONLY", "hard-coded dashboard runtime");

const performancePage = read("apps/web/src/pages/PerformancePage.tsx");
requireText(performancePage, "MT5 {accountMode} · CHỈ ĐỌC", "performance runtime label");
requireText(performancePage, "Trang hiệu suất chỉ đọc lịch sử của tài khoản {accountMode} hiện tại", "performance read-only boundary");
forbidText(performancePage, "MT5 DEMO · CHỈ ĐỌC", "hard-coded performance mode");

console.log("PHASE7C_WEB_ACCOUNT_SEMANTIC_SOURCE_TEST=PASS");
