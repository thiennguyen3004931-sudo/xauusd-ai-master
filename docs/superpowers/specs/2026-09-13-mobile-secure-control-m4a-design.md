# M4-A Mobile Secure Control — Design Specification

Date: 2026-09-13  
Status: DESIGN APPROVED — awaiting written-spec review  
Scope: mobile remote control through the existing Tailscale-only gateway  
Production mutation during this design phase: NONE

## 1. Objective

M4-A extends the existing mobile remote-access architecture with a narrowly bounded control surface for Phase 7C. The phone may change the bot operating mode and request LIVE ARM/DISARM, while all canonical safety checks, provenance rules, preflight gates, elevated task execution, and runtime ownership remain inside the existing Phase 7C services.

M4-A is not a second bot-control implementation. It is an authenticated action broker that maps a fixed set of remote actions to existing localhost-only canonical control paths.

## 2. Approved Remote Actions

The complete remote mutation allowlist is:

- `MODE_AUTO`
- `MODE_SEMI`
- `MODE_TREND`
- `MODE_SIDEWAY`
- `MODE_PAUSE`
- `ARM_LIVE`
- `DISARM_LIVE`

No other mutation is in scope.

Explicitly denied:

- process start/stop/restart
- lifecycle start/stop
- direct order open/close
- direct position mutation
- lot-setting mutation
- account switching
- arbitrary API paths
- arbitrary request bodies
- direct MT5 bridge access
- direct remote access to API port 3711
- direct remote access to MT5 bridge port 8765
- Tailscale Funnel
- public Internet exposure

## 3. Existing Canonical Control Paths

M4-A must reuse the current production control paths exactly.

### 3.1 Bot mode

Existing API:

`POST /api/v1/phase7c/bot-mode`

Canonical supported modes are defined in `apps/api/src/services/phase7c-bot-mode.service.ts`:

- `AUTO`
- `TREND`
- `SIDEWAY`
- `SEMI`
- `PAUSE`

The existing route and service remain authoritative for validation, account-mode checks, audit behavior, and mode persistence.

`AUTO` already has an additional provenance constraint: activation is accepted only when the canonical source is exactly `web-control-center`. M4-A must not weaken or bypass this rule. For `MODE_AUTO`, the broker must call the canonical bot-mode endpoint using the canonical source value `web-control-center` so the request enters the same accepted control path as the existing manual Web control center.

For all non-AUTO modes, M4-A must still rely on the canonical route/service for validity and safety-state enforcement. It must not duplicate the account-mode or PAUSE fallback rules.

### 3.2 LIVE ARM / DISARM

Existing API prefix:

`/api/v1/phase7c-live-arm-control`

Existing canonical sequence:

1. `GET /capability`
2. `POST /preflight`
3. `POST /execute`
4. `GET /status`

The canonical implementation in `apps/api/src/services/phase7c-live-arm-control.service.ts` remains the only owner of LIVE ARM/DISARM safety logic.

M4-A must not reimplement, weaken, short-circuit, cache around, or bypass any of these checks. In particular, ARM must still require all conditions currently enforced by the canonical service, including runtime readiness, account validity, LIVE selection/authorization, bridge health and account match, PAUSE state where required, zero XAUUSD positions where required, valid bridge session, elevated task availability, no conflicting request, and fresh preflight verification.

The existing 45-second preflight-token TTL and fresh re-evaluation before execute remain authoritative.

## 4. Network Architecture

Approved topology:

```text
PHONE
  |
  | Tailscale tailnet only
  | HTTPS :8443
  v
M4 SECURE GATEWAY
127.0.0.1:5791
  |
  +-- GET/HEAD read-only UI traffic --> 127.0.0.1:5717
  |
  +-- POST /__m4/action -----------> fixed action broker
                                         |
                                         +--> canonical API 127.0.0.1:3711
```

Non-negotiable exposure rules:

- Tailscale Serve exposes only gateway port `5791` through HTTPS `8443`.
- Port `5717` remains local web origin and is not directly exposed to the tailnet.
- Port `3711` remains localhost-only and is never served directly.
- Port `8765` remains localhost-only and is never served directly.
- Tailscale Funnel is forbidden.
- Router/NAT port-forwarding is forbidden.

## 5. Gateway Model: Action Broker, Not Generic Proxy

The mobile client must never submit an arbitrary upstream URL, HTTP method, or canonical request body.

The only mutation entry point is:

`POST /__m4/action`

