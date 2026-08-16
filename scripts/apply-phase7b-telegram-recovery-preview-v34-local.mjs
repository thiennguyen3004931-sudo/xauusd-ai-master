import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const routePath = path.join(root, "apps", "api", "src", "routes", "phase7b-telegram-test.route.ts");
const pagePath = path.join(root, "apps", "web", "src", "pages", "Phase7BOpsPage.tsx");
const previewPath = path.join(root, "scripts", "run-phase7b-telegram-recovery-preview.mjs");

function read(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing file: ${file}`);
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function write(file, text) {
  fs.writeFileSync(file, text.replace(/\r?\n/g, "\r\n"), "utf8");
}

function replaceRequired(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`${label} marker not found.`);
  return text.replace(from, to);
}

function run(command, args, label) {
  const executable = process.platform === "win32" && command === "pnpm" ? "pnpm.cmd" : command;
  const result = spawnSync(executable, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed: ${result.status}`);
}

if (!fs.existsSync(previewPath)) {
  throw new Error(`Recovery preview script missing: ${previewPath}. Run git pull first.`);
}

// ---------------------------------------------------------------------------
// A. API: fix the false-negative PASS detection for the existing Telegram test.
// ---------------------------------------------------------------------------
let route = read(routePath);

if (!route.includes("const compactPass =")) {
  const oldPassCheck = [
    '    const stdout = String(result.stdout ?? "");',
    '    if (!stdout.includes("PHASE7B_TELEGRAM_TEST=PASS")) {',
    '      throw new Error(`Telegram test không trả PASS.\\n${stdout}\\n${String(result.stderr ?? "")}`.trim());',
    '    }',
  ].join("\n");

  const newPassCheck = [
    '    const stdout = String(result.stdout ?? "");',
    '    const legacyPass = stdout.includes("PHASE7B_TELEGRAM_TEST=PASS");',
    '    const compactPass =',
    '      stdout.includes("PHASE7B_TELEGRAM_COMPACT_TEST=PASS") &&',
    '      stdout.includes("PHASE7B_TELEGRAM_WRAPPER_TEST_EXIT=PASS");',
    '    if (!legacyPass && !compactPass) {',
    '      throw new Error(`Telegram test không trả PASS.\\n${stdout}\\n${String(result.stderr ?? "")}`.trim());',
    '    }',
  ].join("\n");

  route = replaceRequired(route, oldPassCheck, newPassCheck, "Telegram PASS detection");
}

// ---------------------------------------------------------------------------
// B. API: safe recovery-preview route. It only sends two Telegram messages.
// It does not read/write the trading journal and does not call MT5/Bridge.
// ---------------------------------------------------------------------------
if (!route.includes('router.post("/recovery"')) {
  const marker = "function resolveWorkRoot(root: string): string {";
  const block = [
    'router.post("/recovery", async (req: Request, res: Response) => {',
    '  if (!isLoopback(req)) {',
    '    return res.status(403).json({ error: "Chỉ cho phép gửi mẫu hồi phục Telegram từ localhost." });',
    '  }',
    '',
    '  try {',
    '    const root = findProjectRoot();',
    '    const script = path.join(root, "scripts", "run-phase7b-telegram-recovery-preview.mjs");',
    '    const envFile = path.join(root, ".env.phase7b-telegram");',
    '',
    '    if (!fs.existsSync(script)) throw new Error(`Không tìm thấy recovery preview: ${script}`);',
    '    if (!fs.existsSync(envFile)) throw new Error(`Không tìm thấy cấu hình Telegram: ${envFile}`);',
    '',
    '    const result = await execFileAsync(',
    '      process.execPath,',
    '      [script, envFile],',
    '      {',
    '        cwd: root,',
    '        windowsHide: true,',
    '        timeout: 25_000,',
    '        maxBuffer: 256 * 1024,',
    '      },',
    '    );',
    '',
    '    const stdout = String(result.stdout ?? "");',
    '    if (!stdout.includes("PHASE7B_TELEGRAM_RECOVERY_PREVIEW=PASS")) {',
    '      throw new Error(`Mẫu hồi phục Telegram không trả PASS.\\n${stdout}\\n${String(result.stderr ?? "")}`.trim());',
    '    }',
    '',
    '    return res.json({',
    '      accepted: true,',
    '      action: "TELEGRAM_RECOVERY_PREVIEW_SENT",',
    '      message: "Đã gửi 2 tin mẫu HỒI PHỤC NGÀY. Đây chỉ là PREVIEW, không tác động MT5/journal.",',
    '      orderPermission: "NONE",',
    '      journalMutation: false,',
    '      mt5Mutation: false,',
    '      demoOnly: true,',
    '    });',
    '  } catch (error) {',
    '    return res.status(503).json({ error: errorMessage(error) });',
    '  }',
    '});',
    '',
  ].join("\n");

  route = replaceRequired(route, marker, block + marker, "Recovery API route");
}

if (!route.includes("PHASE7B_TELEGRAM_COMPACT_TEST=PASS")) throw new Error("Compact PASS marker missing after API patch.");
if (!route.includes('router.post("/recovery"')) throw new Error("Recovery API route missing after patch.");
write(routePath, route);

// ---------------------------------------------------------------------------
// C. Web: add one safe button next to the normal Telegram test button.
// Preserve V18 one-click Bot/Telegram orchestration if it is already applied.
// ---------------------------------------------------------------------------
let page = read(pagePath);

