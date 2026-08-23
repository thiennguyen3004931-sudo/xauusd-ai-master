import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { phase7CBotModeService } from "./phase7c-bot-mode.service";
import { phase7CLotSettingsService } from "./phase7c-lot-settings.service";
import {
  accountModeAllowsBroker,
  getPhase7CAccountModeState,
} from "./phase7c-account-mode.service";
import { getMt5Telemetry, type Mt5TelemetrySnapshot } from "./mt5.service";

const execFileAsync = promisify(execFile);
const START_TIMEOUT_MS = 50_000;
const TELEGRAM_STALE_MS = 15_000;
const EXECUTOR_TASK = "XAUUSD-Phase7C-Executors";

type TelegramModeStatus = {
  ready?: boolean;
  status?: string;
  pid?: number | null;
  mode?: string;
  updatedAt?: number;
  lastTelegramSuccessAt?: number | null;
};

function runtimeRoot(): string {
  const configured = process.env.PHASE7C_RUNTIME_ROOT?.trim();
  if (configured) return path.resolve(configured);
  const demoDir = process.env.PHASE7B_DEMO_WORK_DIR?.trim();
  if (demoDir) return path.resolve(demoDir, "..");
  return path.resolve(process.cwd(), ".runtime");
}

function executorRuntime(): string {
  return path.join(runtimeRoot(), "phase7c-executors");
}

function findProjectRoot(): string {
  let current = process.cwd();
  for (let index = 0; index < 8; index += 1) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml")) && fs.existsSync(path.join(current, "scripts"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Cannot locate project root from ${process.cwd()}.`);
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")) as T;
  } catch {
    return null;
  }
}

