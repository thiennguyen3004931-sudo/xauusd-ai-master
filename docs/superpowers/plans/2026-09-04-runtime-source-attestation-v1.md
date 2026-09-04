# P1 Runtime Source Attestation V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only runtime provenance layer that proves whether API, lifecycle broker, supervisor, Trend, Sideway, Telegram, and regime-notifier are running from the exact canonical deployment identity, without changing AUTO/ARM/lifecycle/order behavior.

**Architecture:** A PowerShell helper creates or reuses one atomic deployment manifest after the existing exact-source guards and writes PID-bound attestations at existing canonical launch boundaries. The Node API writes its own attestation from actual `process.pid`, aggregates manifest/component/PID/liveness/launcher-hash evidence into `EXACT_MATCH | MISMATCH | STALE | UNKNOWN`, exposes one localhost GET-only endpoint, and the Control Center renders a query-only card. No new daemon or automatic remediation is introduced.

**Tech Stack:** PowerShell 7, Windows PowerShell 5.1, Node.js 24, TypeScript 5.9, Express, React/MUI, TanStack Query, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-04-runtime-source-attestation-v1-design.md`

## Global Constraints

- `P1_V1=READ_ONLY`.
- `AUTO_GATE=NONE`.
- `ARM_GATE=NONE`.
- `START_GATE=NONE`.
- `MODE_MUTATION=NONE`.
- `ARM_MUTATION=NONE`.
- `ORDER_MUTATION=NONE`.
- `POSITION_MUTATION=NONE`.
- `STRATEGY_MUTATION=NONE`.
- `AUTO_RETUNE=NONE`.
- Required components are exactly `api`, `lifecycle-broker`, `supervisor`, `trend`, `sideway`, `telegram`, `regime-notifier`.
- Verdicts are exactly `EXACT_MATCH`, `MISMATCH`, `STALE`, `UNKNOWN`; precedence is `MISMATCH` > `UNKNOWN` > `STALE` > `EXACT_MATCH`.
- Ordinary GET handling must not execute Git commands.
- Missing/malformed evidence never becomes `EXACT_MATCH`.
- Attestation write failure is observability failure only: callers catch/log and startup continues.
- Runtime JSON writes are atomic.
- No API key, Telegram token, password, ARM token, raw env-file content, or replayable secret enters attestation files, tests, responses, or logs.
- V1 `configFingerprint` contains only stable launch identity: `version`, `accountMode`, `liveExecutionEnabled`, canonical runtime root, control API URL. Mutable lot/TP/strategy settings remain under their existing configured-vs-active lifecycle contract and are not copied into P1.
- Source implementation does not mutate the currently running LIVE bot. Post-merge runtime rollout is a separate operator-approved step.

---

## File Structure

### Create

- `scripts/lib/phase7c-runtime-source-attestation.ps1` — PowerShell canonical identity, SHA-256, atomic manifest/component writer.
- `apps/api/src/services/phase7c-runtime-source-attestation.service.ts` — TypeScript schemas, canonicalization, API self-attestation, current-PID resolution, component/overall verdict aggregation.
- `apps/api/src/services/phase7c-runtime-source-attestation.service.test.ts` — deterministic temp-directory tests with injected liveness/hash readers.
- `apps/web/src/ui/Phase7CRuntimeSourceAttestationCard.tsx` — read-only Control Center card.
- `scripts/test-phase7c-runtime-source-attestation-source.ps1` — PS7/PS5.1 functional + source-safety contract.

### Modify

- `scripts/recover-phase7c-runtime-ready-stable-deploy-local.ps1`
- `scripts/deploy-phase7c-web-ui-local.ps1`
- `scripts/run-phase7c-executor-task-runner-local.ps1`
- `scripts/run-phase7c-executors-local.ps1`
- `scripts/run-phase7b-api-runtime-local.ps1`
- `apps/api/src/index.ts`
- `apps/api/src/routes/phase7c.route.ts`
- `apps/web/src/phase7c-types.ts`
- `apps/web/src/api.ts`
- `apps/web/src/pages/Phase7CControlCenterShellPage.tsx`
- `scripts/test-phase7c-runtime-ready-stable-recovery-deploy-source.ps1`
- `scripts/test-phase7c-web-ui-safe-deploy-source.ps1`
- `scripts/test-phase7c-system-lifecycle-broker-source.ps1`
- `.github/workflows/phase7c-canonical-pr-gate.yml`
- `.github/workflows/phase7c-runtime-ready-stable-recovery-deploy-ci.yml`

### Deliberately unchanged

- `scripts/run-phase7c-trend-controller-local.ps1`
- `scripts/run-phase7c-sideway-controller-local.ps1`
- `scripts/run-phase7c-telegram-mode-controller-local.ps1`
- `scripts/run-phase7c-regime-notifier-local.ps1`
- AUTO/ARM implementation files, order routes, strategy rules, risk/TP business rules.

The supervisor already owns the canonical child PID creation, so it can attest on behalf of Trend/Sideway/Telegram/regime-notifier without altering those child scripts.

---

### Task 1: Core identity, fingerprint, manifest, component and verdict primitives

**Files:**
- Create: `scripts/lib/phase7c-runtime-source-attestation.ps1`
- Create: `apps/api/src/services/phase7c-runtime-source-attestation.service.ts`
- Create: `apps/api/src/services/phase7c-runtime-source-attestation.service.test.ts`
- Create: `scripts/test-phase7c-runtime-source-attestation-source.ps1`

**Interfaces:**

PowerShell functions:

```text
Get-Phase7CRuntimeSourceConfigIdentity([string] RuntimeRoot, [string] AccountMode, [bool] LiveExecutionEnabled, [string] ControlApiUrl)
Get-Phase7CRuntimeSourceConfigFingerprint([object] ConfigIdentity) -> string
Initialize-Phase7CRuntimeSourceDeployment([string] RuntimeRoot, [string] SourceCommit, [string] SourceTree, [string] Branch, [object] ConfigIdentity) -> PSCustomObject
Read-Phase7CRuntimeSourceDeployment([string] RuntimeRoot) -> PSCustomObject
Write-Phase7CRuntimeSourceComponentAttestation([string] RuntimeRoot, [string] Component, [int] ProcessId, [string] LauncherPath) -> PSCustomObject
```

TypeScript exports:

```ts
export type Phase7CRuntimeSourceComponentName =
  | "api" | "lifecycle-broker" | "supervisor" | "trend"
  | "sideway" | "telegram" | "regime-notifier";

