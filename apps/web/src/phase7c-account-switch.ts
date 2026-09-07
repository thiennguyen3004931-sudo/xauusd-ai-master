import type { Mt5TelemetrySnapshot } from "./types";
import type { Phase7CAccountMode, Phase7CSameModeAccountChangeReadiness } from "./phase7c-account-switch-types";

export const SAME_MODE_ACCOUNT_CHANGE_POLICY = {
  credentialInput: "NONE",
  manualLoginInMt5: true,
  autoArmAfterVerification: false,
  autoAutoAfterVerification: false,
} as const;

export type Mt5AccountIdentity = {
  accountLogin: number | null;
  server: string | null;
  accountMode: Phase7CAccountMode | null;
};

function normalizeAccountMode(value: string | null | undefined): Phase7CAccountMode | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "real") return "LIVE";
  if (normalized === "demo") return "DEMO";
  return null;
}

export function captureMt5AccountIdentity(snapshot: Mt5TelemetrySnapshot | null | undefined): Mt5AccountIdentity {
  if (!snapshot) {
    return { accountLogin: null, server: null, accountMode: null };
  }
  const accountLogin = Number(snapshot.accountLogin);
  return {
    accountLogin: Number.isFinite(accountLogin) && accountLogin > 0 ? accountLogin : null,
    server: snapshot.health?.server?.trim() || null,
    accountMode: normalizeAccountMode(snapshot.health?.accountMode),
  };
}

export function hasMt5AccountIdentityChanged(
  baseline: Mt5AccountIdentity | null | undefined,
  current: Mt5AccountIdentity | null | undefined,
): boolean {
  if (!baseline?.accountLogin || !current?.accountLogin) return false;
  return baseline.accountLogin !== current.accountLogin;
}

export function isSameModeMt5AccountVerified(input: {
  baseline: Mt5AccountIdentity | null | undefined;
  telemetry: Mt5TelemetrySnapshot | null | undefined;
  readiness: Phase7CSameModeAccountChangeReadiness | null | undefined;
}): boolean {
  const { baseline, telemetry, readiness } = input;
  const current = captureMt5AccountIdentity(telemetry);
  if (!baseline || !telemetry || !readiness) return false;
  return Boolean(
    readiness.approved &&
      readiness.currentMode === baseline.accountMode &&
      current.accountMode === baseline.accountMode &&
      hasMt5AccountIdentityChanged(baseline, current) &&
      telemetry.reachable &&
      telemetry.health?.connected === true &&
      telemetry.health?.tradingEnabled === true &&
      telemetry.health?.terminalTradeAllowed === true &&
      telemetry.health?.expertTradeAllowed === true &&
      telemetry.positions.length === 0,
  );
}

export function maskMt5AccountLogin(accountLogin: number | null | undefined): string {
  if (!Number.isFinite(accountLogin)) return "—";
  const text = String(Math.trunc(Number(accountLogin)));
  return text.length <= 4 ? `••••${text}` : `••••${text.slice(-4)}`;
}
