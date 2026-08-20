import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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
  maxDemoLot: 0.3,
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

function isManagedLot(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  if (value < PHASE7C_LOT_LIMITS.minManagedLot - 1e-9) return false;
  if (value > PHASE7C_LOT_LIMITS.maxDemoLot + 1e-9) return false;
  const units = value / PHASE7C_LOT_LIMITS.managedLotIncrement;
  return Math.abs(units - Math.round(units)) <= 1e-8;
}

export function validatePhase7CLotSettings(
  input: Phase7CLotSettingsInput,
): Phase7CLotSettingsInput {
  const trendFixedLot = Number(input.trendFixedLot);
  const sidewayRiskPercent = Number(input.sidewayRiskPercent);
  const sidewayMaxLot = Number(input.sidewayMaxLot);

  if (!isManagedLot(trendFixedLot)) {
    throw new Error(
      "Trend fixed lot must be 0.03-0.30 and use 0.03 increments so +10 can close exactly one-third.",
    );
  }
  if (!isManagedLot(sidewayMaxLot)) {
    throw new Error(
      "Sideway max lot must be 0.03-0.30 and use 0.03 increments so +10 can close exactly one-third.",
    );
  }
  if (
    !Number.isFinite(sidewayRiskPercent) ||
    sidewayRiskPercent < PHASE7C_LOT_LIMITS.minRiskPercent - 1e-9 ||
    sidewayRiskPercent > PHASE7C_LOT_LIMITS.maxRiskPercent + 1e-9
  ) {
    throw new Error("Sideway risk percent must be between 0.01% and 1.00% in DEMO.");
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
  const raw = value as Partial<Phase7CActiveLotSettings>;
  try {
    const normalized = validatePhase7CLotSettings({
      trendFixedLot: Number(raw.trendFixedLot),
      sidewayRiskPercent: Number(raw.sidewayRiskPercent),
      sidewayMaxLot: Number(raw.sidewayMaxLot),
    });
    const supervisorPid = Number(raw.supervisorPid);
    if (!Number.isInteger(supervisorPid) || supervisorPid <= 0) return null;
    return {
      version: 1,
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
    const activeAlive = active ? isProcessAlive(active.supervisorPid) : false;
    const restartRequired =
      !active ||
      !activeAlive ||
      !active.armed ||
      active.trendFixedLot !== state.trendFixedLot ||
      active.sidewayRiskPercent !== state.sidewayRiskPercent ||
      active.sidewayMaxLot !== state.sidewayMaxLot;

    return {
      state,
      active,
      activeAlive,
      restartRequired,
      appliesTo: "NEW_POSITIONS_ONLY" as const,
      safety: {
        demoOnly: true,
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
    const normalized = validatePhase7CLotSettings(input);
    const state: Phase7CLotSettingsState = {
      version: 1,
      ...normalized,
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy.trim() || "operator",
    };

    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, this.filePath);
    return this.get();
  }
}

export const phase7CLotSettingsService = new Phase7CLotSettingsService();
