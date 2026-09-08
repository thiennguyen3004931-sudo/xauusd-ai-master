import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const shell = read("apps/web/src/pages/Phase7CControlCenterShellPage.tsx");
const execution = read("apps/web/src/ui/Phase7CExecutionAuthorizationCard.tsx");
const control = read("apps/web/src/pages/Phase7CControlCenterPage.tsx");
const status = read("apps/web/src/ui/Phase7COperatorStatusBar.tsx");
const intelligence = read("apps/web/src/ui/Phase7CIntelligenceSummaryCard.tsx");

function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}
function forbidText(source, needle, label) {
  if (source.includes(needle)) throw new Error(`${label}: obsolete text/structure still present: ${needle}`);
}

// Shell: one operator status bar, critical controls in two columns, intelligence details removed from the operator page.
requireText(shell, "Phase7COperatorStatusBar", "operator status import");
requireText(shell, "<Phase7COperatorStatusBar />", "operator status render");
requireText(shell, "<Grid container spacing={2}>", "critical two-column grid");
requireText(shell, "<Phase7CExecutionAuthorizationCard />", "execution authorization preserved");
requireText(shell, "<Phase7CAccountSwitchCard />", "account switch preserved");
requireText(shell, "<Phase7CIntelligenceSummaryCard />", "intelligence compact summary render");
forbidText(shell, "Phase7CPerformanceIntelligenceCard", "detailed performance intelligence removed from shell");
forbidText(shell, "Phase7CPerformanceEffectivenessCard", "detailed effectiveness removed from shell");
forbidText(shell, "Phase7CCounterfactualIntelligenceCard", "detailed counterfactual removed from shell");
forbidText(shell, "Phase7CRecommendationIntelligenceCard", "detailed recommendation removed from shell");

// Operator bar: one glance status for account/runtime/trading/source.
requireText(status, 'label={`ACCOUNT ${accountMode}`}', "account status");
requireText(status, 'label={`BOT ${botMode}`}', "bot mode status");
requireText(status, 'label={armed ? "ARMED" : "DISARMED"}', "arm status");
requireText(status, 'label={`POSITIONS ${positions}`}', "position status");
requireText(status, 'label={`SOURCE ${sourceVerdict}`}', "runtime source status");
requireText(status, "accountLogin", "account login summary");

// Execution authorization: diagnostics collapsed by default.
requireText(execution, "const [showArmChecks, setShowArmChecks] = useState(false);", "ARM details collapsed by default");
requireText(execution, "showArmChecks &&", "ARM detail visibility gate");
requireText(execution, "Xem chi tiết", "execution detail expand action");
requireText(execution, "Ẩn chi tiết", "execution detail collapse action");
requireText(execution, "Lý do:", "execution first blocker summary");

// Control Center: remove permanent verbose policy copy from the primary operator surface.
forbidText(
  control,
  "BẬT BOT chỉ khởi động/khôi phục executors và luôn kết thúc ở PAUSE. AUTO không còn được bật từ lifecycle hay Telegram; chỉ nút BẬT AUTO trên Web mới có quyền kích hoạt AUTO sau khi toàn bộ cổng an toàn đạt.",
  "verbose lifecycle policy",
);
requireText(control, "Xem chính sách vận hành", "on-demand lifecycle policy action");
requireText(control, "Quyết định hiện tại · Web đồng bộ panel MT5", "decision monitor preserved");

// Intelligence on Control Center becomes summary-only with navigation to the dedicated performance page.
requireText(intelligence, "Intelligence & hiệu suất", "intelligence summary title");
requireText(intelligence, 'to="/performance"', "performance navigation");
requireText(intelligence, "Mở Hiệu suất", "performance action");

console.log("PHASE7C_CONTROL_CENTER_V2_COMPACT_UI_SOURCE_TEST=PASS");
