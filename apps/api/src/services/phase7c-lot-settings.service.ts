import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  getPhase7CAccountModeState,
  type Phase7CAccountMode,
} from "./phase7c-account-mode.service.js";

export interface Phase7CLotSettingsState {
  version: 1;
  trendFixedLot: number;
  sidewayRiskPercent: number;
  sidewayMaxLot: number;
  updatedAt: string;
  updatedBy: string;
}

export interface Phase7CActiveLotSettings {
  version: 1;
  accountMode: Phase7CAccountMode;
  trendFixedLot: number;
  sidewayRiskPercent: number;
  sidewayMaxLot: number;
  armed: boolean;
  supervisorPid: number;
  appliedAt: string;
}

export interface Phase7CLotSettingsInput {
  trendFixedLot: number;
  sidewayRiskPercent: number;
  sidewayMaxLot: number;
}

export const PHASE7C_LOT_LIMITS = {
  minManagedLot: 0.03,
  maxDemoLot: 1.2,
  maxManagedLot: 1.2,
  maxTrendLot: 1.2,
  maxSidewayLot: 1.2,
  lotStep: 0.01,
  managedLotIncrement: 0.03,
  minRiskPercent: 0.01,
  maxRiskPercent: 1,
} as const;

function round(value: number, digits = 8): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function defaultState(): Phase7CLotSettingsState {
  return {
    version: 1,
    trendFixedLot: 0.03,
    sidewayRiskPercent: 0.25,
    sidewayMaxLot: 0.03,
    updatedAt: new Date(0).toISOString(),
    updatedBy: "safe-default",
  };
}

function isManagedLot(value: number, maxLot: number): boolean {
  if (!Number.isFinite(value)) return false;
  if (value < PHASE7C_LOT_LIMITS.minManagedLot - 1e-9) return false;
  if (value > maxLot + 1e-9) return false;
  const units = value / PHASE7C_LOT_LIMITS.managedLotIncrement;
  return Math.abs(units - Math.round(units)) <= 1e-8;
}

function isSidewayCap(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  if (value < PHASE7C_LOT_LIMITS.minManagedLot - 1e-9) return false;
  if (value > PHASE7C_LOT_LIMITS.maxSidewayLot + 1e-9) return false;
  const units = value / PHASE7C_LOT_LIMITS.managedLotIncrement;
  return Math.abs(units - Math.round(units)) <= 1e-8;
}

export function validatePhase7CLotSettings(
  input: Phase7CLotSettingsInput,
): Phase7CLotSettingsInput {
  const trendFixedLot = Number(input.trendFixedLot);
  const sidewayRiskPercent = Number(input.sidewayRiskPercent);
  const sidewayMaxLot = Number(input.sidewayMaxLot);

  if (!isManagedLot(trendFixedLot, PHASE7C_LOT_LIMITS.maxTrendLot)) {
    throw new Error(
      "Trend fixed lot must be between 0.03 and 1.20 and use 0.03 increments so +10 can close exactly one-third.",
    );
  }
  if (!isSidewayCap(sidewayMaxLot)) {
    throw new Error(
      "Sideway max lot must be between 0.03 and 1.20 and use 0.03 increments so +10 can close exactly one-third.",
    );
  }
  if (
    !Number.isFinite(sidewayRiskPercent) ||
    sidewayRiskPercent < PHASE7C_LOT_LIMITS.minRiskPercent - 1e-9 ||
    sidewayRiskPercent > PHASE7C_LOT_LIMITS.maxRiskPercent + 1e-9
  ) {
    throw new Error("Sideway risk percent must be between 0.01% and 1.00%.");
  }

  return {
    trendFixedLot: round(trendFixedLot, 2),
    sidewayRiskPercent: round(sidewayRiskPercent, 2),
    sidewayMaxLot: round(sidewayMaxLot, 2),
  };
}

function parseState(value: unknown): Phase7CLotSettingsState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Phase7CLotSettingsState>;
  try {
    const normalized = validatePhase7CLotSettings({
      trendFixedLot: Number(raw.trendFixedLot),
      sidewayRiskPercent: Number(raw.sidewayRiskPercent),
      sidewayMaxLot: Number(raw.sidewayMaxLot),
    });
    return {
      version: 1,
      ...normalized,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
      updatedBy: typeof raw.updatedBy === "string" && raw.updatedBy.trim()
        ? raw.updatedBy.trim()
        : "unknown",
    };
  } catch {
    return null;
  }
}

