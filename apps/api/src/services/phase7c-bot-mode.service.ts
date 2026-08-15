import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { BotMode } from "@xauusd/strategy-engine";

export interface Phase7CBotModeState {
  mode: BotMode;
  updatedAt: string;
  updatedBy: string;
}

const VALID_MODES: readonly BotMode[] = ["AUTO", "TREND", "SIDEWAY", "PAUSE"];
const VALID_MODE_SET = new Set<BotMode>(VALID_MODES);

function defaultState(): Phase7CBotModeState {
  return {
    mode: "PAUSE",
    updatedAt: new Date(0).toISOString(),
    updatedBy: "safe-default",
  };
}

export function isPhase7CBotMode(value: unknown): value is BotMode {
  return typeof value === "string" && VALID_MODE_SET.has(value as BotMode);
}

export function getPhase7CBotModeOptions(): readonly BotMode[] {
  return VALID_MODES;
}

export class Phase7CBotModeService {
  private readonly filePath: string;

  constructor(filePath = process.env.PHASE7C_BOT_MODE_FILE) {
    this.filePath = filePath?.trim()
      ? resolve(filePath)
      : resolve(process.cwd(), ".runtime", "phase7c-bot-mode.json");
  }

  get(): Phase7CBotModeState {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<Phase7CBotModeState>;
      if (!isPhase7CBotMode(parsed.mode)) return defaultState();

      return {
        mode: parsed.mode,
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
        updatedBy: typeof parsed.updatedBy === "string" && parsed.updatedBy.trim()
          ? parsed.updatedBy.trim()
          : "unknown",
      };
    } catch {
      return defaultState();
    }
  }

  set(mode: BotMode, updatedBy = "operator"): Phase7CBotModeState {
    const state: Phase7CBotModeState = {
      mode,
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy.trim() || "operator",
    };

    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, this.filePath);
    return state;
  }
}

export const phase7CBotModeService = new Phase7CBotModeService();
