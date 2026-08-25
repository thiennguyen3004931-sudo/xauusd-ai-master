import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolvePhase7CWebStartAccount,
  type Phase7CWebStartAccountInput,
} from "../apps/api/src/services/phase7c-web-account-start-policy.ts";
import {
  evaluatePhase7CLiveAuthorization,
  type Phase7CLiveAuthorizationRecord,
  type Phase7CLiveProfileIdentity,
} from "../apps/api/src/services/phase7c-live-authorization.service.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const demoState = {
  valid: true,
  accountMode: "DEMO" as const,
  liveExecutionEnabled: false,
};
const liveState = {
  valid: true,
  accountMode: "LIVE" as const,
  liveExecutionEnabled: true,
};

function decide(overrides: Partial<Phase7CWebStartAccountInput> = {}) {
  return resolvePhase7CWebStartAccount({
    reachable: true,
    brokerAccountMode: "demo",
    currentState: demoState,
    durableLiveAuthorizationValid: false,
    ...overrides,
  });
}

const demo = decide();
assert.equal(demo.allowed, true);
assert.equal(demo.targetAccountMode, "DEMO");
assert.equal(demo.liveExecutionEnabled, false);
assert.equal(demo.authorizationSource, "NOT_REQUIRED");

const authorizedLive = decide({
  brokerAccountMode: "real",
  currentState: demoState,
  durableLiveAuthorizationValid: true,
});
assert.equal(authorizedLive.allowed, true);
assert.equal(authorizedLive.targetAccountMode, "LIVE");
assert.equal(authorizedLive.liveExecutionEnabled, true);
assert.equal(authorizedLive.authorizationSource, "DURABLE_LIVE_AUTHORIZATION");

const legacyExplicitLive = decide({
  brokerAccountMode: "real",
  currentState: liveState,
  durableLiveAuthorizationValid: false,
});
assert.equal(legacyExplicitLive.allowed, true);
assert.equal(legacyExplicitLive.targetAccountMode, "LIVE");
assert.equal(legacyExplicitLive.authorizationSource, "LEGACY_EXPLICIT_LIVE_STATE");

const unauthorizedLive = decide({
  brokerAccountMode: "real",
  currentState: demoState,
  durableLiveAuthorizationValid: false,
});
assert.equal(unauthorizedLive.allowed, false);
assert.equal(unauthorizedLive.reason, "LIVE_NOT_PREAUTHORIZED");
assert.equal(unauthorizedLive.liveExecutionEnabled, false);

for (const brokerAccountMode of ["contest", "REAL", "", null, undefined]) {
  const result = decide({ brokerAccountMode });
  assert.equal(result.allowed, false, `mode=${String(brokerAccountMode)} must fail closed`);
  assert.equal(result.reason, "UNSUPPORTED_BROKER_ACCOUNT_MODE");
}

assert.equal(decide({ reachable: false }).reason, "MT5_BRIDGE_NOT_REACHABLE");
assert.equal(
  decide({ currentState: { ...demoState, valid: false } }).reason,
  "ACCOUNT_MODE_STATE_INVALID",
);

const identity: Phase7CLiveProfileIdentity = {
  accountLogin: 123456,
  server: "DBGMarkets-Live",
  terminalPath: "C:\\MT5\\terminal64.exe",
  profileFingerprint: "0123456789abcdef",
};
const authorization: Phase7CLiveAuthorizationRecord = {
  version: 1,
  authorized: true,
  accountMode: "LIVE",
  accountLogin: identity.accountLogin,
  server: identity.server,
  profileFingerprint: identity.profileFingerprint,
  authorizedAt: "2026-08-25T00:00:00.000Z",
  authorizedBy: "switch-phase7c-account-mode-local",
};
const validAuth = evaluatePhase7CLiveAuthorization({
  authorization,
  expectedIdentity: identity,
  brokerServer: "DBGMarkets-Live",
});
assert.equal(validAuth.valid, true);
assert.equal(validAuth.reason, "LIVE_AUTHORIZED");

assert.equal(
  evaluatePhase7CLiveAuthorization({
    authorization: { ...authorization, profileFingerprint: "different" },
    expectedIdentity: identity,
    brokerServer: "DBGMarkets-Live",
  }).reason,
  "LIVE_AUTH_PROFILE_MISMATCH",
);
assert.equal(
  evaluatePhase7CLiveAuthorization({
    authorization,
    expectedIdentity: identity,
    brokerServer: "Other-Live",
  }).reason,
  "LIVE_AUTH_BROKER_SERVER_MISMATCH",
);
assert.equal(
  evaluatePhase7CLiveAuthorization({
    authorization: null,
    expectedIdentity: identity,
    brokerServer: "DBGMarkets-Live",
  }).reason,
  "LIVE_AUTH_MISSING",
);

const lifecycleSource = fs.readFileSync(
  path.join(root, "apps/api/src/services/phase7c-lifecycle.service.ts"),
  "utf8",
);
assert.match(lifecycleSource, /resolvePhase7CWebStartAccount/);
assert.match(lifecycleSource, /ensurePhase7CLiveAuthorizationForWebStart/);
assert.match(lifecycleSource, /launchSelectedSupervisor/);
assert.doesNotMatch(lifecycleSource, /Web cold-start chỉ được phép cho DEMO/);
assert.doesNotMatch(lifecycleSource, /web-control-center-live-start-blocked/);
assert.match(lifecycleSource, /-LiveExecutionEnabled/);

const switchSource = fs.readFileSync(
  path.join(root, "scripts/switch-phase7c-account-mode-local.ps1"),
  "utf8",
);
assert.match(switchSource, /Write-Phase7CLiveAuthorizationState/);
assert.match(switchSource, /ConfirmLiveExecution/);

const uiSource = fs.readFileSync(
  path.join(root, "apps/web/src/pages/Phase7CControlCenterPage.tsx"),
  "utf8",
);
assert.doesNotMatch(uiSource, /lifecycleData\?\.bridge\.accountMode !== "demo"/);
assert.match(uiSource, /LIVE.*cấp quyền|cấp quyền.*LIVE/i);

console.log("PHASE7C_WEB_AUTO_ACCOUNT_START_TEST=PASS");