Request payload contains a bounded action identifier plus action-specific confirmation fields defined by the gateway contract. The gateway maps the action internally to a fixed canonical endpoint and fixed canonical request shape.

Examples:

```text
MODE_TREND
  -> POST http://127.0.0.1:3711/api/v1/phase7c/bot-mode
  -> { mode: "TREND", source: "mobile-control-center" }

MODE_AUTO
  -> POST http://127.0.0.1:3711/api/v1/phase7c/bot-mode
  -> { mode: "AUTO", source: "web-control-center" }
```

The `MODE_AUTO` source value is intentionally the existing canonical provenance accepted by the current bot-mode service. M4-A does not modify that service contract.

The broker must reject unknown actions fail-closed with no upstream call.

## 6. Identity and Request Trust

M4-A is tailnet-only, but network membership alone is not sufficient authorization for mutations.

The gateway must authorize mutations using the Tailscale Serve identity header `Tailscale-User-Login`. Tailscale Serve removes incoming client-supplied Tailscale identity headers before adding its own identity headers for tailnet Serve traffic. The backend therefore trusts `Tailscale-User-Login` only when the request arrives through the localhost-only Serve proxy path.

Requirements:

- the accepted `Tailscale-User-Login` value must be configured in an explicit operator allowlist;
- mutation requests without `Tailscale-User-Login` are rejected;
- identities not on the explicit allowlist are rejected;
- the browser cannot select or override the trusted identity value;
- gateway production bind remains exactly localhost (`127.0.0.1:5791`);
- direct localhost test mode may use a separate explicit test bypass only in automated tests, never in production defaults;
- production startup must fail closed if the mutation identity allowlist is empty or invalid while mutation capability is enabled.

The gateway must also restrict browser mutation requests to the exact deployment-configured HTTPS Origin. For the currently approved machine/Serve deployment the expected Origin is:

`https://emlvt-dt-1.taila2e32b.ts.net:8443`

The expected Origin is deployment configuration, not client input. Missing or mismatched Origin is rejected for browser mutation requests. Origin checking supplements identity checking; it does not replace it.

## 7. Mutation Confirmation Model

### 7.1 Mode changes

Mode changes use one explicit confirmation step in the mobile UI.

The UI must display:

- current mode;
- requested mode;
- the fact that this changes production bot behavior;
- confirmation action.

The gateway then submits the fixed canonical bot-mode request and returns the canonical result.

### 7.2 DISARM_LIVE

DISARM uses one explicit user confirmation because it is risk-reducing. It still goes through canonical `/preflight` and `/execute` rather than a direct state change.

### 7.3 ARM_LIVE

ARM uses a two-stage flow:

1. user requests ARM preflight;
2. gateway obtains canonical capability/preflight result and presents the canonical blocked/approved state;
3. only an approved, unexpired canonical preflight token may proceed;
4. user explicitly confirms ARM;
5. gateway calls canonical execute with the original token and exact confirmation `ARM_LIVE`;
6. gateway polls canonical status by request ID;
7. UI reports ARMED only when canonical status reaches `PASS` and the final canonical arm state is armed.

A local gateway timeout, network error, or ambiguous response must never be displayed as success.

## 8. Gateway API Contract

### 8.1 Read-only mobile UI

Existing read-only proxy behavior remains unchanged for approved GET/HEAD UI paths.

### 8.2 Action endpoint

`POST /__m4/action`

Base request:

```json
{
  "action": "MODE_TREND"
}
```

For ARM/DISARM flows that require canonical preflight, the gateway must issue a short-lived gateway transaction identifier. The raw canonical preflight token stays server-side and must not be persisted to browser storage or audit logs.

The browser receives only the bounded information necessary to render confirmation and progress.

### 8.3 Status endpoint

A dedicated bounded read-only endpoint may expose the current action transaction state, but it must not become a generic pass-through to arbitrary canonical status URLs. If implemented, it accepts only gateway-generated transaction/request identifiers and resolves only gateway-owned state.

## 9. Server-side Transaction State

ARM/DISARM transactions require temporary server-side state so canonical preflight tokens do not need to be trusted to browser storage.

Transaction state must be:

- in memory by default;
- short-lived;
- keyed by a cryptographically random transaction identifier;
- bound to the authenticated `Tailscale-User-Login` identity;
- bound to the requested action;
- single-use for execute;
- expired no later than the canonical token TTL;
- deleted on successful execute, explicit rejection, or expiry.

The gateway must not extend the validity of a canonical token.

Gateway restart invalidates pending confirmation transactions. The user must perform a new preflight after restart.