export type Phase7CRuntimeSourceVerdict =
  | "EXACT_MATCH" | "MISMATCH" | "STALE" | "UNKNOWN";

export function canonicalizePhase7CRuntimeSourceConfig(input: Phase7CRuntimeSourceConfigIdentity): string;
export function fingerprintPhase7CRuntimeSourceConfig(input: Phase7CRuntimeSourceConfigIdentity): string;
export function evaluatePhase7CRuntimeSourceComponent(input: Phase7CRuntimeSourceComponentEvaluationInput): Phase7CRuntimeSourceComponentResult;
export function combinePhase7CRuntimeSourceVerdicts(values: readonly Phase7CRuntimeSourceVerdict[]): Phase7CRuntimeSourceVerdict;
```

- [ ] **Step 1: Write Node RED tests for verdict precedence and canonical fingerprint**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  combinePhase7CRuntimeSourceVerdicts,
  fingerprintPhase7CRuntimeSourceConfig,
} from "./phase7c-runtime-source-attestation.service";

const fixture = {
  version: 1 as const,
  accountMode: "LIVE" as const,
  liveExecutionEnabled: true,
  runtimeRoot: "F:\\Project\\XAUUSD_AI_MASTER\\xauusd-ai-master\\.runtime",
  controlApiUrl: "http://127.0.0.1:3711",
};

test("fingerprint fixture is cross-language stable", () => {
  assert.equal(
    fingerprintPhase7CRuntimeSourceConfig(fixture),
    "sha256:ad7ecee6a3c038992ba8816bf8ec8235bc2febbdad35fcd07a35c511512445d9",
  );
});

test("overall precedence is mismatch then unknown then stale then exact", () => {
  assert.equal(combinePhase7CRuntimeSourceVerdicts(["EXACT_MATCH", "STALE"]), "STALE");
  assert.equal(combinePhase7CRuntimeSourceVerdicts(["STALE", "UNKNOWN"]), "UNKNOWN");
  assert.equal(combinePhase7CRuntimeSourceVerdicts(["UNKNOWN", "MISMATCH"]), "MISMATCH");
});
```

