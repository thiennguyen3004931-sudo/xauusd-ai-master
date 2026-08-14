import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Router, type Request, type Response } from "express";
import { getMt5Telemetry } from "../services/mt5.service";

const execFileAsync = promisify(execFile);
const router = Router();

const TASKS = {
  bridge: "XAUUSD-Phase7B-Bridge",
  bot: "XAUUSD-Phase7B-Bot",
  telegram: "XAUUSD-Phase7B-Telegram",
  web: "XAUUSD-Phase7B-Web",
} as const;

const TELEGRAM_HEARTBEAT_STALE_MS = 10_000;

type RuntimeState = {
  version?: number;
  status?: string;
  armed?: boolean;
  pid?: number | null;
  heartbeatAt?: number;
  startedAt?: number | null;
};

type TelegramRuntimeState = {
  version?: number;
  status?: string;
  pid?: number | null;
  wrapperPid?: number | null;
  heartbeatAt?: number;
  startedAt?: string | null;
  intervalSeconds?: number;
  exitCode?: number | null;
};

type TaskStatus = {
  key: keyof typeof TASKS;
  name: string;
  exists: boolean;
  state: string;
};

router.get("/status", async (req: Request, res: Response) => {
  if (!isLoopback(req)) {
    return res.status(403).json({ error: "Phase 7B local controls are available only from localhost." });
  }

  try {
    const demoDir = resolveDemoDir();
    const runtime = demoDir ? readJsonIfExists<RuntimeState>(path.join(demoDir, "phase7b-demo-runtime.json")) : null;
    const telegramRuntime = demoDir
      ? readJsonIfExists<TelegramRuntimeState>(path.join(demoDir, "phase7b-telegram-runtime.json"))
      : null;
    const botProcessAlive = Boolean(runtime?.armed && isPidAlive(runtime.pid));
    const telegramStatus = getTelegramRuntimeStatus(telegramRuntime);
    const [tasks, webUiAlive, telemetry] = await Promise.all([
      readTaskStatuses(),
      isWebUiAlive(),
      getMt5Telemetry("XAUUSD").catch(() => null),
    ]);

    return res.json({
      localOnly: true,
      controlEnabled: controlEnabled(req),
      generatedAt: Date.now(),
      taskNames: TASKS,
      tasks,
      processes: {
        botAlive: botProcessAlive,
        telegramAlive: telegramStatus.alive,
        webAlive: webUiAlive,
      },
      telegram: telegramStatus,
      bridge: telemetry
        ? {
            reachable: telemetry.reachable,
            status: telemetry.status,
            accountMode: telemetry.health?.accountMode ?? null,
            tradingEnabled: telemetry.health?.tradingEnabled ?? null,
          }
        : {
            reachable: false,
            status: "OFFLINE",
            accountMode: null,
            tradingEnabled: null,
          },
      safety: {
        demoOnly: true,
        directOrderRouteExposed: false,
        startAction: "WINDOWS_SCHEDULED_TASKS_ONLY",
        taskBackend: "SCHTASKS_EXE",
        telegramHealthSource: "RUNTIME_HEARTBEAT",
      },
    });
  } catch (error) {
    return res.status(503).json({ error: errorMessage(error) });
  }
});

router.post("/start", async (req: Request, res: Response) => {
  if (!controlEnabled(req)) {
    return res.status(403).json({
      error: "Phase 7B start control is disabled or request is not from localhost.",
    });
  }

  try {
    const demoDir = resolveDemoDir();
    if (!demoDir) {
      return res.status(409).json({ error: "PHASE7B_DEMO_WORK_DIR is not configured for this API." });
    }

    const runtime = readJsonIfExists<RuntimeState>(path.join(demoDir, "phase7b-demo-runtime.json"));
    const telegramRuntime = readJsonIfExists<TelegramRuntimeState>(path.join(demoDir, "phase7b-telegram-runtime.json"));
    const botProcessAlive = Boolean(runtime?.armed && isPidAlive(runtime.pid));
    const telegramStatus = getTelegramRuntimeStatus(telegramRuntime);
    const [tasks, webUiAlive, telemetry] = await Promise.all([
      readTaskStatuses(),
      isWebUiAlive(),
      getMt5Telemetry("XAUUSD").catch(() => null),
    ]);

    if (telemetry?.reachable && telemetry.health?.accountMode === "real") {
      return res.status(409).json({
        error: "REAL account detected. Phase 7B DEMO start is blocked.",
      });
    }

    const requiredForStart = tasks.filter((task) => task.key !== "web");
    const missing = requiredForStart.filter((task) => !task.exists);
    if (missing.length > 0) {
      return res.status(409).json({
        error: `Autostart tasks are not installed: ${missing.map((task) => task.name).join(", ")}. Run scripts/install-phase7b-autostart.ps1 once.`,
        tasks,
      });
    }

    const actions: string[] = [];

    if (!telemetry?.reachable) {
      await startScheduledTask(TASKS.bridge);
      actions.push("BRIDGE_START_REQUESTED");
    } else {
      actions.push("BRIDGE_ALREADY_REACHABLE");
    }

    if (!telegramStatus.alive) {
      await startScheduledTask(TASKS.telegram);
      actions.push("TELEGRAM_START_REQUESTED");
    } else {
      actions.push("TELEGRAM_ALREADY_RUNNING");
    }

    if (!botProcessAlive) {
      await startScheduledTask(TASKS.bot);
      actions.push("BOT_START_REQUESTED");
    } else {
      actions.push("BOT_ALREADY_RUNNING");
    }

    actions.push(webUiAlive ? "WEB_ALREADY_RUNNING" : "WEB_NOT_RUNNING_USE_AUTOSTART_TASK");

    return res.json({
      accepted: true,
      localOnly: true,
      demoOnly: true,
      directOrderRouteExposed: false,
      actions,
      telegramBeforeStart: telegramStatus,
      message: "Phase 7B DEMO stack start requested through Windows Scheduled Tasks.",
    });
  } catch (error) {
    return res.status(503).json({ error: errorMessage(error) });
  }
});

