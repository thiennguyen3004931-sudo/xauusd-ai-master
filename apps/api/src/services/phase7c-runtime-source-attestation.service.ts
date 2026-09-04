import { createHash } from "node:crypto";

export type Phase7CRuntimeSourceComponentName =
  | "api"
  | "lifecycle-broker"
  | "supervisor"
  | "trend"
  | "sideway"
  | "telegram"
  | "regime-notifier";

export type Phase7CRuntimeSourceVerdict =
  | "EXACT_MATCH"
  | "MISMATCH"
  | "STALE"
  | "UNKNOWN";

export interface Phase7CRuntimeSourceConfigIdentity {
  version: 1;
  accountMode: "DEMO" | "LIVE";
  liveExecutionEnabled: boolean;
  runtimeRoot: string;
  controlApiUrl: string;
}

export interface Phase7CRuntimeSourceDeploymentManifest {
  version: 1;
  deploymentId: string;
  sourceCommit: string;
  sourceTree: string;
  branch: "main";
  worktreeClean: true;
  createdAt: number;
  configFingerprint: string;
}

export interface Phase7CRuntimeSourceComponentAttestation {
  version: 1;
  component: Phase7CRuntimeSourceComponentName;
  deploymentId: string;
  sourceCommit: string;
  sourceTree: string;
  pid: number;
  startedAt: number;
  launcherSha256: string;
  configFingerprint: string;
}

export interface Phase7CRuntimeSourceComponentEvaluationInput {
  component: Phase7CRuntimeSourceComponentName;
  deployment: Phase7CRuntimeSourceDeploymentManifest | null;
  attestation: Phase7CRuntimeSourceComponentAttestation | null;
  currentPid: number | null;
  currentPidAlive: boolean | null;
  attestedPidAlive: boolean | null;
  expectedLauncherSha256: string | null;
  evidenceErrors: string[];
}

export interface Phase7CRuntimeSourceComponentResult {
  component: Phase7CRuntimeSourceComponentName;
  verdict: Phase7CRuntimeSourceVerdict;
  pid: number | null;
  alive: boolean | null;
  sourceCommit: string | null;
  deploymentId: string | null;
  reasonCodes: string[];
}

export interface Phase7CRuntimeSourceAttestationSnapshot {
  version: 1;
  source: "PHASE7C_RUNTIME_SOURCE_ATTESTATION";
  generatedAt: number;
  readOnly: true;
  deployment: Phase7CRuntimeSourceDeploymentManifest | null;
  overall: Phase7CRuntimeSourceVerdict;
  components: Phase7CRuntimeSourceComponentResult[];
  safety: {
    readOnly: true;
    modeMutation: false;
    armMutation: false;
    autoGate: false;
    lifecycleGate: false;
    orderMutation: false;
    positionMutation: false;
    strategyMutation: false;
    autoRetune: false;
  };
}

export interface Phase7CRuntimeSourceAttestationDeps {
  runtimeRoot: string;
  projectRoot: string;
  apiPid: number;
  now: () => number;
  readUtf8: (file: string) => string;
  sha256File: (file: string) => string;
  isPidAlive: (pid: number) => boolean;
}

function normalizedConfig(input: Phase7CRuntimeSourceConfigIdentity): Phase7CRuntimeSourceConfigIdentity {
  const accountMode = input.accountMode.trim().toUpperCase();
  if (accountMode !== "DEMO" && accountMode !== "LIVE") {
    throw new Error(`Unsupported Phase7C account mode: ${input.accountMode}`);
  }
  const runtimeRoot = input.runtimeRoot.trim();
  const controlApiUrl = input.controlApiUrl.trim().replace(/\/+$/, "");
  if (!runtimeRoot) throw new Error("runtimeRoot is required for runtime source attestation");
  if (!controlApiUrl) throw new Error("controlApiUrl is required for runtime source attestation");
  return {
    version: 1,
    accountMode,
    liveExecutionEnabled: Boolean(input.liveExecutionEnabled),
    runtimeRoot,
    controlApiUrl,
  };
}

export function canonicalizePhase7CRuntimeSourceConfig(
  input: Phase7CRuntimeSourceConfigIdentity,
): string {
  return JSON.stringify(normalizedConfig(input));
}

export function fingerprintPhase7CRuntimeSourceConfig(
  input: Phase7CRuntimeSourceConfigIdentity,
): string {
  const digest = createHash("sha256")
    .update(canonicalizePhase7CRuntimeSourceConfig(input), "utf8")
    .digest("hex");
  return `sha256:${digest}`;
}