function parseActive(value: unknown): Phase7CActiveLotSettings | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Phase7CActiveLotSettings> & { accountMode?: unknown };
  try {
    const normalized = validatePhase7CLotSettings({
      trendFixedLot: Number(raw.trendFixedLot),
      sidewayRiskPercent: Number(raw.sidewayRiskPercent),
      sidewayMaxLot: Number(raw.sidewayMaxLot),
    });
    const supervisorPid = Number(raw.supervisorPid);
    if (!Number.isInteger(supervisorPid) || supervisorPid <= 0) return null;
    const accountModeText = String(raw.accountMode ?? "DEMO").trim().toUpperCase();
    if (accountModeText !== "DEMO" && accountModeText !== "LIVE") return null;
    return {
      version: 1,
      accountMode: accountModeText,
      ...normalized,
      armed: raw.armed === true,
      supervisorPid,
      appliedAt: typeof raw.appliedAt === "string" ? raw.appliedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

function writeJsonAtomic(filePath: string, value: unknown) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, filePath);
}

export class Phase7CLotSettingsService {
  private readonly filePath: string;
  private readonly activeFilePath: string;

  constructor(
    filePath = process.env.PHASE7C_LOT_SETTINGS_FILE,
    activeFilePath = process.env.PHASE7C_ACTIVE_LOT_SETTINGS_FILE,
  ) {
    this.filePath = filePath?.trim()
      ? resolve(filePath)
      : resolve(process.cwd(), ".runtime", "phase7c-lot-settings.json");
    this.activeFilePath = activeFilePath?.trim()
      ? resolve(activeFilePath)
      : resolve(process.cwd(), ".runtime", "phase7c-executors", "active-lot-settings.json");
  }

  private profilePath(accountMode: Phase7CAccountMode): string {
    return resolve(dirname(this.filePath), `phase7c-lot-settings.${accountMode.toLowerCase()}.json`);
  }

  getState(): Phase7CLotSettingsState {
    try {
      return parseState(JSON.parse(readFileSync(this.filePath, "utf8"))) ?? defaultState();
    } catch {
      return defaultState();
    }
  }

  getActive(): Phase7CActiveLotSettings | null {
    try {
      return parseActive(JSON.parse(readFileSync(this.activeFilePath, "utf8")));
    } catch {
      return null;
    }
  }

  get() {
    const state = this.getState();
    const active = this.getActive();
    const accountModeState = getPhase7CAccountModeState();
    const activeAlive = active ? isProcessAlive(active.supervisorPid) : false;
    const restartRequired =
      !accountModeState.valid ||
      !active ||
      !activeAlive ||
      !active.armed ||
      active.accountMode !== accountModeState.accountMode ||
      active.trendFixedLot !== state.trendFixedLot ||
      active.sidewayRiskPercent !== state.sidewayRiskPercent ||
      active.sidewayMaxLot !== state.sidewayMaxLot;

    return {
      state,
      active,
      activeAlive,
      restartRequired,
      accountMode: accountModeState,
      appliesTo: "NEW_POSITIONS_ONLY" as const,
      safety: {
        accountMode: accountModeState.accountMode,
        demoOnly: accountModeState.accountMode === "DEMO",
        requiresPause: true,
        requiresZeroXauusdPositions: true,
        existingPositionMutation: false,
        martingale: false,
        recoveryLotEscalation: false,
      },
      limits: PHASE7C_LOT_LIMITS,
    };
  }

  set(input: Phase7CLotSettingsInput, updatedBy = "operator") {
    const accountModeState = getPhase7CAccountModeState();
    if (!accountModeState.valid) {
      throw new Error(`Account-mode state is invalid; lot settings fail closed. ${accountModeState.error ?? ""}`.trim());
    }
    const normalized = validatePhase7CLotSettings(input);
    const state: Phase7CLotSettingsState = {
      version: 1,
      ...normalized,
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy.trim() || "operator",
    };

    writeJsonAtomic(this.filePath, state);
    writeJsonAtomic(this.profilePath(accountModeState.accountMode), {
      ...state,
      accountMode: accountModeState.accountMode,
      appliesTo: "NEW_POSITIONS_ONLY",
      martingale: false,
      recoveryLotEscalation: false,
    });
    return this.get();
  }
}

export const phase7CLotSettingsService = new Phase7CLotSettingsService();