- [ ] **Step 2: Run Node test and prove RED**

```bash
pnpm --filter @xauusd/api exec node --import tsx --test src/services/phase7c-runtime-source-attestation.service.test.ts
```

Expected: FAIL because the new service/exports do not exist.

- [ ] **Step 3: Write PowerShell RED contract**

Start with an explicit missing-helper failure, then use only a temp directory for functional checks:

```powershell
$Helper = Join-Path $ProjectRoot "scripts\lib\phase7c-runtime-source-attestation.ps1"
if (-not (Test-Path -LiteralPath $Helper)) {
  throw "RED: runtime source attestation helper missing: $Helper"
}
. $Helper

$identity = Get-Phase7CRuntimeSourceConfigIdentity `
  -RuntimeRoot "F:\Project\XAUUSD_AI_MASTER\xauusd-ai-master\.runtime" `
  -AccountMode LIVE `
  -LiveExecutionEnabled $true `
  -ControlApiUrl "http://127.0.0.1:3711"
$fingerprint = Get-Phase7CRuntimeSourceConfigFingerprint -ConfigIdentity $identity
if ($fingerprint -ne "sha256:ad7ecee6a3c038992ba8816bf8ec8235bc2febbdad35fcd07a35c511512445d9") {
  throw "Cross-language fingerprint mismatch: $fingerprint"
}
```

The contract also parses every touched PowerShell source using `[System.Management.Automation.Language.Parser]::ParseFile`.

- [ ] **Step 4: Run PS7 and Windows PowerShell 5.1 and prove RED**

```powershell
pwsh -NoProfile -File .\scripts\test-phase7c-runtime-source-attestation-source.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-phase7c-runtime-source-attestation-source.ps1
```

Expected: both FAIL at `RED: runtime source attestation helper missing`.

- [ ] **Step 5: Implement PowerShell canonicalization and atomic JSON**

Build an `[ordered]` identity with fields inserted exactly in this order:

```powershell
[ordered]@{
  version = 1
  accountMode = $AccountMode.Trim().ToUpperInvariant()
  liveExecutionEnabled = [bool]$LiveExecutionEnabled
  runtimeRoot = [System.IO.Path]::GetFullPath($RuntimeRoot)
  controlApiUrl = $ControlApiUrl.TrimEnd('/')
}
```

Canonical UTF-8 text must match compact JSON semantics used by `JSON.stringify`. Hash bytes with SHA-256 and return prefix `sha256:` followed by 64 lowercase hex characters.

Atomic write helper behavior:

```text
create sibling temporary file in target directory
write UTF-8 without BOM
flush and close
replace existing target atomically, or move temp file when target is absent
remove orphan temp file in finally
```

- [ ] **Step 6: Implement deployment idempotency and component writer**

Manifest identity tuple is exactly:

```text
sourceCommit + sourceTree + branch + worktreeClean(true) + configFingerprint
```

If an existing valid manifest has the same tuple, preserve `deploymentId` and `createdAt`. Otherwise create a new 32-character lowercase GUID string with no separators and a new Unix-ms timestamp.

Component writer reads the manifest, hashes the supplied launcher bytes, and writes `version`, `component`, `deploymentId`, `sourceCommit`, `sourceTree`, `pid`, `startedAt`, `launcherSha256`, `configFingerprint`.

- [ ] **Step 7: Implement matching TypeScript primitives and full verdict matrix**

The evaluator must return:

```text
MISMATCH: valid contradictory evidence (commit/tree/deployment/fingerprint/launcher/component/current-live-PID mismatch)
STALE: valid historical record, attested PID dead, no different current live PID
UNKNOWN: missing/malformed/unreadable manifest/record/PID/hash evidence
EXACT_MATCH: every required equality/liveness/hash check passes
```

- [ ] **Step 8: Expand Node tests to all approved cases**

Cover wrong commit, tree, deployment ID, config fingerprint, launcher hash, component name, live current PID vs attested PID, dead historical PID, missing/malformed manifest, missing/malformed component, overall precedence, all exact.

- [ ] **Step 9: Run Task 1 GREEN**

