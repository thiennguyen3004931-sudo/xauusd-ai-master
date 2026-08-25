import {
  existsSync,
  mkdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { getPhase7CAccountModeState } from "./phase7c-account-mode.service.js";
import {
  getPhase7CLiveProfileIdentity,
  phase7CLiveAuthorizationPath,
  type Phase7CLiveAuthorizationRecord,
} from "./phase7c-live-authorization.service.js";

export function preserveLegacyExplicitLiveAuthorization(): boolean {
  const filePath = phase7CLiveAuthorizationPath();
  if (existsSync(filePath)) return false;

  const accountState = getPhase7CAccountModeState();
  if (
    !accountState.valid ||
    accountState.accountMode !== "LIVE" ||
    accountState.liveExecutionEnabled !== true
  ) {
    return false;
  }

  const identity = getPhase7CLiveProfileIdentity();
  const record: Phase7CLiveAuthorizationRecord = {
    version: 1,
    authorized: true,
    accountMode: "LIVE",
    accountLogin: identity.accountLogin,
    server: identity.server,
    profileFingerprint: identity.profileFingerprint,
    authorizedAt: accountState.updatedAt ?? new Date().toISOString(),
    authorizedBy: `legacy-explicit-live-state:${accountState.updatedBy}`,
  };

  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, filePath);
  return true;
}