## 10. Audit Contract

Every remote mutation attempt must generate a gateway audit event containing only non-secret metadata:

- timestamp
- authenticated Tailscale identity
- remote action
- canonical target identifier, not arbitrary URL input
- observed before-state when available
- canonical HTTP/result classification
- observed after-state when available
- canonical request ID for ARM/DISARM when available
- gateway transaction ID
- success/failure/ambiguous outcome

Never log:

- canonical preflight tokens
- authorization tokens
- cookies
- sensitive environment values
- full secret-bearing headers

Audit write failure behavior:

- risk-increasing actions (`MODE_AUTO`, `MODE_TREND`, `MODE_SIDEWAY`, `MODE_SEMI`, `ARM_LIVE`) fail closed if mandatory audit persistence cannot be established;
- risk-reducing actions (`MODE_PAUSE`, `DISARM_LIVE`) remain available even if the audit sink is degraded, while reporting the audit degradation in the response/log channel.

This mirrors the project's existing safety principle that PAUSE/risk reduction should remain reachable under partial failure.

## 11. Failure Semantics

The gateway must be fail-closed for all risk-increasing actions.

Examples:

- canonical API unreachable -> no success, no retry loop that can duplicate mutation;
- unknown canonical response -> `AMBIGUOUS`, never assumed success;
- preflight expired -> require a new preflight;
- identity missing/mismatch -> 403, no canonical call;
- invalid Origin -> 403, no canonical call;
- unsupported method -> 405;
- unsupported action -> fail-closed with no canonical call;
- upstream timeout -> ambiguous/failure; query canonical read-only state before allowing another user attempt where appropriate;
- gateway restart during pending ARM -> transaction invalidated, new preflight required.

M4-A must not automatically retry canonical mutation POSTs unless idempotence is proven for that exact operation. Read-only status/capability queries may be retried within bounded limits.

## 12. Mobile UI Requirements

The mobile control page may expose only:

- current mode
- current LIVE ARM state
- mode buttons: AUTO / SEMI / TREND / SIDEWAY / PAUSE
- ARM LIVE
- DISARM LIVE
- canonical blocked reasons and progress/status messages

It must not expose:

- lifecycle start/stop
- process restart
- account switch
- lot settings
- order buttons
- position-close buttons
- arbitrary API console

Risk-increasing actions must have visually distinct confirmation treatment from read-only information. ARM must clearly show that PAUSE/canonical safety gates are prerequisites, not suggestions.

## 13. Source Layout

Implementation should remain focused and independently testable.

Expected source areas:

```text
apps/mobile-gateway/server.mjs
apps/mobile-gateway/m4-action-broker.mjs
apps/mobile-gateway/m4-action-broker.test.mjs
apps/mobile-gateway/server.test.mjs
scripts/deploy-mobile-gateway-local.ps1
scripts/preflight-mobile-control-local.ps1
scripts/rollback-mobile-gateway-local.ps1
```

Exact filenames may be adjusted during implementation planning to match current repository structure, but the boundaries must remain:

- HTTP/Tailscale-facing gateway concerns;
- fixed action mapping;
- canonical API client/control flow;
- audit/transaction state;
- deployment/preflight/rollback scripts.

No M4 implementation belongs in MT5 bridge code or strategy logic.

## 14. TDD Acceptance Matrix

Implementation must begin with failing tests proving the desired security contract.

### Action allowlist

- all seven approved actions are recognized;
- unknown action rejected;
- arbitrary URL/path/body cannot be supplied;
- lifecycle actions rejected;
- order/position mutation actions rejected.

### Identity/origin

- missing identity rejected;
- unauthorized identity rejected;
- authorized identity accepted;
- spoofed client identity cannot override the Serve-provided identity;
- invalid/missing Origin rejected for browser mutations;
- production gateway remains localhost-only.

### Mode mapping

- each mode maps to the exact canonical endpoint and mode value;
- AUTO maps to canonical source `web-control-center`;
- no mode request can select a custom source/body/path;
- canonical rejection is propagated as failure, not converted to success.

### ARM/DISARM

- capability/preflight occur before execute;
- execute cannot occur without approved fresh canonical preflight;
- action/token mismatch rejected;
- expired transaction rejected;
- transaction identity mismatch rejected;
- transaction is single-use;
- bridge/session drift rejection from canonical service is propagated;
- ARM success is shown only after canonical PASS status;
- timeout/ambiguous status never reported as ARMED;
- DISARM uses canonical preflight/execute flow.