Run the Node command from Step 2 and both PowerShell commands from Step 4. Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add scripts/lib/phase7c-runtime-source-attestation.ps1 scripts/test-phase7c-runtime-source-attestation-source.ps1 apps/api/src/services/phase7c-runtime-source-attestation.service.ts apps/api/src/services/phase7c-runtime-source-attestation.service.test.ts
git commit -m "feat: add runtime source attestation primitives"
```

---

### Task 2: Canonical deployment manifest creation/reuse

**Files:**
- Modify: `scripts/recover-phase7c-runtime-ready-stable-deploy-local.ps1` after its existing branch/clean/exact-commit guard.
- Modify: `scripts/deploy-phase7c-web-ui-local.ps1` after its existing branch/clean/exact-commit guard and before broker freshness/build/restart.
- Modify: `scripts/test-phase7c-runtime-source-attestation-source.ps1`
- Modify: `scripts/test-phase7c-runtime-ready-stable-recovery-deploy-source.ps1`
- Modify: `scripts/test-phase7c-web-ui-safe-deploy-source.ps1`

**Interfaces:** Consumes `Initialize-Phase7CRuntimeSourceDeployment`; produces `.runtime/phase7c-source-attestation/deployment.json` before any P1-aware process starts.

- [ ] **Step 1: Add RED ordering assertions**

Require both canonical paths to load `scripts/lib/phase7c-runtime-source-attestation.ps1`, resolve tree from the already-proven exact commit, and initialize the manifest only after source guard success. In Web deploy, initialization precedes dashboard/API restart. In recovery, initialization precedes every branch that may repair/restart the task or lifecycle.

- [ ] **Step 2: Prove RED in PS7 + PS5.1**

Run:

```powershell
.\scripts\test-phase7c-runtime-source-attestation-source.ps1
.\scripts\test-phase7c-runtime-ready-stable-recovery-deploy-source.ps1
.\scripts\test-phase7c-web-ui-safe-deploy-source.ps1
```

under both engines. Expected: only new attestation assertions fail.

- [ ] **Step 3: Integrate manifest initialization without weakening source gates**

After exact commit equality, resolve tree:

```powershell
$sourceTree = ([string](& $gitExe rev-parse "$ExpectedCommit`^{tree}")).Trim().ToLowerInvariant()
if ($LASTEXITCODE -ne 0 -or $sourceTree -notmatch '^[0-9a-f]{40}$') {
  throw "Could not resolve exact source tree for runtime attestation."
}
```

Build V1 config identity from canonical runtime root, account mode, live-execution boolean, and control API URL already available in each script. Initialize the manifest and emit values directly from the returned object:

```powershell
Write-Host "PHASE7C_RUNTIME_SOURCE_DEPLOYMENT_ID=$($deployment.deploymentId)"
Write-Host "PHASE7C_RUNTIME_SOURCE_COMMIT=$($deployment.sourceCommit)"
Write-Host "PHASE7C_RUNTIME_SOURCE_TREE=$($deployment.sourceTree)"
Write-Host "PHASE7C_RUNTIME_SOURCE_MANIFEST=READY"
```

- [ ] **Step 4: Add idempotency functional assertions**

In the temp contract, identical tuple twice must preserve both `deploymentId` and `createdAt`; changing source tree or account mode must rotate both generation identity and timestamp.

- [ ] **Step 5: Run all touched source contracts GREEN in both PowerShell engines**

Existing recovery ordering, battery repair, broker freshness, PAUSE/DISARM safety assertions must remain unchanged and pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/recover-phase7c-runtime-ready-stable-deploy-local.ps1 scripts/deploy-phase7c-web-ui-local.ps1 scripts/test-phase7c-runtime-source-attestation-source.ps1 scripts/test-phase7c-runtime-ready-stable-recovery-deploy-source.ps1 scripts/test-phase7c-web-ui-safe-deploy-source.ps1
git commit -m "feat: stamp canonical runtime deployment identity"
```

---

### Task 3: Broker, supervisor and executor child attestations

**Files:**
- Modify: `scripts/run-phase7c-executor-task-runner-local.ps1`
- Modify: `scripts/run-phase7c-executors-local.ps1`
- Modify: `scripts/test-phase7c-runtime-source-attestation-source.ps1`
- Modify: `scripts/test-phase7c-system-lifecycle-broker-source.ps1`

**Interfaces:** Produces component records for `lifecycle-broker`, `supervisor`, `trend`, `sideway`, `telegram`, `regime-notifier`.

