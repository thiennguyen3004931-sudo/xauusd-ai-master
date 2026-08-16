import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const pagePath = path.join(root, "apps", "web", "src", "pages", "Phase7BOpsPage.tsx");

if (!fs.existsSync(pagePath)) throw new Error(`Missing file: ${pagePath}`);

const original = fs.readFileSync(pagePath, "utf8").replace(/\r\n/g, "\n");
const lines = original.split("\n");
const out = [];
let removedNormal = false;
let removedRecovery = false;

for (let i = 0; i < lines.length; i += 1) {
  if (lines[i].includes("<Button")) {
    const block = [lines[i]];
    let j = i + 1;
    while (j < lines.length) {
      block.push(lines[j]);
      if (lines[j].includes("</Button>")) break;
      j += 1;
    }
    const text = block.join("\n");
    if (text.includes("GỬI TIN TEST TELEGRAM")) {
      removedNormal = true;
      i = j;
      continue;
    }
    if (text.includes("GỬI MẪU HỒI PHỤC NGÀY")) {
      removedRecovery = true;
      i = j;
      continue;
    }
    out.push(...block);
    i = j;
    continue;
  }

  if (
    lines[i].includes("Tin test là one-shot:") ||
    lines[i].includes("Tin test và mẫu hồi phục đều là one-shot.")
  ) {
    out.push("                Telegram notifier vẫn hoạt động bình thường; các nút gửi tin thử đã được ẩn khỏi giao diện.");
    continue;
  }

  out.push(lines[i]);
}

const updated = out.join("\n");
if (updated.includes("GỬI TIN TEST TELEGRAM")) throw new Error("Normal Telegram test button still present.");
if (updated.includes("GỬI MẪU HỒI PHỤC NGÀY")) throw new Error("Recovery Telegram test button still present.");

fs.writeFileSync(pagePath, updated.replace(/\n/g, "\r\n"), "utf8");

console.log(`PHASE7B_V36_NORMAL_TEST_BUTTON_REMOVED=${removedNormal || !original.includes("GỬI TIN TEST TELEGRAM")}`);
console.log(`PHASE7B_V36_RECOVERY_TEST_BUTTON_REMOVED=${removedRecovery || !original.includes("GỬI MẪU HỒI PHỤC NGÀY")}`);
console.log("PHASE7B_V36_TELEGRAM_NOTIFIER_PRESERVED=true");
console.log("PHASE7B_V36_BACKEND_TEST_ENDPOINTS_PRESERVED=true");
console.log("PHASE7B_V36_BOT_RESTARTED=false");
console.log("PHASE7B_V36_TELEGRAM_RESTARTED=false");
console.log("PHASE7B_V36_MT5_MUTATION=false");
console.log("PHASE7B_V36=PASS");