function readPid(file: string): number | null {
  try {
    const value = Number(fs.readFileSync(file, "utf8").trim());
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function isPidAlive(pid: number | null | undefined): boolean {
  if (!Number.isInteger(pid) || (pid ?? 0) <= 0) return false;
  try {
    process.kill(pid as number, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

function telegramConfigured(): boolean {
  try {
    const text = fs.readFileSync(path.join(findProjectRoot(), ".env.phase7b-telegram"), "utf8");
    return /^ZIQ_TELEGRAM_BOT_TOKEN=.+$/m.test(text) && /^ZIQ_TELEGRAM_CHAT_ID=.+$/m.test(text);
  } catch {
    return false;
  }
}

function controlEnabled(): boolean {
  if (process.platform !== "win32") return false;
  return !/^(?:0|false|no|off)$/i.test(process.env.PHASE7B_LOCAL_CONTROL_ENABLED ?? "true");
}

export function getPhase7CLifecycleRuntimeStatus() {
  const root = executorRuntime();
  const accountModeState = getPhase7CAccountModeState();
  const supervisorPid = readPid(path.join(root, "supervisor.pid"));
  const trendPid = readPid(path.join(root, "trend.pid"));
  const sidewayPid = readPid(path.join(root, "sideway.pid"));
  const telegramPid = readPid(path.join(root, "telegram-mode.pid"));
  const regimeNotifierPid = readPid(path.join(root, "regime-notifier.pid"));
  const telegram = readJson<TelegramModeStatus>(path.join(root, "telegram-mode-status.json"));
  const telegramUpdatedAt = Number(telegram?.updatedAt ?? telegram?.lastTelegramSuccessAt ?? 0);
  const telegramHeartbeatAgeMs = telegramUpdatedAt > 0
    ? Math.max(0, Date.now() - telegramUpdatedAt)
    : null;
  const processes = {
    supervisor: { pid: supervisorPid, alive: isPidAlive(supervisorPid) },
    trend: { pid: trendPid, alive: isPidAlive(trendPid) },
    sideway: { pid: sidewayPid, alive: isPidAlive(sidewayPid) },
    telegram: { pid: telegramPid, alive: isPidAlive(telegramPid) },
    regimeNotifier: { pid: regimeNotifierPid, alive: isPidAlive(regimeNotifierPid) },
  };
  const lots = phase7CLotSettingsService.get();
  const running = processes.supervisor.alive && processes.trend.alive && processes.sideway.alive;
  const telegramReady = Boolean(
    processes.telegram.alive &&
    processes.regimeNotifier.alive &&
    telegram?.ready === true &&
    telegram?.status === "READY" &&
    telegramHeartbeatAgeMs !== null &&
    telegramHeartbeatAgeMs <= TELEGRAM_STALE_MS,
  );
  const ready = accountModeState.valid && running && telegramReady && lots.activeAlive && !lots.restartRequired;

  return {
    controlEnabled: controlEnabled(),
    running,
    ready,
    accountMode: accountModeState,
    telegramConfigured: telegramConfigured(),
    telegramReady,
    telegramStatus: telegram?.status ?? "STOPPED",
    telegramHeartbeatAgeMs,
    mode: phase7CBotModeService.get(),
    processes,
    lotSettings: {
      configured: lots.state,
      active: lots.active,
      activeAlive: lots.activeAlive,
      restartRequired: lots.restartRequired,
    },
    safety: {
      localhostOnly: true as const,
      accountMode: accountModeState.accountMode,
      demoOnly: accountModeState.accountMode === "DEMO",
      realAccountAllowed: accountModeState.accountMode === "LIVE" && accountModeState.liveExecutionEnabled,
      accountGuardValid: accountModeState.valid,
      accountSwitchFromWeb: false as const,
      liveColdStartFromWeb: false as const,
      startMode: accountModeState.accountMode === "LIVE"
        ? "ADMIN_SWITCH_PAUSE_THEN_OPERATOR_AUTO" as const
        : "PAUSE_THEN_AUTO_AFTER_READY" as const,
      stopBlockedWithOpenPosition: true as const,
      mt5PanelOrderPermission: "NONE" as const,
    },
  };
}

export function assertPhase7CSelectedAccountReady(telemetry: Mt5TelemetrySnapshot): void {
  const accountModeState = getPhase7CAccountModeState();
  if (!accountModeState.valid) {
    throw new Error(`Account-mode state không hợp lệ. ${accountModeState.error ?? ""}`.trim());
  }
  if (!telemetry.reachable) throw new Error("MT5 Bridge chưa kết nối.");
  if (!accountModeAllowsBroker(telemetry.health?.accountMode, accountModeState)) {
    throw new Error(
      `MT5 account không khớp cấu hình ${accountModeState.accountMode}. broker=${telemetry.health?.accountMode ?? "unknown"}`,
    );
  }
  if (telemetry.health?.tradingEnabled !== true) throw new Error("Bridge trading chưa bật.");
  if (telemetry.health?.terminalTradeAllowed !== true) throw new Error("MT5 terminal chưa cho phép trading.");
  if (telemetry.health?.expertTradeAllowed !== true) throw new Error("MT5 Algo/Expert Trading chưa bật.");
}

// Backward-compatible exported name for older imports. It now validates the
// selected Phase7C account mode instead of hard-coding DEMO.
export const assertPhase7CDemoReady = assertPhase7CSelectedAccountReady;

function quotePowerShellLiteral(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function pairPowerShellArguments(args: string[]): string[] {
  const output: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value.startsWith("-") && index + 1 < args.length && !args[index + 1].startsWith("-")) {
      output.push(value, quotePowerShellLiteral(args[index + 1]));
      index += 1;
    } else {
      output.push(value.startsWith("-") ? value : quotePowerShellLiteral(value));
    }
  }
  return output;
}

async function launchDemoSupervisor(): Promise<number> {
  const accountModeState = getPhase7CAccountModeState();
  if (!accountModeState.valid || accountModeState.accountMode !== "DEMO") {
    throw new Error("Web cold-start chỉ được phép cho DEMO. LIVE phải dùng account-switch Admin đã verify.");
  }
  const projectRoot = findProjectRoot();
  const script = path.join(projectRoot, "scripts", "run-phase7c-executors-local.ps1");
  const telegramEnv = path.join(projectRoot, ".env.phase7b-telegram");
  const bridgeEnv = path.join(projectRoot, "packages", "mt5-broker", "bridge", ".env.phase7b-demo");
  if (!fs.existsSync(script)) throw new Error(`Missing executor supervisor: ${script}`);
  if (!fs.existsSync(bridgeEnv)) throw new Error(`Missing DEMO bridge env: ${bridgeEnv}`);
  if (!fs.existsSync(telegramEnv)) throw new Error(`Missing Telegram env: ${telegramEnv}`);

  const settings = phase7CLotSettingsService.getState();
  const runtime = executorRuntime();
  fs.mkdirSync(runtime, { recursive: true });
  const launcherPath = path.join(runtime, "web-lifecycle-launcher.ps1");
  const logPath = path.join(runtime, "web-lifecycle.log");
  const supervisorOut = path.join(runtime, "supervisor.out.log");
  const supervisorErr = path.join(runtime, "supervisor.err.log");
  const args = [
    "-WorkDir", runtimeRoot(),
    "-ControlApiUrl", `http://127.0.0.1:${Number(process.env.PORT ?? 3711) || 3711}`,
    "-EnvFile", bridgeEnv,
    "-TelegramEnvFile", telegramEnv,
    "-AccountMode", "DEMO",
    "-TrendFixedVolume", String(settings.trendFixedLot),
    "-SidewayRiskPercent", String(settings.sidewayRiskPercent),
    "-SidewayMaxLot", String(settings.sidewayMaxLot),
    "-Armed",
  ];
  const invocation = [
    `& ${quotePowerShellLiteral(script)}`,
    ...pairPowerShellArguments(args),
    `1>> ${quotePowerShellLiteral(supervisorOut)}`,
    `2>> ${quotePowerShellLiteral(supervisorErr)}`,
  ].join(" ");
  fs.writeFileSync(
    launcherPath,
    `$ErrorActionPreference = 'Stop'\r\n${invocation}\r\n`,
    "utf8",
  );
  fs.appendFileSync(logPath, `\n=== WEB START ${new Date().toISOString()} ===\n`, "utf8");
  fs.writeFileSync(supervisorOut, `=== WEB START ${new Date().toISOString()} ===\n`, "utf8");
  fs.writeFileSync(supervisorErr, "", "utf8");

  const command = [
    "$ErrorActionPreference='Stop'",
    `$p=Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',${quotePowerShellLiteral(launcherPath)}) -WindowStyle Hidden -PassThru`,
    "$p.Id",
  ].join("; ");
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { windowsHide: true, timeout: 10_000, maxBuffer: 32 * 1024 },
  );
  const pid = Number(String(stdout).trim().split(/\r?\n/).at(-1));
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`PowerShell launcher did not return a valid PID. Output=${String(stdout).trim()}`);
  }
  fs.writeFileSync(path.join(runtime, "web-lifecycle-launcher.pid"), String(pid), "ascii");
  return pid;
}

async function runStopper(): Promise<void> {
  const projectRoot = findProjectRoot();
  const script = path.join(projectRoot, "scripts", "stop-phase7c-executors-local.ps1");
  if (!fs.existsSync(script)) throw new Error(`Missing executor stopper: ${script}`);
  try {
    await execFileAsync("schtasks.exe", ["/End", "/TN", EXECUTOR_TASK], {
      windowsHide: true,
      timeout: 8_000,
      maxBuffer: 32 * 1024,
    });
  } catch {
    // Task can already be stopped.
  }
  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-WorkDir", runtimeRoot()],
    { windowsHide: true, timeout: 25_000, maxBuffer: 128 * 1024 },
  );
  const launcherPid = readPid(path.join(executorRuntime(), "web-lifecycle-launcher.pid"));
  if (isPidAlive(launcherPid)) {
    try {
      await execFileAsync("taskkill.exe", ["/PID", String(launcherPid), "/T", "/F"], {
        windowsHide: true,
        timeout: 8_000,
        maxBuffer: 32 * 1024,
      });
    } catch {
      // It may have exited immediately after its supervisor child stopped.
    }
  }
  try {
    fs.unlinkSync(path.join(executorRuntime(), "web-lifecycle-launcher.pid"));
  } catch {
    // Missing file is fine.
  }
}