- [ ] **Step 1: Add RED canonical-PID assertions**

Lock exact PID sources:

```text
lifecycle-broker = task-runner $PID
supervisor = same $PID written to supervisor.pid
trend = same Start-Process Id written to trend.pid
sideway = same Start-Process Id written to sideway.pid
telegram = same Start-Process Id written to telegram-mode.pid
regime-notifier = same Start-Process Id written to regime-notifier.pid
```

Lock launcher files to the exact six existing scripts responsible for those processes.

- [ ] **Step 2: Prove RED in PS7 + PS5.1**

Run the P1 source contract and lifecycle-broker source contract. Expected: writer calls missing.

- [ ] **Step 3: Add best-effort lifecycle-broker write**

After runtime root is resolved and startup lock acquired:

```powershell
try {
  Write-Phase7CRuntimeSourceComponentAttestation `
    -RuntimeRoot $workDir `
    -Component "lifecycle-broker" `
    -ProcessId $PID `
    -LauncherPath $PSCommandPath | Out-Null
  Write-Host "PHASE7C_RUNTIME_SOURCE_ATTESTATION_LIFECYCLE_BROKER=WRITTEN"
} catch {
  Write-Warning "Runtime source attestation unavailable for lifecycle-broker: $($_.Exception.Message)"
}
```

The catch must not change broker state or exit.

- [ ] **Step 4: Add best-effort supervisor/child writer wrapper**

After each existing PID file write, call the shared helper with that exact PID and the direct launcher path. Do not alter child command-line parameters or trading environment.

- [ ] **Step 5: Run P1 + lifecycle broker source/protocol contracts GREEN**

Both PowerShell engines for P1; existing broker contracts at least under their current CI shells.

- [ ] **Step 6: Commit**

```bash
git add scripts/run-phase7c-executor-task-runner-local.ps1 scripts/run-phase7c-executors-local.ps1 scripts/test-phase7c-runtime-source-attestation-source.ps1 scripts/test-phase7c-system-lifecycle-broker-source.ps1
git commit -m "feat: attest Phase7C executor runtime processes"
```

---

### Task 4: API self-attestation, aggregation and GET-only route

