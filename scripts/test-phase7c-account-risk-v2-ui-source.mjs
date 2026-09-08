import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const page = read("apps/web/src/pages/Phase7CAccountRiskPage.tsx");

function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}
function forbidText(source, needle, label) {
  if (source.includes(needle)) throw new Error(`${label}: forbidden ${needle}`);
}

requireText(page, "ACCOUNT & RISK V2", "page title");
requireText(page, "<Phase7COperatorStatusBar />", "operator status reused");
requireText(page, "AN TOÀN ĐỂ ĐỔI TÀI KHOẢN", "safe assessment");
requireText(page, "CHƯA THỂ ĐỔI TÀI KHOẢN", "blocked assessment");
requireText(page, "ĐỔI TÀI KHOẢN", "account switch action");
requireText(page, "accountSwitchOpen", "account switch progressive disclosure");
requireText(page, "CẤU HÌNH RỦI RO", "risk card");
requireText(page, "Chỉnh cấu hình", "risk editor action");
requireText(page, "riskEditorOpen", "risk editor progressive disclosure");
requireText(page, "Fixed TP: xem tại Trung tâm điều khiển", "fixed TP not duplicated");
requireText(page, "strategyOpen", "strategy details collapsed by default");
requireText(page, "advancedOpen", "advanced diagnostics collapsed by default");
requireText(page, "CHẨN ĐOÁN / NÂNG CAO", "advanced diagnostics title");
forbidText(page, "<Phase7BOpsPage />", "legacy full ops page removed from primary layout");

console.log("PHASE7C_ACCOUNT_RISK_V2_UI_SOURCE_TEST=PASS");