### HTTP surface

- existing GET/HEAD read-only proxy still works;
- mutation endpoint accepts POST only;
- PUT/PATCH/DELETE/OPTIONS mutation attempts rejected;
- direct `/api` proxying remains blocked;
- direct proxy to 3711/8765 impossible from mobile path.

### Audit

- allowed mutation attempt produces non-secret audit metadata;
- preflight token never appears in audit;
- risk-increasing action fails closed when mandatory audit sink fails;
- PAUSE/DISARM remain risk-reduction reachable under audit degradation.

## 15. CI Gates

Before merge, CI must prove at minimum:

- mobile-gateway unit tests green;
- security/action-broker tests green;
- existing gateway read-only tests remain green;
- API/strategy tests unaffected;
- build/lint/typecheck appropriate to touched packages green;
- no secret material added;
- diff contains no direct exposure of ports 3711 or 8765;
- diff contains no Funnel enablement;
- diff contains no lifecycle/order/position remote mutation path.

## 16. Production Rollout Sequence

Production rollout is a separate gated phase after source merge and CI.

Required order:

1. read-only source/runtime preflight;
2. prove deployed source equals merged accepted source;
3. prove existing Tailscale Serve remains tailnet-only;
4. deploy gateway source only;
5. start/reload only the gateway component through its canonical deployment mechanism;
6. local acceptance against `127.0.0.1:5791` with mutation tests directed at safe conditions;
7. tailnet/mobile acceptance;
8. verify 3711 and 8765 remain unexposed;
9. verify Funnel remains disabled;
10. record final source/runtime attestation.

No rollout step may restart MT5, strategy executors, or Phase 7C lifecycle merely to activate M4.

## 17. Production Mutation Boundaries

During source implementation, tests, CI, review, and merge:

```text
BOT_MUTATION=NONE
MT5_MUTATION=NONE
PHASE7C_RUNTIME_MUTATION=NONE
ORDER_MUTATION=NONE
POSITION_MUTATION=NONE
LIVE_TEST_ORDER=NONE
```

During later M4 production rollout, the only allowed infrastructure mutation is the explicitly approved mobile-gateway deployment/reload and Tailscale Serve configuration if required by that rollout plan.

Actual functional control mutations (mode or ARM/DISARM) are performed only during an explicit operator acceptance step and must use safe, predeclared test state. No order is opened solely to test M4.

## 18. Rollback

Rollback must be possible without touching bot/MT5/Phase7C runtime:

- disable/remove M4 mutation surface;
- restore previous read-only gateway source/config;
- preserve tailnet-only read-only access when safe;
- do not restart API/MT5/strategy processes as part of gateway rollback;
- verify ports 3711/8765 remain localhost-only;
- verify Funnel remains disabled.

If control behavior becomes ambiguous, safest operational fallback is to remove the remote mutation surface and continue using the canonical local Web control center.

## 19. Non-goals

M4-A does not introduce:

- remote lifecycle management;
- trading commands;
- copy trading;
- account switching;
- lot/risk-setting editing;
- mobile strategy configuration;
- public web access;
- a replacement for existing Web/Telegram control semantics;
- a new ARM implementation.

## 20. Definition of Done

M4-A is complete only when all of the following are proven:

1. Phone can use the seven approved actions through Tailscale HTTPS only.
2. No arbitrary upstream API request can be formed by the client.
3. `Tailscale-User-Login` allowlist and exact Origin checks are enforced.
4. AUTO still satisfies existing canonical provenance enforcement without weakening API rules.
5. ARM/DISARM traverse the full canonical capability/preflight/execute/status flow.
6. ARM cannot bypass PAUSE or any other canonical safety gate.
7. No process/lifecycle/order/position/account/lot mutation is remotely reachable.
8. Ports 3711 and 8765 remain localhost-only.
9. Funnel remains disabled.
10. Audit contains sufficient operator/action/outcome provenance without secrets.
11. TDD/CI pass.
12. Merged source, deployed source, and runtime attestation match.
13. Rollback is tested and does not require bot/MT5/Phase7C restart.

## 21. Spec Self-review Record

- Placeholder scan: PASS — no TBD/TODO requirements remain.
- Internal consistency: PASS — network exposure, action allowlist, canonical control ownership, and rollback constraints align.
- Scope check: PASS — one bounded subsystem, suitable for one implementation plan.
- Ambiguity check: PASS — trusted identity header, expected Origin, ARM transaction handling, and canonical ownership are explicit.