**Files:**
- Modify: `scripts/run-phase7b-api-runtime-local.ps1`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/services/phase7c-runtime-source-attestation.service.ts`
- Modify: `apps/api/src/services/phase7c-runtime-source-attestation.service.test.ts`
- Modify: `apps/api/src/routes/phase7c.route.ts`
- Modify: `scripts/test-phase7c-runtime-source-attestation-source.ps1`

**Interfaces:**

```ts
export function writePhase7CApiRuntimeSourceAttestation(): Phase7CRuntimeSourceComponentAttestation;
export function getPhase7CRuntimeSourceAttestationSnapshot(): Phase7CRuntimeSourceAttestationSnapshot;
```

Route: `GET /api/v1/phase7c/runtime-source-attestation`.

- [ ] **Step 1: Add Node RED tests for complete snapshot**

Build temp fixtures and inject `isPidAlive`, `readFile`, `hashFile`, runtime root, project root, current API PID. All-exact fixture must assert seven components, overall `EXACT_MATCH`, `readOnly: true`, and every safety mutation/gate flag false.

- [ ] **Step 2: Prove RED**

Run Task 1 Node command. Expected: snapshot/API-writer exports missing.

- [ ] **Step 3: Pass only non-secret immutable context from API PowerShell launcher**

Before `pnpm --filter '@xauusd/api' start`:

```powershell
$env:PHASE7C_SOURCE_ATTESTATION_ROOT = Join-Path $WorkDir "phase7c-source-attestation"
$env:PHASE7C_SOURCE_ATTESTATION_API_LAUNCHER = $PSCommandPath
```

Commit/tree/fingerprint are read from deployment manifest; they are not rediscovered from Git.

- [ ] **Step 4: Write API component record from actual Node PID**

In successful `app.listen` callback:

```ts
try {
  writePhase7CApiRuntimeSourceAttestation();
  console.log("PHASE7C_RUNTIME_SOURCE_ATTESTATION_API=WRITTEN");
} catch (error) {
  console.warn(`PHASE7C_RUNTIME_SOURCE_ATTESTATION_API=UNKNOWN reason=${error instanceof Error ? error.message : "unknown"}`);
}
```

`pid` is always `process.pid`.

- [ ] **Step 5: Implement current-PID and launcher mapping**

```text
api -> process.pid -> scripts/run-phase7b-api-runtime-local.ps1
lifecycle-broker -> heartbeat/status agreeing brokerPid -> scripts/run-phase7c-executor-task-runner-local.ps1
supervisor -> supervisor.pid -> scripts/run-phase7c-executors-local.ps1
trend -> trend.pid -> scripts/run-phase7c-trend-controller-local.ps1
sideway -> sideway.pid -> scripts/run-phase7c-sideway-controller-local.ps1
telegram -> telegram-mode.pid -> scripts/run-phase7c-telegram-mode-controller-local.ps1
regime-notifier -> regime-notifier.pid -> scripts/run-phase7c-regime-notifier-local.ps1
```

Use only read/hash/liveness operations. Liveness may use signal `0`; no process-control signal is allowed.

- [ ] **Step 6: Implement localhost GET route**

```ts
router.get("/runtime-source-attestation", (req, res) => {
  if (!isLoopbackRequest(req)) {
    res.status(403).json({ error: "Runtime source attestation is restricted to localhost." });
    return;
  }
  res.setHeader("cache-control", "no-store");
  res.json(getPhase7CRuntimeSourceAttestationSnapshot());
});
```

No POST/PUT/PATCH/DELETE attestation route exists.

- [ ] **Step 7: Add source-safety prohibitions**

The P1 source contract must reject P1 code paths containing mode mutation, ARM execution, lifecycle start/stop invocation, Scheduled Task start/stop, order mutation calls, `child_process`, `exec`, `spawn`, or Git subprocess calls in the API aggregator.

- [ ] **Step 8: Run Node tests + API build + PS contracts GREEN**

```bash
pnpm --filter @xauusd/api exec node --import tsx --test src/services/phase7c-runtime-source-attestation.service.test.ts
pnpm --filter @xauusd/api build
```

plus both PowerShell P1 source-contract commands.

- [ ] **Step 9: Commit**

```bash
git add scripts/run-phase7b-api-runtime-local.ps1 apps/api/src/index.ts apps/api/src/services/phase7c-runtime-source-attestation.service.ts apps/api/src/services/phase7c-runtime-source-attestation.service.test.ts apps/api/src/routes/phase7c.route.ts scripts/test-phase7c-runtime-source-attestation-source.ps1
git commit -m "feat: expose read-only runtime source attestation"
```

---

### Task 5: Read-only Control Center card

**Files:**
- Modify: `apps/web/src/phase7c-types.ts`
- Modify: `apps/web/src/api.ts`
- Create: `apps/web/src/ui/Phase7CRuntimeSourceAttestationCard.tsx`
- Modify: `apps/web/src/pages/Phase7CControlCenterShellPage.tsx`
- Modify: `scripts/test-phase7c-runtime-source-attestation-source.ps1`

**Interfaces:**

```ts
export async function getPhase7CRuntimeSourceAttestation(): Promise<Phase7CRuntimeSourceAttestationSnapshot>;
```

TanStack query key: `phase7c-runtime-source-attestation`.

- [ ] **Step 1: Add RED static UI assertions**

Require type/getter/card/shell integration and exact warning copy `READ-ONLY WARNING — NO AUTOMATIC ACTION TAKEN`. Reject `useMutation` and imports/calls to AUTO, ARM, lifecycle mutation APIs in the new card.

- [ ] **Step 2: Prove RED under PS7 + PS5.1**

Expected: type/getter/card markers missing.

- [ ] **Step 3: Add Web response types and GET client**

```ts
export async function getPhase7CRuntimeSourceAttestation(): Promise<Phase7CRuntimeSourceAttestationSnapshot> {
  return read<Phase7CRuntimeSourceAttestationSnapshot>(
    await fetch(`${API_BASE}/api/v1/phase7c/runtime-source-attestation`, { cache: "no-store" }),
  );
}
```

Keep full commit/ID in data and shorten only for display.

- [ ] **Step 4: Implement query-only card**

Use `useQuery`, refresh interval 5 seconds, `retry: false`. Render accepted commit, deployment ID, overall verdict and seven component rows. Mapping: exact=success, mismatch=error, stale=warning, unknown=warning/default. Any non-exact overall displays the exact read-only warning. No buttons or switches.

- [ ] **Step 5: Mount card between authorization and control content**

```tsx
<Phase7CExecutionAuthorizationCard />
<Phase7CRuntimeSourceAttestationCard />
<Phase7CControlCenterPage />
```

- [ ] **Step 6: Run Web build and both PowerShell source contracts GREEN**

```bash
pnpm --filter @xauusd/web build
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/phase7c-types.ts apps/web/src/api.ts apps/web/src/ui/Phase7CRuntimeSourceAttestationCard.tsx apps/web/src/pages/Phase7CControlCenterShellPage.tsx scripts/test-phase7c-runtime-source-attestation-source.ps1
git commit -m "feat: show runtime source attestation in Control Center"
```

---

### Task 6: CI coverage and touched-path regression lock

**Files:**
- Modify: `.github/workflows/phase7c-canonical-pr-gate.yml`
- Modify: `.github/workflows/phase7c-runtime-ready-stable-recovery-deploy-ci.yml`
- Modify: `scripts/test-phase7c-runtime-source-attestation-source.ps1`

**Interfaces:** CI must run Node behavior tests, PS7, PS5.1, API/Web builds, and existing lifecycle/recovery/deploy safety contracts.

- [ ] **Step 1: Add RED workflow assertions**

P1 source contract must require both workflows to reference `test-phase7c-runtime-source-attestation-source.ps1`. Recovery workflow path filters must include the new helper and every P1-modified launch/deploy path.

- [ ] **Step 2: Prove RED**

Run P1 source contract under PS7/PS5.1. Expected: workflow markers missing.

- [ ] **Step 3: Extend Canonical PR Gate**

Add Linux behavior test:

```yaml
- name: Runtime source attestation service contract
  run: pnpm --filter @xauusd/api exec node --import tsx --test src/services/phase7c-runtime-source-attestation.service.test.ts