function resolveDemoDir(): string | null {
  const configured = process.env.PHASE7B_DEMO_WORK_DIR?.trim();
  if (!configured) return null;
  const resolved = path.resolve(configured);
  return path.basename(resolved).toLowerCase() === "phase7b-demo-forward"
    ? resolved
    : path.join(resolved, "phase7b-demo-forward");
}

function controlEnabled(req: Request): boolean {
  if (process.platform !== "win32" || !isLoopback(req) || !resolveDemoDir()) return false;
  return !/^(0|false|no|off)$/i.test(process.env.PHASE7B_LOCAL_CONTROL_ENABLED ?? "true");
}

function isLoopback(req: Request): boolean {
  const remote = req.socket.remoteAddress ?? "";
  return remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
}

async function readTaskStatuses(): Promise<TaskStatus[]> {
  if (process.platform !== "win32") {
    return Object.entries(TASKS).map(([key, name]) => ({
      key: key as keyof typeof TASKS,
      name,
      exists: false,
      state: "UNSUPPORTED",
    }));
  }

  return Promise.all(
    Object.entries(TASKS).map(async ([key, name]) => {
      try {
        const { stdout } = await execFileAsync(
          "schtasks.exe",
          ["/Query", "/TN", name, "/FO", "LIST", "/V"],
          { windowsHide: true, timeout: 5_000, maxBuffer: 64 * 1024 },
        );
        return {
          key: key as keyof typeof TASKS,
          name,
          exists: true,
          state: parseScheduledTaskState(stdout),
        };
      } catch {
        return {
          key: key as keyof typeof TASKS,
          name,
          exists: false,
          state: "NOT_INSTALLED",
        };
      }
    }),
  );
}

function parseScheduledTaskState(stdout: string): string {
  const status = stdout.match(/^Status:\s*(.+)$/im)?.[1]?.trim();
  if (status) return status.toUpperCase();

  const scheduledState = stdout.match(/^Scheduled Task State:\s*(.+)$/im)?.[1]?.trim();
  if (scheduledState) return scheduledState.toUpperCase();

  return "INSTALLED";
}

async function startScheduledTask(taskName: string): Promise<void> {
  await execFileAsync(
    "schtasks.exe",
    ["/Run", "/TN", taskName],
    { windowsHide: true, timeout: 5_000, maxBuffer: 32 * 1024 },
  );
}

function getTelegramRuntimeStatus(runtime: TelegramRuntimeState | null) {
  const heartbeatAt = Number(runtime?.heartbeatAt ?? 0);
  const heartbeatAgeMs = heartbeatAt > 0 ? Math.max(0, Date.now() - heartbeatAt) : null;
  const pidAlive = isPidAlive(runtime?.pid);
  const heartbeatFresh = heartbeatAgeMs !== null && heartbeatAgeMs <= TELEGRAM_HEARTBEAT_STALE_MS;
  const alive = Boolean(runtime?.status === "RUNNING" && pidAlive && heartbeatFresh);

  return {
    alive,
    status: runtime?.status ?? "NO_RUNTIME",
    pid: runtime?.pid ?? null,
    wrapperPid: runtime?.wrapperPid ?? null,
    startedAt: runtime?.startedAt ?? null,
    heartbeatAt: heartbeatAt || null,
    heartbeatAgeMs,
    heartbeatFresh,
    pidAlive,
    staleAfterMs: TELEGRAM_HEARTBEAT_STALE_MS,
    exitCode: runtime?.exitCode ?? null,
  };
}

async function isWebUiAlive(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetch("http://127.0.0.1:5717/phase7b-ops", {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function readJsonIfExists<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")) as T;
  } catch {
    return null;
  }
}

function isPidAlive(pid: number | null | undefined): boolean {
  if (!Number.isInteger(pid) || (pid ?? 0) <= 0) return false;
  try {
    process.kill(pid as number, 0);
    return true;
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default router;
