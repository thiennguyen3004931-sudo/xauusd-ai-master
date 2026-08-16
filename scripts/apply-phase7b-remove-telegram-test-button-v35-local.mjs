import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const pagePath = path.join(root, "apps", "web", "src", "pages", "Phase7BOpsPage.tsx");

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing file: ${file}`);
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function write(file, text) {
  fs.writeFileSync(file, text.replace(/\r?\n/g, "\r\n"), "utf8");
}

function removeExact(text, block, label) {
  if (!text.includes(block)) return text;
  return text.replace(block, "");
}

let page = read(pagePath);

// Keep the backend diagnostic endpoint available, but remove the redundant
// regular Telegram test control from the operator UI. Recovery preview stays.
page = removeExact(
  page,
  [
    "async function sendTelegramTest(): Promise<ActionResponse> {",
    "  return readJson<ActionResponse>(await fetch(`${API_BASE}/api/v1/phase7b-telegram-test`, {",
    '    method: "POST",',
    '    headers: { "content-type": "application/json" },',
    '    body: "{}",',
    "  }));",
    "}",
    "",
  ].join("\n"),
  "sendTelegramTest function",
);

page = removeExact(
  page,
  "  const testTelegram = useMutation({ mutationFn: sendTelegramTest });\n",
  "testTelegram mutation",
);

const regularButton = [
  "                <Button",
  '                  variant="outlined"',
  '                  color="primary"',
  "                  startIcon={<SendRounded />}",
  "                  disabled={testTelegram.isPending || recoveryTelegramTest.isPending || !o.controlEnabled}",
  "                  onClick={() => testTelegram.mutate()}",
  "                  sx={{ fontWeight: 900, minWidth: 210 }}",
  "                >",
  '                  {testTelegram.isPending ? "ĐANG GỬI TIN TEST..." : "GỬI TIN TEST TELEGRAM"}',
  "                </Button>",
].join("\n");
page = removeExact(page, regularButton + "\n", "regular Telegram test button");

// If V34 was applied after a slightly different base, handle the old disabled form too.
const regularButtonOld = regularButton.replace(
  "disabled={testTelegram.isPending || recoveryTelegramTest.isPending || !o.controlEnabled}",
  "disabled={testTelegram.isPending || !o.controlEnabled}",
);
page = removeExact(page, regularButtonOld + "\n", "regular Telegram test button old form");

page = page.replace(
  "disabled={recoveryTelegramTest.isPending || testTelegram.isPending || !o.controlEnabled}",
  "disabled={recoveryTelegramTest.isPending || !o.controlEnabled}",
);

page = page.replace(
  "Tin test và mẫu hồi phục đều là one-shot. Mẫu hồi phục chỉ gửi PREVIEW, không đặt/sửa/đóng lệnh MT5 và không ghi journal giao dịch.",
  "Mẫu hồi phục là one-shot, chỉ gửi PREVIEW; không đặt/sửa/đóng lệnh MT5 và không ghi journal giao dịch.",
);

const regularAlerts = [
  '      {testTelegram.isSuccess && <Alert severity="success">{testTelegram.data.message}</Alert>}',
  "      {testTelegram.isError && (",
  '        <Alert severity="error" sx={{ whiteSpace: "pre-wrap" }}>',
  '          {testTelegram.error instanceof Error ? testTelegram.error.message : "Không gửi được tin test Telegram."}',
  "        </Alert>",
  "      )}",
].join("\n");
page = removeExact(page, regularAlerts + "\n", "regular Telegram result alerts");

if (page.includes("testTelegram")) {
  throw new Error("V35 safety check failed: testTelegram UI references still remain.");
}
if (page.includes("GỬI TIN TEST TELEGRAM")) {
  throw new Error("V35 safety check failed: regular Telegram test button still remains.");
}
if (!page.includes("GỬI MẪU HỒI PHỤC NGÀY")) {
  throw new Error("V35 safety check failed: recovery preview button is missing. Run V34 first.");
}

write(pagePath, page);

const comspec = process.env.ComSpec || "cmd.exe";
const build = spawnSync(
  comspec,
  ["/d", "/s", "/c", 'pnpm --filter "@xauusd/web" build'],
  {
    cwd: root,
    stdio: "inherit",
    shell: false,
  },
);
if (build.error) throw build.error;
if (build.status !== 0) throw new Error(`Web build failed: ${build.status}`);

console.log("PHASE7B_V35_TELEGRAM_TEST_BUTTON=REMOVED");
console.log("PHASE7B_V35_TELEGRAM_RECOVERY_PREVIEW_BUTTON=PRESERVED");
console.log("PHASE7B_V35_TELEGRAM_BACKEND_TEST_ENDPOINT=PRESERVED_FOR_DIAGNOSTICS");
console.log("PHASE7B_V35_BOT_RESTARTED=false");
console.log("PHASE7B_V35_TELEGRAM_RESTARTED=false");
console.log("PHASE7B_V35_MT5_MUTATION=false");
console.log("PHASE7B_V35=PASS");