```

Add Windows P1 source-contract steps for both `pwsh` and `powershell`. Preserve `permissions: contents: read`.

- [ ] **Step 4: Extend Runtime Ready Stable Recovery Deploy CI**

Add P1 paths to both PR and main-push filters; add P1 source contract under both PowerShell engines. Do not remove or relax existing battery/recovery/safety steps.

- [ ] **Step 5: Run full final verification matrix**

Linux/cross-platform:

```bash
pnpm --filter @xauusd/api exec node --import tsx --test src/services/phase7c-runtime-source-attestation.service.test.ts
pnpm --filter @xauusd/api build
pnpm --filter @xauusd/web build
node --test scripts/test-phase7c-canonical-pr-gate-contract.mjs
git diff --check
```

Windows:

```powershell
pwsh -NoProfile -File .\scripts\test-phase7c-runtime-source-attestation-source.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-phase7c-runtime-source-attestation-source.ps1
pwsh -NoProfile -File .\scripts\test-phase7c-system-lifecycle-broker-source.ps1
pwsh -NoProfile -File .\scripts\test-phase7c-system-lifecycle-broker-contract.ps1
pwsh -NoProfile -File .\scripts\test-phase7c-web-ui-safe-deploy-source.ps1
pwsh -NoProfile -File .\scripts\test-phase7c-runtime-ready-stable-recovery-deploy-source.ps1
pwsh -NoProfile -File .\scripts\test-phase7c-web-live-arm-demo-auto-source.ps1
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/phase7c-canonical-pr-gate.yml .github/workflows/phase7c-runtime-ready-stable-recovery-deploy-ci.yml scripts/test-phase7c-runtime-source-attestation-source.ps1
git commit -m "ci: gate runtime source attestation"
```

---

### Task 7: Exact-head review, PR, merge and source production acceptance

**Files:** Review all P1 files, the approved spec, and this plan. No new production file in this task.

- [ ] **Step 1: Verify provenance and clean diff**

```bash
git merge-base --is-ancestor 4f156ef1b019ef676cc23ed978c9487eb41f2fe6 HEAD
git status --porcelain
git diff --check
git log --oneline --decorate -n 12
```

Expected: accepted P1 base is an ancestor, worktree clean, diff hygiene passes.

- [ ] **Step 2: Re-run Task 6 complete verification on the exact final head**

Earlier GREEN output is not reused as final evidence.

- [ ] **Step 3: Diff-scope review**

Reject any change to strategy entry/management/exit logic, AUTO/ARM policy, order routes, recovery sizing, lot/TP rules, or MT5 trading behavior.

- [ ] **Step 4: Open non-draft PR against current `main`**

PR body records:

```text
P1_V1=READ_ONLY
AUTO_GATE=NONE
ARM_GATE=NONE
START_GATE=NONE
ORDER_MUTATION=NONE
AUTO_RETUNE=NONE
LIVE_DEPLOYMENT_IN_PR=NONE
```

and exact RED/GREEN evidence.

- [ ] **Step 5: Require fresh PR CI on exact PR head**

At minimum both workflows must be `SUCCESS` on that head. If head changes, re-run/inspect fresh CI.

- [ ] **Step 6: Merge only the exact tested head**

Squash merge with expected head SHA. Capture merged `main` SHA and require main-push CI success on that exact SHA.

- [ ] **Step 7: Record source-only completion state**

```text
P1_SOURCE_PRODUCTION_ACCEPTED=TRUE
P1_RUNTIME_LIVE_PROVEN=FALSE
LIVE_RUNTIME_MUTATION=NONE
```

Old LIVE processes cannot retroactively acquire P1 attestations.

---

### Task 8: Guarded LIVE rollout and post-deploy proof — separate operator approval required

**Files:** No source edits. Use existing canonical sync/preflight/recovery/deploy procedures only after Task 7.

- [ ] **Step 1: Stop before runtime mutation and obtain explicit operator approval**

Present exact merged-main SHA, main-push CI and current LIVE state. Do not PAUSE, DISARM, restart or deploy before approval.

- [ ] **Step 2: Guarded fast-forward source sync**

Resolve actual merged `main` SHA from GitHub, require local `main`, clean worktree and fast-forward ancestry. No destructive reset/clean.

- [ ] **Step 3: Fresh read-only LIVE preflight**

Require account/runtime/task/broker/lifecycle/positions/orders to classify a supported canonical deployment route. Mixed/blocked state stops rollout.

- [ ] **Step 4: Run the existing canonical controlled deployment once**

Use the actual merged SHA as `ExpectedCommit`. Existing recovery policy must finish `PAUSE + DISARMED + flat` before any later ARM/AUTO action.

- [ ] **Step 5: Query P1 before ARM/AUTO**

```powershell
$attestation = Invoke-RestMethod -Uri "http://127.0.0.1:3711/api/v1/phase7c/runtime-source-attestation" -Method Get
$attestation.overall
$attestation.components | Format-Table component, verdict, pid, alive, sourceCommit
```

Require `overall=EXACT_MATCH`, every required component `EXACT_MATCH`, `readOnly=true`, canonical runtime health, task drift zero, fresh broker heartbeat, startup lock HELD, lifecycle READY and XAUUSD flat.

- [ ] **Step 6: Record LIVE proof; ARM/AUTO remains separate manual procedure**

```text
P1_RUNTIME_LIVE_PROVEN=TRUE
POST_DEPLOY_RUNTIME_ATTESTATION=EXACT_MATCH
P1_MODE_MUTATION=NONE
P1_ARM_MUTATION=NONE
P1_ORDER_MUTATION=NONE
P1_AUTO_RETUNE=NONE
```

P1 never invokes ARM/AUTO; those remain the existing explicit operator flow.

---

## Self-Review Coverage Map

- Deployment manifest + same-identity `deploymentId` reuse: Tasks 1-2.
- Non-secret, cross-language deterministic fingerprint: Task 1 exact digest fixture.
- Atomic writes: Task 1.
- Seven required components + canonical PIDs/launcher hashes: Tasks 3-4.
- API attestation from real Node PID: Task 4.
- `EXACT_MATCH/MISMATCH/STALE/UNKNOWN` + precedence: Tasks 1 and 4.
- GET-only/localhost/no Git/no mutation: Tasks 4 and 6.
- Read-only Control Center warning/no actions: Task 5.
- PS7 + PS5.1 + API/Web build + existing safety regressions: Task 6.
- Fresh PR/head + main-push CI: Task 7.
- Post-deploy runtime `EXACT_MATCH`: Task 8.
- P2/P3/P4/P5 remain outside this plan.
