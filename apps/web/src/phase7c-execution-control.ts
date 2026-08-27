const LIVE_ARM_BASE = "/api/v1/phase7c-live-arm-control";
const AUTO_BASE = "/api/v1/phase7c-auto-activation";
const CONTROL_DIRECT = "http://127.0.0.1:3711";

export type Phase7CLiveArmAction = "ARM_LIVE" | "DISARM_LIVE";
export type Phase7CBooleanChecks = Record<string, boolean>;

export type Phase7CLiveArmControlCapability = {
  taskInstalled: boolean;
  accountMode: "DEMO" | "LIVE";
  botMode: string;
  liveArmStatus: string;
  liveExecutionArmed: boolean;
  bridgeSessionId: string | null;
  openXauusdPositions: number;
  canArm: boolean;
  canDisarm: boolean;
  armChecks: Phase7CBooleanChecks;
  armBlockedBy: string[];
  disarmChecks: Phase7CBooleanChecks;
  disarmBlockedBy: string[];
  safety: {
    localOnly: true;
    elevatedTaskName: string;
    canonicalArmScript: string;
    canonicalDisarmScript: string;
    orderSend: false;
    autoAfterArm: false;
  };
};

export type Phase7CLiveArmPreflight = {
  approved: boolean;
  action: Phase7CLiveArmAction;
  accountMode: string;
  botMode: string;
  liveArmStatus: string;
  liveExecutionArmed: boolean;
  bridgeSessionId: string | null;
  openXauusdPositions: number;
  taskInstalled: boolean;
  checks: Phase7CBooleanChecks;
  blockedBy: string[];
  preflightToken: string | null;
  expiresAt: number | null;
};

export type Phase7CLiveArmExecuteResponse = {
  accepted: true;
  requestId: string;
  action: Phase7CLiveArmAction;
  status: "RUNNING";
  message: string;
};

export type Phase7CLiveArmControlStatus = {
  requestId: string;
  action: Phase7CLiveArmAction;
  status: "RUNNING" | "PASS" | "FAIL";
  phase: string;
  message: string;
  finalArmStatus: string;
};

export type Phase7CAutoActivationStatus = {
  approved: boolean;
  accountMode: "DEMO" | "LIVE";
  brokerAccountMode: string | null;
  botMode: string;
  liveArmRequired: boolean;
  liveArmStatus: string | null;
  checks: Phase7CBooleanChecks;
  blockedBy: string[];
};

export type Phase7CAutoEnableResponse = Phase7CAutoActivationStatus & {
  state: {
    mode: string;
    updatedAt: string;
    updatedBy: string;
  };
};

async function safeJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: any = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`);
  }
  return payload as T;
}

async function request<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const urls = [`${base}${path}`, `${CONTROL_DIRECT}${base}${path}`];
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "no-store", ...init });
      return await safeJson<T>(response);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Không kết nối được");
    }
  }
  throw new Error(errors.join(" | "));
}

export function getPhase7CLiveArmControlCapability() {
  return request<Phase7CLiveArmControlCapability>(LIVE_ARM_BASE, "/capability");
}

export function createPhase7CLiveArmPreflight(action: Phase7CLiveArmAction) {
  return request<Phase7CLiveArmPreflight>(LIVE_ARM_BASE, "/preflight", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

export function executePhase7CLiveArmAction(
  action: Phase7CLiveArmAction,
  preflightToken: string,
) {
  return request<Phase7CLiveArmExecuteResponse>(LIVE_ARM_BASE, "/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, preflightToken, confirmation: action }),
  });
}

export function getPhase7CLiveArmControlStatus(requestId: string) {
  return request<Phase7CLiveArmControlStatus>(
    LIVE_ARM_BASE,
    `/status?requestId=${encodeURIComponent(requestId)}`,
  );
}

export function getPhase7CAutoActivationStatus() {
  return request<Phase7CAutoActivationStatus>(AUTO_BASE, "/status");
}

export function enablePhase7CAuto() {
  return request<Phase7CAutoEnableResponse>(AUTO_BASE, "/enable", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}