function componentResult(
  input: Phase7CRuntimeSourceComponentEvaluationInput,
  verdict: Phase7CRuntimeSourceVerdict,
  reasonCodes: string[],
): Phase7CRuntimeSourceComponentResult {
  return {
    component: input.component,
    verdict,
    pid: input.currentPid ?? input.attestation?.pid ?? null,
    alive: input.currentPidAlive ?? input.attestedPidAlive ?? null,
    sourceCommit: input.attestation?.sourceCommit ?? null,
    deploymentId: input.attestation?.deploymentId ?? null,
    reasonCodes,
  };
}

export function evaluatePhase7CRuntimeSourceComponent(
  input: Phase7CRuntimeSourceComponentEvaluationInput,
): Phase7CRuntimeSourceComponentResult {
  if (!input.deployment || !input.attestation) {
    return componentResult(input, "UNKNOWN", ["EVIDENCE_MISSING"]);
  }

  const mismatchReasons: string[] = [];
  if (input.attestation.component !== input.component) {
    mismatchReasons.push("COMPONENT_MISMATCH");
  }
  if (input.attestation.sourceCommit !== input.deployment.sourceCommit) {
    mismatchReasons.push("SOURCE_COMMIT_MISMATCH");
  }
  if (input.attestation.sourceTree !== input.deployment.sourceTree) {
    mismatchReasons.push("SOURCE_TREE_MISMATCH");
  }
  if (input.attestation.deploymentId !== input.deployment.deploymentId) {
    mismatchReasons.push("DEPLOYMENT_ID_MISMATCH");
  }
  if (input.attestation.configFingerprint !== input.deployment.configFingerprint) {
    mismatchReasons.push("CONFIG_FINGERPRINT_MISMATCH");
  }
  if (
    input.expectedLauncherSha256 !== null &&
    input.attestation.launcherSha256 !== input.expectedLauncherSha256
  ) {
    mismatchReasons.push("LAUNCHER_HASH_MISMATCH");
  }
  if (
    input.currentPid !== null &&
    input.currentPidAlive === true &&
    input.currentPid !== input.attestation.pid
  ) {
    mismatchReasons.push("PID_MISMATCH");
  }
  if (mismatchReasons.length > 0) {
    return componentResult(input, "MISMATCH", mismatchReasons);
  }

  if (input.evidenceErrors.length > 0) {
    return componentResult(input, "UNKNOWN", ["EVIDENCE_INVALID", ...input.evidenceErrors]);
  }
  if (input.expectedLauncherSha256 === null) {
    return componentResult(input, "UNKNOWN", ["EVIDENCE_MISSING"]);
  }

  if (input.currentPid === null) {
    if (input.attestedPidAlive === false) {
      return componentResult(input, "STALE", ["CURRENT_PID_MISSING", "ATTESTED_PID_DEAD"]);
    }
    return componentResult(input, "UNKNOWN", ["CURRENT_PID_MISSING"]);
  }

  if (input.currentPid !== input.attestation.pid) {
    if (input.currentPidAlive === true) {
      return componentResult(input, "MISMATCH", ["PID_MISMATCH"]);
    }
    if (input.attestedPidAlive === false) {
      return componentResult(input, "STALE", ["ATTESTED_PID_DEAD"]);
    }
    return componentResult(input, "UNKNOWN", ["EVIDENCE_INVALID"]);
  }

  if (input.currentPidAlive === false || input.attestedPidAlive === false) {
    return componentResult(input, "STALE", ["ATTESTED_PID_DEAD"]);
  }
  if (input.currentPidAlive !== true || input.attestedPidAlive !== true) {
    return componentResult(input, "UNKNOWN", ["EVIDENCE_MISSING"]);
  }

  return componentResult(input, "EXACT_MATCH", [
    "DEPLOYMENT_MATCH",
    "PID_MATCH",
    "PROCESS_ALIVE",
    "LAUNCHER_HASH_MATCH",
  ]);
}

export function combinePhase7CRuntimeSourceVerdicts(
  values: readonly Phase7CRuntimeSourceVerdict[],
): Phase7CRuntimeSourceVerdict {
  if (values.includes("MISMATCH")) return "MISMATCH";
  if (values.includes("UNKNOWN")) return "UNKNOWN";
  if (values.includes("STALE")) return "STALE";
  return values.length > 0 ? "EXACT_MATCH" : "UNKNOWN";
}
