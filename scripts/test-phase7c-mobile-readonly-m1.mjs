import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const pagePath = "apps/web/src/pages/Phase7CMobileReadOnlyPage.tsx";
const routerPath = "apps/web/src/router.tsx";
const layoutPath = "apps/web/src/ui/DashboardLayout.tsx";

assert.ok(
  existsSync(pagePath),
  "M1 RED: dedicated Phase7C mobile read-only page must exist.",
);

const page = readFileSync(pagePath, "utf8");
const router = readFileSync(routerPath, "utf8");
const layout = readFileSync(layoutPath, "utf8");

function requireText(source, text, message) {
  assert.ok(source.includes(text), message);
}

function forbidText(source, text, message) {
  assert.ok(!source.includes(text), message);
}

requireText(page, "MOBILE_REMOTE_ACCESS_M1", "Mobile page must identify the approved M1 baseline.");
requireText(page, "MOBILE READ ONLY", "Mobile page must make read-only scope explicit to the operator.");
requireText(page, "fetchPhase7CWebStatus", "Mobile page must reuse the canonical Phase7C semantic web-status reader.");
requireText(page, "Phase7COperatorStatusBar", "Mobile page must reuse the canonical operator status strip.");
requireText(page, "getTradeUiState", "Mobile page must use the canonical semantic UI-state derivation.");
requireText(page, "ui?.position", "Mobile page must display persisted canonical position data when managing.");
requireText(page, "ui?.setup", "Mobile page must display persisted canonical setup data when approved.");
requireText(page, "BOT ĐANG LÀM GÌ?", "Mobile page must lead with the current bot action/state.");
requireText(page, "LÝ DO HIỆN TẠI", "Mobile page must expose the current human-readable reason.");
requireText(page, "VỊ THẾ / KẾ HOẠCH", "Mobile page must expose the real position/setup summary.");
requireText(page, "xs:", "Mobile page must include explicit xs responsive behavior.");

forbidText(page, 'method: "POST"', "M1 mobile page must not POST.");
forbidText(page, "method: 'POST'", "M1 mobile page must not POST.");
forbidText(page, 'method: "PUT"', "M1 mobile page must not PUT.");
forbidText(page, 'method: "PATCH"', "M1 mobile page must not PATCH.");
forbidText(page, 'method: "DELETE"', "M1 mobile page must not DELETE.");
forbidText(page, "setPhase7CBotMode", "M1 mobile page must not mutate bot mode.");
forbidText(page, "armPhase7C", "M1 mobile page must not ARM LIVE.");
forbidText(page, "disarmPhase7C", "M1 mobile page must not DISARM.");

requireText(router, "Phase7CMobileReadOnlyPage", "Router must lazy-load the mobile read-only page.");
requireText(router, 'path: "phase7c-mobile"', "Router must expose /phase7c-mobile.");
requireText(layout, '["/phase7c-mobile", "Điện thoại"', "Navigation must expose the dedicated mobile page.");
requireText(layout, 'location.pathname.startsWith("/phase7c-mobile")', "Mobile route must have its own operator header.");

console.log("PHASE7C_MOBILE_READONLY_M1_CONTRACT=PASS");