async function waitForReady(timeoutMs = START_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = getPhase7CLifecycleRuntimeStatus();
    if (status.ready) return status;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return null;
}

function logTail(file: string, lines = 40): string {
  try {
    return fs.readFileSync(file, "utf8").split(/\r?\n/).slice(-lines).join("\n").trim();
  } catch {
    return "";
  }
}

export async function startPhase7CFromWeb(telemetry: Mt5TelemetrySnapshot) {
  if (!controlEnabled()) throw new Error("Điều khiển Bot chỉ khả dụng trên localhost Windows.");
  assertPhase7CSelectedAccountReady(telemetry);
  if (telemetry.positions.length > 0) {
    throw new Error(`Không khởi động sạch khi đang có ${telemetry.positions.length} vị thế XAUUSD. Hãy kiểm tra/quản lý vị thế trước.`);
  }
  if (!telegramConfigured()) throw new Error("Telegram chưa được cấu hình; không bật Bot khi thiếu kênh thông báo.");

  const accountModeState = getPhase7CAccountModeState();
  const current = getPhase7CLifecycleRuntimeStatus();
  if (current.ready) {
    const mode = phase7CBotModeService.set("AUTO", "web-control-center-start");
    return {
      action: "ALREADY_RUNNING",
      message: `Bot ${accountModeState.accountMode} đã chạy và đã verify; mode chuyển AUTO.`,
      accountMode: accountModeState.accountMode,
      mode,
      lifecycle: getPhase7CLifecycleRuntimeStatus(),
    };
  }

  phase7CBotModeService.set("PAUSE", "web-control-center-preflight");

  if (accountModeState.accountMode === "LIVE") {
    throw new Error(
      "LIVE chưa ở trạng thái READY đã verify. Web không được cold-start LIVE; hãy dùng switch-phase7c-account-mode-local.ps1 trong PowerShell Administrator. Bot vẫn PAUSE.",
    );
  }

  if (current.running || Object.values(current.processes).some((entry) => entry.alive)) {
    await runStopper();
  }

  const launcherPid = await launchDemoSupervisor();
  const ready = await waitForReady();
  if (!ready) {
    phase7CBotModeService.set("PAUSE", "web-control-center-start-failed");
    await runStopper().catch(() => undefined);
    const runtime = executorRuntime();
    const detail = [
      logTail(path.join(runtime, "web-lifecycle.log")),
      logTail(path.join(runtime, "supervisor.err.log")),
      logTail(path.join(runtime, "telegram-mode.err.log")),
    ].filter(Boolean).join("\n");
    throw new Error(`Bot chưa đạt READY trong ${START_TIMEOUT_MS / 1000} giây; đã giữ PAUSE và dừng executor.${detail ? `\n\nLog cuối:\n${detail}` : ""}`);
  }

  try {
    const finalTelemetry = await getMt5Telemetry("XAUUSD");
    assertPhase7CSelectedAccountReady(finalTelemetry);
    if (finalTelemetry.positions.length > 0) {
      throw new Error(`Phát hiện ${finalTelemetry.positions.length} vị thế XAUUSD trong lúc khởi động.`);
    }
  } catch (error) {
    phase7CBotModeService.set("PAUSE", "web-control-center-final-preflight-failed");
    await runStopper().catch(() => undefined);
    throw new Error(`Kiểm tra cuối trước AUTO thất bại; executor đã dừng và giữ PAUSE. ${error instanceof Error ? error.message : String(error)}`);
  }

  const mode = phase7CBotModeService.set("AUTO", "web-control-center-start");
  return {
    action: "STARTED",
    message: `Bot DEMO đã RUNNING · AUTO · Trend ${ready.lotSettings.configured.trendFixedLot.toFixed(2)} lot · Telegram READY.`,
    launcherPid,
    accountMode: "DEMO" as const,
    mode,
    lifecycle: getPhase7CLifecycleRuntimeStatus(),
  };
}

export async function stopPhase7CFromWeb(telemetry: Mt5TelemetrySnapshot) {
  if (!controlEnabled()) throw new Error("Điều khiển Bot chỉ khả dụng trên localhost Windows.");
  assertPhase7CSelectedAccountReady(telemetry);
  if (telemetry.positions.length > 0) {
    throw new Error("Bot đang có vị thế XAUUSD. Không cho dừng executor để tránh bỏ lệnh không được quản lý.");
  }

  const accountModeState = getPhase7CAccountModeState();
  const mode = phase7CBotModeService.set("PAUSE", "web-control-center-stop");
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  await runStopper();
  await new Promise((resolve) => setTimeout(resolve, 500));
  const lifecycle = getPhase7CLifecycleRuntimeStatus();
  if (lifecycle.running) {
    throw new Error("Executor vẫn còn chạy sau lệnh dừng. Giữ PAUSE và kiểm tra Scheduled Task XAUUSD-Phase7C-Executors.");
  }
  return {
    action: "STOPPED",
    message: `Bot ${accountModeState.accountMode} đã dừng an toàn · mode PAUSE · Web/MT5 Bridge vẫn hoạt động.`,
    accountMode: accountModeState.accountMode,
    mode,
    lifecycle,
  };
}