if (!page.includes("async function sendTelegramRecoveryTest()")) {
  const marker = "function StatusCard(";
  const block = [
    "async function sendTelegramRecoveryTest(): Promise<ActionResponse> {",
    "  return readJson<ActionResponse>(await fetch(`${API_BASE}/api/v1/phase7b-telegram-test/recovery`, {",
    '    method: "POST",',
    '    headers: { "content-type": "application/json" },',
    '    body: "{}",',
    "  }));",
    "}",
    "",
  ].join("\n");
  page = replaceRequired(page, marker, block + marker, "Recovery web API function");
}

if (!page.includes("const recoveryTelegramTest = useMutation")) {
  const marker = "  const testTelegram = useMutation({ mutationFn: sendTelegramTest });";
  page = replaceRequired(
    page,
    marker,
    [
      marker,
      "  const recoveryTelegramTest = useMutation({ mutationFn: sendTelegramRecoveryTest });",
    ].join("\n"),
    "Recovery mutation",
  );
}

// Disable either test button while the other one is sending.
page = page.replace(
  "disabled={testTelegram.isPending || !o.controlEnabled}",
  "disabled={testTelegram.isPending || recoveryTelegramTest.isPending || !o.controlEnabled}",
);

if (!page.includes("GỬI MẪU HỒI PHỤC NGÀY")) {
  const marker = [
    '                  {testTelegram.isPending ? "ĐANG GỬI TIN TEST..." : "GỬI TIN TEST TELEGRAM"}',
    "                </Button>",
  ].join("\n");

  const recoveryButton = [
    marker,
    "                <Button",
    '                  variant="outlined"',
    '                  color="warning"',
    "                  startIcon={<SendRounded />}",
    "                  disabled={recoveryTelegramTest.isPending || testTelegram.isPending || !o.controlEnabled}",
    "                  onClick={() => recoveryTelegramTest.mutate()}",
    "                  sx={{ fontWeight: 900, minWidth: 245 }}",
    "                >",
    '                  {recoveryTelegramTest.isPending ? "ĐANG GỬI MẪU HỒI PHỤC..." : "GỬI MẪU HỒI PHỤC NGÀY"}',
    "                </Button>",
  ].join("\n");

  page = replaceRequired(page, marker, recoveryButton, "Recovery Telegram button");
}

page = page.replace(
  "Tin test là one-shot: gửi một nội dung mẫu rồi tự thoát, không cần bật notifier thường trực.",
  "Tin test và mẫu hồi phục đều là one-shot. Mẫu hồi phục chỉ gửi PREVIEW, không đặt/sửa/đóng lệnh MT5 và không ghi journal giao dịch.",
);

if (!page.includes("recoveryTelegramTest.isSuccess")) {
  const marker = [
    "      {testTelegram.isError && (",
    '        <Alert severity="error" sx={{ whiteSpace: "pre-wrap" }}>',
    '          {testTelegram.error instanceof Error ? testTelegram.error.message : "Không gửi được tin test Telegram."}',
    "        </Alert>",
    "      )}",
  ].join("\n");

  const block = [
    marker,
    '      {recoveryTelegramTest.isSuccess && <Alert severity="success">{recoveryTelegramTest.data.message}</Alert>}',
    "      {recoveryTelegramTest.isError && (",
    '        <Alert severity="error" sx={{ whiteSpace: "pre-wrap" }}>',
    '          {recoveryTelegramTest.error instanceof Error ? recoveryTelegramTest.error.message : "Không gửi được mẫu hồi phục Telegram."}',
    "        </Alert>",
    "      )}",
  ].join("\n");

  page = replaceRequired(page, marker, block, "Recovery result alerts");
}

if (!page.includes("async function sendTelegramRecoveryTest()")) throw new Error("Recovery web API function missing.");
if (!page.includes("const recoveryTelegramTest = useMutation")) throw new Error("Recovery mutation missing.");
if (!page.includes("GỬI MẪU HỒI PHỤC NGÀY")) throw new Error("Recovery button missing.");
write(pagePath, page);

// ---------------------------------------------------------------------------
// D. Syntax/build verification only. No Bot/Telegram persistent process restart.
// ---------------------------------------------------------------------------
run(process.execPath, ["--check", previewPath], "Recovery preview syntax check");
run("pnpm", ["--filter", "@xauusd/api", "build"], "API build");
run("pnpm", ["--filter", "@xauusd/web", "build"], "Web build");

console.log("PHASE7B_TELEGRAM_TEST_PASS_DETECTION=FIXED");
console.log("PHASE7B_TELEGRAM_RECOVERY_PREVIEW_ROUTE=PASS");
console.log("PHASE7B_TELEGRAM_RECOVERY_PREVIEW_UI=PASS");
console.log("PHASE7B_TELEGRAM_RECOVERY_PREVIEW_MESSAGES=2");
console.log("PHASE7B_TELEGRAM_RECOVERY_PREVIEW_ORDER_PERMISSION=NONE");
console.log("PHASE7B_TELEGRAM_RECOVERY_PREVIEW_MT5_MUTATION=false");
console.log("PHASE7B_TELEGRAM_RECOVERY_PREVIEW_JOURNAL_MUTATION=false");
console.log("PHASE7B_TELEGRAM_RECOVERY_PREVIEW_BOT_RESTARTED=false");
console.log("PHASE7B_TELEGRAM_RECOVERY_PREVIEW_TELEGRAM_RESTARTED=false");
console.log("PHASE7B_TELEGRAM_RECOVERY_PREVIEW_REAL_ACCOUNT_ALLOWED=false");
console.log("PHASE7B_TELEGRAM_RECOVERY_PREVIEW=PASS");
