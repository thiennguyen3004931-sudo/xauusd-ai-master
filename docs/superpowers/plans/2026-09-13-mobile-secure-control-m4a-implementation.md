# M4-A Mobile Secure Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tailnet-only mobile action broker that allows exactly AUTO / SEMI / TREND / SIDEWAY / PAUSE and canonical LIVE ARM / DISARM from the existing Phase7C mobile page without exposing API 3711, MT5 bridge 8765, lifecycle controls, or arbitrary mutation paths.

**Architecture:** Add a new `@xauusd/mobile-gateway` workspace that preserves the existing M2/M3 read-only proxy on `127.0.0.1:5791` and introduces only bounded `/__m4/*` endpoints. The gateway authenticates `Tailscale-User-Login`, validates the exact HTTPS Origin, maps seven fixed actions to localhost-only canonical Phase7C APIs, keeps ARM/DISARM preflight tokens server-side, and records non-secret audit events. The existing React mobile page calls same-origin `/__m4/*`; it never calls `127.0.0.1:3711` directly for mutation.

**Tech Stack:** Node.js 24 runtime for Windows gateway, CommonJS runtime modules, Vitest 2.1.x, React 19, MUI 7, TanStack Query 5, TypeScript 6 for Web, pnpm 10.18.0, Turbo 2.x, PowerShell 5+/7 for local deployment scripts, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-13-mobile-secure-control-m4a-design.md`

## Global Constraints

- Approved mutation allowlist is exactly `MODE_AUTO`, `MODE_SEMI`, `MODE_TREND`, `MODE_SIDEWAY`, `MODE_PAUSE`, `ARM_LIVE`, `DISARM_LIVE`.
- `AUTO` must reach canonical bot-mode logic with source exactly `web-control-center`; do not weaken `isPhase7CAutoActivationSourceAllowed()`.
- Other mode actions use fixed source `mobile-control-center`; client input may not choose source/path/body.
- LIVE ARM/DISARM must reuse `/api/v1/phase7c-live-arm-control/{capability,preflight,execute,status}` and never reimplement canonical safety logic.
- ARM remains gated by the canonical PAUSE/runtime/account/bridge/authorization/zero-position/session checks and fresh canonical re-evaluation.
- Canonical preflight tokens never leave gateway memory and never appear in browser storage, audit, response bodies, or logs.
- Mutation authorization requires the exact Tailscale Serve header `Tailscale-User-Login` and the deployment-configured exact Origin.
- Gateway production bind remains exactly `127.0.0.1:5791`.
- Web remains `127.0.0.1:5717`; API remains `127.0.0.1:3711`; MT5 bridge remains `127.0.0.1:8765`.
- Tailscale Funnel and router/NAT port forwarding are forbidden.
- Remote lifecycle start/stop/restart, account switch, lot settings, order entry/close, position mutation, and arbitrary API proxying are forbidden.
- Source implementation/CI/review must keep `BOT_MUTATION=NONE`, `MT5_MUTATION=NONE`, `PHASE7C_RUNTIME_MUTATION=NONE`, `ORDER_MUTATION=NONE`, `POSITION_MUTATION=NONE`, `LIVE_TEST_ORDER=NONE`.
- Production rollout is a separate gated phase after merge; only the mobile gateway task/source/config may be mutated during rollout.
- No order is opened solely to test M4-A.

## File Structure

Create a focused gateway workspace rather than placing security logic in one large `gateway.js`.

- `apps/mobile-gateway/package.json` — workspace scripts and Vitest dependency.
- `apps/mobile-gateway/gateway.js` — production entry point; loads config and starts localhost HTTP server.
- `apps/mobile-gateway/server.cjs` — HTTP routing, identity/origin enforcement, existing GET/HEAD read-only proxy, M4 endpoints.
- `apps/mobile-gateway/m4-contract.cjs` — immutable action enum, risk classification, canonical mode mappings, strict request parsing.
- `apps/mobile-gateway/canonical-client.cjs` — fixed localhost API calls only; no caller-provided upstream URL/method.
- `apps/mobile-gateway/transaction-store.cjs` — in-memory ARM/DISARM transaction lifecycle and TTL enforcement.
- `apps/mobile-gateway/audit.cjs` — append-only JSONL audit with secret-field exclusion.
- `apps/mobile-gateway/m4-action-broker.cjs` — mode and ARM/DISARM orchestration; dependency-injected client/audit/store for tests.
- `apps/mobile-gateway/gateway.config.example.json` — non-secret config schema only.
- `apps/mobile-gateway/test/*.test.mjs` — action, ARM transaction, HTTP surface, audit, and M2 compatibility tests.
- `apps/web/src/mobile-m4-control.ts` — same-origin browser client and TypeScript response types.
- `apps/web/src/mobile-m4-control.test.ts` — pure request/response/client contract tests with injected fetch.
- `apps/web/src/pages/Phase7CMobileReadOnlyPage.tsx` — add bounded mode + ARM/DISARM UI to existing mobile page.
- `apps/web/package.json` / `pnpm-lock.yaml` — add Web Vitest test script/dependency if not already present and register the new workspace importer.
- `scripts/preflight-phase7c-mobile-m4a-local.ps1` — read-only production preflight.
- `scripts/deploy-phase7c-mobile-m4a-local.ps1` — bounded gateway-only deployment/handoff.
- `scripts/rollback-phase7c-mobile-m4a-local.ps1` — restore previous gateway bundle only.
- `scripts/test-phase7c-mobile-m4a-source-contract.mjs` — static forbidden-surface/security assertions.
- `.github/workflows/phase7c-mobile-secure-control-m4a-ci.yml` — dedicated tests/build/security contract.

---

### Task 1: Canonicalize the existing mobile gateway as a tested workspace

**Files:**
- Create: `apps/mobile-gateway/package.json`
- Create: `apps/mobile-gateway/gateway.js`
- Create: `apps/mobile-gateway/server.cjs`
- Create: `apps/mobile-gateway/gateway.config.example.json`
- Create: `apps/mobile-gateway/test/server-readonly.test.mjs`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: config `{ listenHost, listenPort, webOrigin, apiOrigin, allowedUsers, allowedOrigin, auditPath }`.
- Produces: `createMobileGatewayServer({ config, broker, fetchImpl })` and the existing M2 routes/semantics: `GET /__m2/health`, GET/HEAD web proxy, app-route identity requirement, non-read-only methods denied unless explicitly owned by M4.

- [ ] **Step 1: Add workspace package with tests but no production implementation yet**

Create `apps/mobile-gateway/package.json`:

```json
{
  "name": "@xauusd/mobile-gateway",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "node --check gateway.js && node --check server.cjs",
    "lint": "node --check gateway.js && node --check server.cjs",
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^2.1.9"
  }
}
```

Run `pnpm install --lockfile-only` so `pnpm-lock.yaml` contains an `apps/mobile-gateway` importer.

- [ ] **Step 2: Write RED tests for the accepted M2/M3 behavior**

Use ephemeral upstream servers and `createMobileGatewayServer()` in `server-readonly.test.mjs`. Require:

```js
expect(await request("GET", "/__m2/health")).toMatchObject({ status: 200 });
expect(await request("GET", "/phase7c-mobile", trustedHeaders)).toMatchObject({ status: 200 });
expect(await request("HEAD", "/phase7c-mobile", trustedHeaders)).toMatchObject({ status: 200 });
expect(await request("GET", "/phase7c-mobile")).toMatchObject({ status: 403 });
expect(await request("POST", "/phase7c-mobile", trustedHeaders)).toMatchObject({ status: 405 });
```

Also assert `server.address().address === "127.0.0.1"` when using production config.

- [ ] **Step 3: Run RED**

```bash
pnpm --filter @xauusd/mobile-gateway test
```

Expected: FAIL because `server.cjs` / `createMobileGatewayServer` does not exist yet.

- [ ] **Step 4: Implement only the read-only baseline**

`server.cjs` must:

```js
const http = require("node:http");

function isReadOnly(method) {
  return method === "GET" || method === "HEAD";
}

function identity(req) {
  return String(req.headers["tailscale-user-login"] ?? "").trim().toLowerCase();
}
```

Implement `/__m2/health` locally; proxy approved GET/HEAD requests to `webOrigin`; require configured identity for proxied application routes; reject other methods with 405. Strip hop-by-hop headers and do not forward Tailscale identity headers to the Web upstream.

`gateway.js` loads machine config from:

```text
C:\ProgramData\XAUUSD-AI-MASTER\mobile-readonly-gateway\gateway.config.json
```

and refuses production startup if `listenHost !== "127.0.0.1"`.

- [ ] **Step 5: Run GREEN and syntax checks**

```bash
pnpm --filter @xauusd/mobile-gateway test
pnpm --filter @xauusd/mobile-gateway build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile-gateway pnpm-lock.yaml
git commit -m "feat: canonicalize mobile gateway source"
```

---

### Task 2: Add the fixed M4 action contract and canonical localhost client

**Files:**
- Create: `apps/mobile-gateway/m4-contract.cjs`
- Create: `apps/mobile-gateway/canonical-client.cjs`
- Create: `apps/mobile-gateway/test/m4-contract.test.mjs`
- Create: `apps/mobile-gateway/test/canonical-client.test.mjs`
- Modify: `apps/mobile-gateway/package.json` build/lint scripts to syntax-check new runtime files.

**Interfaces:**
- Produces `REMOTE_ACTIONS`, `parseModeActionBody(input)`, `parseArmBody(input)`, `isRiskIncreasing(action)`.
- Produces `createCanonicalClient({ apiOrigin, fetchImpl, timeoutMs })` with only fixed methods: `getBotMode`, `setBotMode`, `getArmCapability`, `createArmPreflight`, `executeArm`, `getArmStatus`.

- [ ] **Step 1: Write RED action allowlist tests**

Require exact actions:

```js
[
  "MODE_AUTO",
  "MODE_SEMI",
  "MODE_TREND",
  "MODE_SIDEWAY",
  "MODE_PAUSE",
  "ARM_LIVE",
  "DISARM_LIVE"
]
```

Reject examples `LIFECYCLE_START`, `ORDER_BUY`, `POSITION_CLOSE`, `LOT_SET`, `ACCOUNT_SWITCH`, and bodies containing `url`, `path`, `method`, `source`, or `body` fields.

- [ ] **Step 2: Write RED canonical-client mapping tests**

Inject `fetchImpl` and capture calls. Require exactly:

```text
MODE endpoint: POST http://127.0.0.1:3711/api/v1/phase7c/bot-mode
ARM capability: GET http://127.0.0.1:3711/api/v1/phase7c-live-arm-control/capability
ARM preflight: POST http://127.0.0.1:3711/api/v1/phase7c-live-arm-control/preflight
ARM execute: POST http://127.0.0.1:3711/api/v1/phase7c-live-arm-control/execute
ARM status: GET http://127.0.0.1:3711/api/v1/phase7c-live-arm-control/status?requestId=<encoded>
```

Mode bodies must be fixed:

```js
MODE_AUTO  -> { mode: "AUTO", source: "web-control-center" }
MODE_SEMI  -> { mode: "SEMI", source: "mobile-control-center" }
MODE_TREND -> { mode: "TREND", source: "mobile-control-center" }
MODE_SIDEWAY -> { mode: "SIDEWAY", source: "mobile-control-center" }
MODE_PAUSE -> { mode: "PAUSE", source: "mobile-control-center" }
```

- [ ] **Step 3: Run RED**

```bash
pnpm --filter @xauusd/mobile-gateway test
```

Expected: contract/client tests fail because modules do not exist.

- [ ] **Step 4: Implement strict contract parser**

Use an immutable map; reject unknown keys rather than ignoring them. Mode execute body must be exactly:

```js
{ action: "MODE_TREND", confirmation: "MODE_TREND" }
```

ARM/DISARM uses:

```js
{ action: "ARM_LIVE", phase: "PREFLIGHT" }
{ action: "ARM_LIVE", phase: "EXECUTE", transactionId: "...", confirmation: "ARM_LIVE" }
```

Use the same shape for DISARM. `confirmation` must exactly equal `action` on execute.

- [ ] **Step 5: Implement canonical client with no generic request method exported**

Internally use `fetch()` with `AbortSignal.timeout(timeoutMs)`; never retry mutation POSTs. Parse non-2xx JSON errors and throw an error carrying `status` and bounded canonical message.

- [ ] **Step 6: Run GREEN**

```bash
pnpm --filter @xauusd/mobile-gateway test
pnpm --filter @xauusd/mobile-gateway build
```

- [ ] **Step 7: Commit**

```bash
git add apps/mobile-gateway
git commit -m "feat: add fixed M4 action contract"
```

---

### Task 3: Implement server-side ARM/DISARM transactions and broker orchestration

**Files:**
- Create: `apps/mobile-gateway/transaction-store.cjs`
- Create: `apps/mobile-gateway/m4-action-broker.cjs`
- Create: `apps/mobile-gateway/test/arm-transactions.test.mjs`
- Create: `apps/mobile-gateway/test/mode-actions.test.mjs`

**Interfaces:**
- `createTransactionStore({ now, randomUUID })` produces `create`, `getForExecute`, `markExecuting`, `setRequestId`, `readStatus`, `deleteExpired`.
- `createM4ActionBroker({ canonical, transactions, audit, now })` produces `getState(identity)`, `handleAction(identity, body)`, `getTransactionStatus(identity, transactionId)`.

- [ ] **Step 1: Write RED mode broker tests**

Require every mode action to call only `canonical.setBotMode()` with the fixed mapping. Canonical 400/403/409/5xx must return failure/ambiguous classification, never success.

Require `MODE_AUTO`, `MODE_TREND`, `MODE_SIDEWAY`, `MODE_SEMI` to be classified risk-increasing and `MODE_PAUSE` risk-reducing.

- [ ] **Step 2: Write RED ARM transaction tests**

For `phase=PREFLIGHT`, fake canonical returns:

```js
{
  approved: true,
  action: "ARM_LIVE",
  bridgeSessionId: "session-1",
  preflightToken: "SECRET-CANONICAL-TOKEN",
  expiresAt: now + 45000,
  checks: { botPaused: true },
  blockedBy: []
}
```

Require browser response to contain a random `transactionId` and sanitized preflight fields but not `preflightToken`.

Require store record to bind:

```js
{
  identity: "thiennguyen300493@gmail.com",
  action: "ARM_LIVE",
  canonicalToken: "SECRET-CANONICAL-TOKEN",
  expiresAt: now + 45000,
  consumed: false
}
```

- [ ] **Step 3: Test execute gates**

Require execute rejection for expired transaction, wrong identity, wrong action, wrong confirmation, missing transaction, or second use. No canonical execute call may occur for any rejection.

On valid execute, call canonical exactly once with:

```js
{
  action: "ARM_LIVE",
  preflightToken: "SECRET-CANONICAL-TOKEN",
  confirmation: "ARM_LIVE"
}
```

Record canonical `requestId`; mark preflight token consumed immediately.

- [ ] **Step 4: Test status semantics**

`getTransactionStatus()` may call canonical `getArmStatus(requestId)` only for a gateway-owned transaction bound to the same identity. Require:

- `RUNNING` -> UI state `RUNNING`;
- canonical `PASS` + `finalArmStatus="ARMED"` for ARM -> UI success;
- canonical `PASS` + wrong final ARM state -> `AMBIGUOUS`, not success;
- canonical `FAIL` -> failure;
- timeout/network error -> `AMBIGUOUS`.

For DISARM, success requires canonical PASS and final state not armed/equals `DISARMED` according to canonical payload.

- [ ] **Step 5: Run RED**

```bash
pnpm --filter @xauusd/mobile-gateway test
```

- [ ] **Step 6: Implement transaction store**

Use `crypto.randomUUID()`. Pending preflight expiry must be `Math.min(canonicalExpiresAt, now + 45_000)`. Gateway restart naturally clears the in-memory `Map`. Do not persist canonical preflight tokens.

After canonical execute, retain only non-secret status metadata for bounded polling, with a maximum post-execute status retention of 10 minutes.

- [ ] **Step 7: Implement broker**

Before ARM/DISARM preflight, call canonical capability for display/current state and canonical preflight for the requested action. Do not locally infer approval. Execute only using the canonical token stored in the transaction.

- [ ] **Step 8: Run GREEN and commit**

```bash
pnpm --filter @xauusd/mobile-gateway test
pnpm --filter @xauusd/mobile-gateway build
git add apps/mobile-gateway
git commit -m "feat: add canonical mobile ARM broker"
```

---

### Task 4: Add append-only audit with safety-first failure semantics

**Files:**
- Create: `apps/mobile-gateway/audit.cjs`
- Create: `apps/mobile-gateway/test/audit.test.mjs`
- Modify: `apps/mobile-gateway/m4-action-broker.cjs`

**Interfaces:**
- `createAuditSink({ path, appendFileSync, mkdirSync })` produces `append(event)`.
- Broker emits phases `ATTEMPT` and `RESULT` with only non-secret metadata.

- [ ] **Step 1: Write RED audit-shape tests**

Audit record must include:

```js
{
  version: 1,
  timestamp: expect.any(String),
  identity: "thiennguyen300493@gmail.com",
  action: "MODE_TREND",
  phase: "ATTEMPT",
  transactionId: null,
  canonicalTarget: "PHASE7C_BOT_MODE"
}
```

Recursively stringify each audit line and assert it does not contain `preflightToken`, `canonicalToken`, cookies, authorization headers, or the fake token string.

- [ ] **Step 2: Write RED fail-closed/degraded tests**

Inject an audit sink whose `append()` throws.

Require no canonical mutation for:

```text
MODE_AUTO
MODE_TREND
MODE_SIDEWAY
MODE_SEMI
ARM_LIVE execute
```

Require `MODE_PAUSE` and `DISARM_LIVE` to continue through canonical control, returning `auditDegraded=true`.

- [ ] **Step 3: Implement append-only JSONL audit**

Create parent directory, append exactly one JSON object plus newline. Audit path comes from deployment config. Do not rotate/delete from request path; retention is an operator/deployment concern outside M4 request handling.

- [ ] **Step 4: Integrate broker ordering**

For risk-increasing execute:

```text
audit ATTEMPT must succeed
-> canonical mutation
-> best-effort RESULT audit
```

For PAUSE/DISARM:

```text
attempt audit best-effort
-> canonical risk-reducing mutation regardless of audit failure
-> best-effort RESULT audit
```

- [ ] **Step 5: Run GREEN and commit**

```bash
pnpm --filter @xauusd/mobile-gateway test
git add apps/mobile-gateway
git commit -m "feat: audit M4 remote control attempts"
```

---

### Task 5: Expose only bounded M4 HTTP endpoints with identity and Origin gates

**Files:**
- Modify: `apps/mobile-gateway/server.cjs`
- Modify: `apps/mobile-gateway/gateway.js`
- Create: `apps/mobile-gateway/test/m4-http.test.mjs`

**Interfaces:**
- `GET /__m4/state` — authenticated read-only combined mode/ARM state.
- `POST /__m4/action` — only mutation endpoint.
- `GET /__m4/status?transactionId=<gateway-id>` — authenticated bounded transaction status.

- [ ] **Step 1: Write RED identity/origin tests**

Use config:

```js
{
  allowedUsers: ["thiennguyen300493@gmail.com"],
  allowedOrigin: "https://emlvt-dt-1.taila2e32b.ts.net:8443"
}
```

Require mutation 403 when `Tailscale-User-Login` missing, unauthorized, or Origin missing/mismatched. Require authorized identity + exact Origin to reach broker.

Require production config validation to fail if `allowedUsers` empty, `allowedOrigin` is not HTTPS, `listenHost` not `127.0.0.1`, `apiOrigin` not exactly loopback, or `webOrigin` not loopback.

- [ ] **Step 2: Write RED method/surface tests**

Require:

```text
POST /__m4/action -> allowed only after auth/origin
GET /__m4/action -> 405
PUT/PATCH/DELETE/OPTIONS /__m4/action -> 405
POST /api/v1/... -> 405; never proxied
GET /__m4/state -> authenticated bounded state only
GET /__m4/status without valid gateway transaction -> 404/403
```

Also prove raw input like `{ action:"MODE_TREND", url:"http://127.0.0.1:8765" }` is rejected before broker/canonical calls.

- [ ] **Step 3: Add strict JSON body parser**

Limit body to 8 KiB. Require `Content-Type: application/json`. Reject malformed JSON and oversized input with 400/413. Do not accept form/query-based mutation.

- [ ] **Step 4: Wire server to broker**

`gateway.js` constructs config, canonical client, transaction store, audit sink, and broker exactly once, then starts server. No API token or secret is introduced; canonical API is reachable only through localhost.

- [ ] **Step 5: Prove M2 regression remains GREEN**

```bash
pnpm --filter @xauusd/mobile-gateway test
pnpm --filter @xauusd/mobile-gateway build
```

Both `server-readonly.test.mjs` and M4 HTTP tests must pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile-gateway
git commit -m "feat: expose bounded M4 gateway endpoints"
```

---

### Task 6: Add same-origin M4 Web client and mobile controls

**Files:**
- Create: `apps/web/src/mobile-m4-control.ts`
- Create: `apps/web/src/mobile-m4-control.test.ts`
- Modify: `apps/web/src/pages/Phase7CMobileReadOnlyPage.tsx`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Browser client exports `getMobileM4State`, `executeMobileMode`, `preflightMobileArm`, `executeMobileArm`, `getMobileArmStatus`.
- All URLs are same-origin relative `/__m4/...`; no `CONTROL_DIRECT`, `VITE_API_BASE_URL`, or `127.0.0.1:3711` mutation fallback.

- [ ] **Step 1: Add Web Vitest script and RED client tests**

Add to Web devDependencies/scripts:

```json
"test": "vitest run",
"vitest": "^2.1.9"
```

Inject fetch and assert exact requests:

```text
GET /__m4/state
POST /__m4/action
GET /__m4/status?transactionId=<encoded>
```

Mode request body:

```json
{ "action": "MODE_TREND", "confirmation": "MODE_TREND" }
```

ARM preflight:

```json
{ "action": "ARM_LIVE", "phase": "PREFLIGHT" }
```

ARM execute:

```json
{
  "action": "ARM_LIVE",
  "phase": "EXECUTE",
  "transactionId": "gateway-transaction",
  "confirmation": "ARM_LIVE"
}
```

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @xauusd/web test
```

Expected: FAIL because mobile M4 client does not exist.

- [ ] **Step 3: Implement same-origin client**

Use a small `readJson` helper. Never fallback to direct API for POST. Surface canonical/gateway error message and HTTP status to the UI.

- [ ] **Step 4: Extend the existing mobile page, not the desktop control center**

Preserve all current read-only cards. Replace the top `MOBILE READ ONLY` label with a truthful control status after M4 state loads, and add one `MobileCard title="ĐIỀU KHIỂN AN TOÀN"` containing only:

```text
AUTO  SEMI  TREND  SIDEWAY  PAUSE
ARM LIVE / DISARM LIVE
```

No lifecycle/order/position/lot/account-switch controls.

Mode behavior:

```ts
if (!window.confirm(`Xác nhận chuyển MODE từ ${currentMode} sang ${targetMode}?`)) return;
await executeMobileMode(targetAction);
```

ARM behavior:

1. `KIỂM TRA ARM LIVE` calls preflight and displays canonical `checks/blockedBy`.
2. `ARM LIVE` enabled only with approved unexpired gateway transaction.
3. User confirms with the same safety wording used by local control semantics: bot must be PAUSE; ARM does not enable AUTO and does not send an order.
4. Poll `/__m4/status` until PASS/FAIL; ambiguous/timeouts display warning, never ARMED success.

DISARM behavior:

1. one user confirmation;
2. request DISARM preflight;
3. if approved, immediately execute the returned gateway transaction;
4. poll status to canonical completion.

- [ ] **Step 5: Keep risk-increasing actions visually distinct**

Use existing MUI theme colors. ARM and active-mode confirmations use warning/contained treatment; PAUSE/DISARM are clearly labeled risk-reducing. Do not add unrelated redesign.

- [ ] **Step 6: Run GREEN/build**

```bash
pnpm --filter @xauusd/web test
pnpm --filter @xauusd/web build
```

- [ ] **Step 7: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat: add M4 controls to mobile page"
```

---

### Task 7: Add read-only preflight, bounded deployment, and rollback scripts

**Files:**
- Create: `scripts/preflight-phase7c-mobile-m4a-local.ps1`
- Create: `scripts/deploy-phase7c-mobile-m4a-local.ps1`
- Create: `scripts/rollback-phase7c-mobile-m4a-local.ps1`
- Create: `scripts/test-phase7c-mobile-m4a-source-contract.mjs`

**Interfaces:**
- Preflight is read-only and prints machine/source/runtime gates.
- Deploy mutates only gateway files/config and the existing `\XAUUSD-AI-MASTER\Phase7C-Mobile-Readonly-Gateway` runtime instance.
- Rollback restores the captured prior gateway bundle and reloads only that task.

- [ ] **Step 1: Write RED source-contract test before scripts**

`test-phase7c-mobile-m4a-source-contract.mjs` reads gateway/Web/scripts and fails unless all approved actions are present and these forbidden patterns are absent from remote-control implementation:

```text
/lifecycle/start
/lifecycle/stop
/api/v1/mt5/order
position close mutation
funnel on
0.0.0.0:3711
0.0.0.0:8765
```

It also requires `Tailscale-User-Login`, exact mode actions, `/__m4/action`, and canonical ARM prefix.

- [ ] **Step 2: Implement read-only preflight**

Require output invariants:

```text
READ_ONLY=TRUE
HTTP_METHODS=GET_ONLY
GIT_MUTATION=NONE
TASK_MUTATION=NONE
PROCESS_MUTATION=NONE
SERVE_MUTATION=NONE
FUNNEL_MUTATION=NONE
MODE_MUTATION=NONE
ARM_MUTATION=NONE
ORDER_MUTATION=NONE
POSITION_MUTATION=NONE
LIVE_TEST_ORDER=NONE
```

Checks must include:

- local repository clean and at explicit `-ExpectedCommit`;
- merged-source file hashes computed and printed;
- existing task present, SYSTEM principal, `AtStartup`, command still Node + ProgramData `gateway.js`;
- current live gateway health 200;
- current first-rollout gateway SHA256 equals known accepted M3 baseline `F4DC53D3E22738D26C762C78687ADBC4D20AD3DFAE8397C3C3A981884E8DB79A` unless caller explicitly supplies an already-M4 accepted hash;
- Tailscale backend Running/Online and Serve `8443 -> 127.0.0.1:5791 (tailnet only)`;
- Funnel not public;
- ports 3711/5717/5791/8765 have zero non-loopback listeners;
- API/Web/gateway read-only health routes reachable;
- no open production mutation is executed by preflight.

- [ ] **Step 3: Implement bounded deploy script**

Parameters must include `-ExpectedCommit`, `-AllowedUser`, and `-AllowedOrigin`. Before mutation it reruns/embeds all preflight gates.

Deployment sequence:

```text
backup current ProgramData gateway bundle + SHA manifest
copy accepted apps/mobile-gateway runtime files to staging dir
write non-secret gateway.config.json to staging
syntax-check staged gateway with node --check
stop exact mobile gateway Scheduled Task
atomic directory/file swap into ProgramData gateway dir
start exact mobile gateway Scheduled Task
verify new PID is SYSTEM and bind is 127.0.0.1:5791
verify /__m2/health=200
verify direct no-identity app GET=403
verify non-M4 POST remains 405
verify Serve unchanged and Funnel false
verify 3711/5717/5791/8765 still loopback-only
```

Do not restart Tailscale, API, MT5, lifecycle broker, executors, or Windows.

- [ ] **Step 4: Implement rollback**

Rollback stops only the exact gateway task, restores the backup bundle/config, starts only the exact gateway task, and re-runs M2/M3 safety checks. It must not run `Restart-Service Tailscale`, `Restart-Computer`, lifecycle controls, ARM, or mode mutation.

- [ ] **Step 5: Run static source contract**

```bash
node scripts/test-phase7c-mobile-m4a-source-contract.mjs
```

Expected only after scripts/source exist: `PHASE7C_MOBILE_M4A_SOURCE_CONTRACT=PASS`.

- [ ] **Step 6: Commit**

```bash
git add scripts
git commit -m "feat: add bounded M4 gateway rollout scripts"
```

---

### Task 8: Add dedicated CI and complete source verification

**Files:**
- Create: `.github/workflows/phase7c-mobile-secure-control-m4a-ci.yml`
- Review: all M4-A touched files.

**Interfaces:**
- CI is source-only; it performs no production/network mutation.

- [ ] **Step 1: Add path-scoped workflow**

Trigger on pull requests to `main` and feature branches when M4 files change. Use `permissions: contents: read`, pnpm 10.18.0, Node 24 for gateway tests and Node 22/24 compatible Web build.

Required jobs/commands:

```bash
pnpm install --frozen-lockfile
pnpm --filter @xauusd/mobile-gateway test
pnpm --filter @xauusd/mobile-gateway build
pnpm --filter @xauusd/web test
pnpm --filter @xauusd/web build
node scripts/test-phase7c-mobile-m4a-source-contract.mjs
```

Also build API to prove canonical interfaces still compile even though API source should not change:

```bash
pnpm --filter @xauusd/api build
```

- [ ] **Step 2: Run full local/source verification**

```bash
pnpm --filter @xauusd/mobile-gateway test
pnpm --filter @xauusd/mobile-gateway build
pnpm --filter @xauusd/web test
pnpm --filter @xauusd/web build
pnpm --filter @xauusd/api build
node scripts/test-phase7c-mobile-m4a-source-contract.mjs
```

Expected: all GREEN.

- [ ] **Step 3: Scope diff review**

Reject implementation if diff touches strategy engine, MT5 bridge logic, Phase7C ARM service safety checks, lifecycle service, account switching, lot settings, order/position execution, or Tailscale Funnel configuration.

The only allowed API files are **none** by default. If implementation discovers an API change is necessary, stop and return to design review rather than silently expanding scope.

- [ ] **Step 4: Secret scan / route review**

Confirm no preflight token, auth token, cookies, personal credentials, or raw secret headers are committed. Machine operator email belongs only in deployment parameters/runtime config, not source defaults; example config uses `operator@example.com`.

- [ ] **Step 5: Commit CI**

```bash
git add .github/workflows/phase7c-mobile-secure-control-m4a-ci.yml
git commit -m "ci: verify M4 mobile secure control"
```

---

### Task 9: PR review gate before any production mutation

**Files:**
- No new implementation files unless review finds a defect.

- [ ] **Step 1: Compare feature branch with current `main`**

Record base/head SHAs and changed filenames. Require every file to map to this plan/spec.

- [ ] **Step 2: Open PR with explicit safety statement**

PR body must state:

```text
BOT_MUTATION=NONE
MT5_MUTATION=NONE
PHASE7C_RUNTIME_MUTATION=NONE
ORDER_MUTATION=NONE
POSITION_MUTATION=NONE
LIVE_TEST_ORDER=NONE
3711_REMOTE_EXPOSURE=NONE
8765_REMOTE_EXPOSURE=NONE
FUNNEL=OFF/UNCHANGED
```

- [ ] **Step 3: Require CI GREEN and review patches**

Review especially:

- action parser cannot carry arbitrary URL/path/body;
- `MODE_AUTO` provenance is exactly `web-control-center`;
- ARM token never exits memory;
- identity/origin fail closed;
- audit failure semantics match risk direction;
- no retry of canonical mutation POSTs;
- gateway remains localhost-only;
- existing M2 read-only behavior remains tested.

- [ ] **Step 4: Merge only after all gates pass**

After merge, record accepted `main` commit and tree. Do not deploy automatically from CI.

---

### Task 10: Post-merge production preflight and bounded M4-A rollout

**Files:**
- Execute merged scripts only after explicit operator rollout approval.

**Interfaces:**
- Consumes accepted merged commit and currently running M3 gateway.
- Produces M4 gateway runtime while keeping bot/MT5/Phase7C lifecycle untouched.

- [ ] **Step 1: Sync local production source to accepted `main` and prove clean exact source**

Run the merged read-only preflight with `-ExpectedCommit <accepted-main-sha>`. Stop on any mismatch; do not repair unrelated runtime drift in this rollout.

- [ ] **Step 2: Capture pre-rollout runtime evidence**

Record current gateway PID/owner/hash, task definition/state, Serve/Funnel status, ports 3711/5717/5791/8765, bot mode/ARM status read-only, and open XAUUSD positions read-only. Position state is evidence only; no order/position mutation is permitted.

- [ ] **Step 3: Deploy gateway only**

Invoke the bounded deploy script with:

```text
AllowedUser=thiennguyen300493@gmail.com
AllowedOrigin=https://emlvt-dt-1.taila2e32b.ts.net:8443
```

Mutation scope must be exactly gateway files/config + exact mobile-gateway Scheduled Task stop/start.

- [ ] **Step 4: Local non-mutating security acceptance first**

Verify health, identity rejection, invalid Origin rejection, unknown action rejection, forbidden method rejection, Serve/Funnel, and port isolation without executing mode or ARM mutation.

- [ ] **Step 5: Mobile read-only + control-page rendering acceptance**

Open `https://emlvt-dt-1.taila2e32b.ts.net:8443/phase7c-mobile`; verify current mode/ARM state renders and only approved controls exist.

- [ ] **Step 6: Explicit functional acceptance using safe state**

Functional mutation tests require a separately announced operator acceptance window. Use only safe canonical actions; never create an order solely for testing.

Preferred sequence when runtime conditions permit:

```text
MODE_PAUSE -> verify canonical mode PAUSE
DISARM_LIVE if currently armed -> verify canonical DISARM PASS
ARM preflight only -> verify blocked/approved reasons and token remains server-side
ARM execute only if operator explicitly approves and canonical preflight is PASS
```

Do not test AUTO/TREND/SIDEWAY/SEMI in a state where they could open a new trade unless entry is otherwise safely blocked by the canonical environment. If such proof cannot be made, verify their mapping in TDD/CI and defer live functional mutation.

- [ ] **Step 7: Final attestation**

Require:

```text
M4_ALLOWED_ACTIONS=7
DIRECT_3711_REMOTE_EXPOSURE=FALSE
DIRECT_8765_REMOTE_EXPOSURE=FALSE
PUBLIC_FUNNEL_ACTIVE=FALSE
GATEWAY_BIND=127.0.0.1:5791
TAILNET_ONLY=TRUE
BOT_PROCESS_MUTATION=NONE
MT5_PROCESS_MUTATION=NONE
PHASE7C_LIFECYCLE_MUTATION=NONE
LIVE_TEST_ORDER=NONE
PHONE_M4_ACCEPTANCE=PASS
```

If any gate fails or behavior is ambiguous, run gateway-only rollback and restore M3 read-only operation.
