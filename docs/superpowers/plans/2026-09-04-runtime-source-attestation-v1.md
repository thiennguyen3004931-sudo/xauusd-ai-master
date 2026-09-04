# P1 Runtime Source Attestation V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only runtime provenance layer that proves whether API, lifecycle broker, supervisor, Trend, Sideway, Telegram, and regime-notifier are running from the exact canonical deployment identity, without changing AUTO/ARM/lifecycle/order behavior.

**Architecture:** A PowerShell helper creates/reuses an atomic deployment manifest after existing exact-source guards and writes process attestations at existing canonical launch boundaries. The Node API writes its own PID-bound attestation, aggregates all runtime evidence into `EXACT_MATCH | MISMATCH | STALE | UNKNOWN`, exposes one localhost GET-only endpoint, and the Control Center renders the result as a read-only card. No new daemon and no automatic remediation are introduced.

**Tech Stack:** PowerShell 7 + Windows PowerShell 5.1, Node.js 24, TypeScript 5.9, Express, React 19/MUI, TanStack Query, GitHub Actions.

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
- Required components are exactly: `api`, `lifecycle-broker`, `supervisor`, `trend`, `sideway`, `telegram`, `regime-notifier`.
- Component/overall verdicts are exactly: `EXACT_MATCH`, `MISMATCH`, `STALE`, `UNKNOWN`.
- Overall precedence is `MISMATCH` > `UNKNOWN` > `STALE` > `EXACT_MATCH`.
- Ordinary GET handling must not execute Git commands.
- Missing or malformed evidence must never become `EXACT_MATCH`.
- Attestation write failures must be observability failures only: startup continues and the aggregator later reports `UNKNOWN`/`MISMATCH`; P1 must not block a healthy runtime.
- Runtime files must be written atomically.
- No raw env-file contents, API keys, Telegram tokens, passwords, ARM tokens, or other secrets may enter manifests, component records, fixtures, API responses, or logs.
- Mutable strategy/risk settings are intentionally excluded from the V1 fingerprint. V1 fingerprints only launch identity (`accountMode`, `liveExecutionEnabled`, canonical runtime root, control API URL). This keeps P1 source provenance independent from pending lot/TP settings that already have their own active/configured restart contract.
- LIVE rollout is a separate guarded operational step after merge/main CI; source implementation must not mutate the currently running LIVE bot.

---

## File Structure

### Create

- `scripts/lib/phase7c-runtime-source-attestation.ps1` — PowerShell manifest/config fingerprint/atomic component-writer helper.
- `apps/api/src/services/phase7c-runtime-source-attestation.service.ts` — Node schema, hashing, API self-attestation, PID resolution, aggregation, verdict logic.
- `apps/api/src/services/phase7c-runtime-source-attestation.service.test.ts` — deterministic service tests using temp directories and injected liveness.
- `apps/web/src/ui/Phase7CRuntimeSourceAttestationCard.tsx` — read-only Control Center card.
- `scripts/test-phase7c-runtime-source-attestation-source.ps1` — PS7/PS5.1 helper + integration + no-mutation contract.

### Modify

- `scripts/recover-phase7c-runtime-ready-stable-deploy-local.ps1` — create/reuse deployment manifest after exact Git guard and before any runtime generation start/restart.
- `scripts/deploy-phase7c-web-ui-local.ps1` — create/reuse the same manifest after exact source guard and before API/Web restart; same identity must reuse `deploymentId`.
- `scripts/run-phase7c-executor-task-runner-local.ps1` — best-effort lifecycle-broker attestation using canonical broker PID `$PID`.
- `scripts/run-phase7c-executors-local.ps1` — best-effort supervisor attestation and child attestations using the exact PIDs already written to existing PID files.
- `scripts/run-phase7b-api-runtime-local.ps1` — pass attestation root and canonical API launcher path to the Node process; do not write API record from the PowerShell wrapper.
- `apps/api/src/index.ts` — best-effort API self-attestation from actual `process.pid` after listen succeeds.
- `apps/api/src/routes/phase7c.route.ts` — localhost GET-only `/runtime-source-attestation` route.
- `apps/web/src/phase7c-types.ts` — typed response contract.
- `apps/web/src/api.ts` — read-only GET client.
- `apps/web/src/pages/Phase7CControlCenterShellPage.tsx` — render new card alongside existing authorization/control cards.
- `.github/workflows/phase7c-canonical-pr-gate.yml` — Node service test + PS7/PS5.1 source contract.
- `.github/workflows/phase7c-runtime-ready-stable-recovery-deploy-ci.yml` — include new helper/test/integration paths and run the source contract in both PowerShell engines.

### Deliberately unchanged

- Trend/Sideway/Telegram/regime child controller scripts: the supervisor already owns canonical child PID creation and may attest on behalf of each child per the approved spec.
- AUTO/ARM services/routes/cards.
- MT5 bridge order endpoints.
- strategy/risk execution logic.

---

### Task 1: Core identity, fingerprint, manifest and verdict primitives

**Files:**
- Create: `scripts/lib/phase7c-runtime-source-attestation.ps1`
- Create: `apps/api/src/services/phase7c-runtime-source-attestation.service.ts`
- Create: `apps/api/src/services/phase7c-runtime-source-attestation.service.test.ts`
- Create: `scripts/test-phase7c-runtime-source-attestation-source.ps1`

**Interfaces:**
- PowerShell produces:
  - `Get-Phase7CRuntimeSourceConfigIdentity -RuntimeRoot <path> -AccountMode <DEMO|LIVE> -LiveExecutionEnabled <bool> -ControlApiUrl <url>`
  - `Get-Phase7CRuntimeSourceConfigFingerprint -ConfigIdentity <object>`
  - `Initialize-Phase7CRuntimeSourceDeployment -RuntimeRoot <path> -SourceCommit <sha> -SourceTree <sha> -Branch main -ConfigIdentity <object>`
  - `Read-Phase7CRuntimeSourceDeployment -RuntimeRoot <path>`
  - `Write-Phase7CRuntimeSourceComponentAttestation -RuntimeRoot <path> -Component <name> -ProcessId <pid> -LauncherPath <path>`
- TypeScript produces:
  - `Phase7CRuntimeSourceComponentName`
  - `Phase7CRuntimeSourceVerdict`
  - `Phase7CRuntimeSourceDeploymentManifest`
  - `Phase7CRuntimeSourceComponentAttestation`
  - `canonicalizePhase7CRuntimeSourceConfig(input)`
  - `fingerprintPhase7CRuntimeSourceConfig(input)`
  - `evaluatePhase7CRuntimeSourceComponent(...)`
  - `combinePhase7CRuntimeSourceVerdicts(...)`

- [ ] **Step 1: Write the failing Node tests for verdict precedence and identity checks**

Add tests that express the final behavior before the service exists:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  combinePhase7CRuntimeSourceVerdicts,
  fingerprintPhase7CRuntimeSourceConfig,
} from "./phase7c-runtime-source-attestation.service";

test("overall verdict precedence is mismatch > unknown > stale > exact", () => {
  assert.equal(combinePhase7CRuntimeSourceVerdicts(["EXACT_MATCH", "STALE"]), "STALE");
  assert.equal(combinePhase7CRuntimeSourceVerdicts(["STALE", "UNKNOWN"]), "UNKNOWN");
  assert.equal(combinePhase7CRuntimeSourceVerdicts(["UNKNOWN", "MISMATCH"]), "MISMATCH");
});

test("canonical fingerprint is deterministic", () => {
  const value = fingerprintPhase7CRuntimeSourceConfig({
    version: 1,
    accountMode: "LIVE",
    liveExecutionEnabled: true,
    runtimeRoot: "F:\\Project\\XAUUSD_AI_MASTER\\xauusd-ai-master\\.runtime",
    controlApiUrl: "http://127.0.0.1:3711",
  });
  assert.match(value, /^sha256:[0-9a-f]{64}$/);
  assert.equal(value, fingerprintPhase7CRuntimeSourceConfig({
    version: 1,
    accountMode: "LIVE",
    liveExecutionEnabled: true,
    runtimeRoot: "F:\\Project\\XAUUSD_AI_MASTER\\xauusd-ai-master\\.runtime",
    controlApiUrl: "http://127.0.0.1:3711",
  }));
});
```

- [ ] **Step 2: Run the Node test and prove RED**

Run:

```bash
pnpm --filter @xauusd/api exec node --import tsx --test src/services/phase7c-runtime-source-attestation.service.test.ts
```

Expected: FAIL because `phase7c-runtime-source-attestation.service.ts` does not exist/export the required interfaces/functions.

- [ ] **Step 3: Write the failing PowerShell contract for the helper**

The test must use a temporary directory only and must assert the helper path/function names plus the exact read-only guarantees. Its first executable contract should include:

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
if ($fingerprint -notmatch '^sha256:[0-9a-f]{64}$') { throw "fingerprint invalid" }
```

Also parse every modified PowerShell file with `[System.Management.Automation.Language.Parser]::ParseFile` and assert forbidden P1 mutations are absent (`ARM_LIVE`, `mode = "AUTO"`, `/v1/orders` mutation calls, `Start-ScheduledTask` introduced by P1 helper).

- [ ] **Step 4: Run PS7 and PS5.1 and prove RED**

Run:

```powershell
pwsh -NoProfile -File .\scripts\test-phase7c-runtime-source-attestation-source.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-phase7c-runtime-source-attestation-source.ps1
```

Expected: both FAIL at the explicit missing-helper RED marker.

- [ ] **Step 5: Implement the minimal PowerShell helper**

Use an `[ordered]` identity with exactly these V1 fields:

```powershell
[ordered]@{
  version = 1
  accountMode = $AccountMode
  liveExecutionEnabled = [bool]$LiveExecutionEnabled
  runtimeRoot = [System.IO.Path]::GetFullPath($RuntimeRoot)
  controlApiUrl = $ControlApiUrl.TrimEnd('/')
}
```

Serialize with `ConvertTo-Json -Depth 4 -Compress`, UTF-8 no BOM, SHA-256 the UTF-8 bytes, and return `sha256:<lowercase hex>`. Implement atomic JSON writes as sibling temp file -> close -> `[System.IO.File]::Replace` when destination exists, otherwise atomic `Move`.

Manifest idempotency must compare the tuple:

```text
sourceCommit
sourceTree
branch
worktreeClean=true
configFingerprint
```

and reuse existing `deploymentId` + `createdAt` if identical; otherwise create `deploymentId=[guid]::NewGuid().ToString('N')` and a new Unix-ms timestamp.

`Write-Phase7CRuntimeSourceComponentAttestation` must read the current manifest, SHA-256 the supplied launcher file, and write the exact component schema. It may throw internally; launch callers in later tasks catch/log and continue.

- [ ] **Step 6: Implement matching TypeScript primitives**

Define the exact unions:

```ts
export type Phase7CRuntimeSourceComponentName =
  | "api" | "lifecycle-broker" | "supervisor" | "trend"
  | "sideway" | "telegram" | "regime-notifier";

export type Phase7CRuntimeSourceVerdict =
  | "EXACT_MATCH" | "MISMATCH" | "STALE" | "UNKNOWN";
```

Use `createHash("sha256")` for the same compact JSON identity representation and keep all filesystem/process dependencies injectable in evaluation helpers so tests do not touch LIVE runtime.

- [ ] **Step 7: Expand tests to cover the approved verdict matrix**

Tests must cover: wrong commit/tree/deploymentId/config/hash -> `MISMATCH`; live current PID different from attested PID -> `MISMATCH`; dead historical PID with no new live PID -> `STALE`; missing/malformed evidence -> `UNKNOWN`; all exact -> `EXACT_MATCH`; and precedence combinations.

- [ ] **Step 8: Run core tests GREEN**

Run:

```bash
pnpm --filter @xauusd/api exec node --import tsx --test src/services/phase7c-runtime-source-attestation.service.test.ts
```

and both PowerShell commands from Step 4.

Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/phase7c-runtime-source-attestation.ps1 scripts/test-phase7c-runtime-source-attestation-source.ps1 apps/api/src/services/phase7c-runtime-source-attestation.service.ts apps/api/src/services/phase7c-runtime-source-attestation.service.test.ts
git commit -m "feat: add runtime source attestation primitives"
```

---

### Task 2: Canonical deployment manifest creation/reuse

**Files:**
- Modify: `scripts/recover-phase7c-runtime-ready-stable-deploy-local.ps1` immediately after existing branch/clean/exact-commit Git guard.
- Modify: `scripts/deploy-phase7c-web-ui-local.ps1` immediately after existing branch/clean/exact-commit Git guard and before `Assert-LifecycleBrokerSourceFresh` / build.
- Modify: `scripts/test-phase7c-runtime-source-attestation-source.ps1`
- Modify: `scripts/test-phase7c-runtime-ready-stable-recovery-deploy-source.ps1`
- Modify: `scripts/test-phase7c-web-ui-safe-deploy-source.ps1`

**Interfaces:**
- Consumes Task 1 `Initialize-Phase7CRuntimeSourceDeployment`.
- Produces `.runtime/phase7c-source-attestation/deployment.json` before any newly started P1-aware process needs it.

- [ ] **Step 1: Add RED source-contract assertions for ordering**

Assert both canonical scripts load `lib\phase7c-runtime-source-attestation.ps1`, resolve the exact source tree with the already-proven `$ExpectedCommit`, and call `Initialize-Phase7CRuntimeSourceDeployment` only after Git guard success.

For Web deploy, assert manifest initialization occurs before dashboard/API runtime restart. For recovery, assert it occurs before any branch that can restart/repair the Scheduled Task or lifecycle.

- [ ] **Step 2: Run existing + new source contracts and prove RED**

Run in PS7 and PS5.1:

```powershell
.\scripts\test-phase7c-runtime-source-attestation-source.ps1
.\scripts\test-phase7c-runtime-ready-stable-recovery-deploy-source.ps1
.\scripts\test-phase7c-web-ui-safe-deploy-source.ps1
```

Expected: only the newly added attestation assertions fail; all pre-existing safety assertions remain green up to the new requirement.

- [ ] **Step 3: Integrate manifest writer without weakening existing guards**

In each guarded path resolve tree using the existing Git executable after commit equality:

```powershell
$sourceTree = ([string](& $gitExe rev-parse "$ExpectedCommit`^{tree}")).Trim().ToLowerInvariant()
if ($LASTEXITCODE -ne 0 -or $sourceTree -notmatch '^[0-9a-f]{40}$') {
  throw "Could not resolve exact source tree for runtime attestation."
}
```

Build config identity from canonical runtime root/account mode/control API state already available to the script. Call the helper and print audit-only markers:

```text
PHASE7C_RUNTIME_SOURCE_DEPLOYMENT_ID=<id>
PHASE7C_RUNTIME_SOURCE_COMMIT=<sha>
PHASE7C_RUNTIME_SOURCE_TREE=<sha>
PHASE7C_RUNTIME_SOURCE_MANIFEST=READY
```

No attestation marker may alter the existing recovery decision tree.

- [ ] **Step 4: Add idempotency functional test**

In the temp test, call `Initialize-...` twice with identical tuple and assert same `deploymentId`/`createdAt`; change source tree or account mode and assert the ID rotates.

- [ ] **Step 5: Run all three contracts under PS7 and PS5.1**

Expected: PASS and no existing recovery/deploy order assertion changes.

- [ ] **Step 6: Commit**

```bash
git add scripts/recover-phase7c-runtime-ready-stable-deploy-local.ps1 scripts/deploy-phase7c-web-ui-local.ps1 scripts/test-phase7c-runtime-source-attestation-source.ps1 scripts/test-phase7c-runtime-ready-stable-recovery-deploy-source.ps1 scripts/test-phase7c-web-ui-safe-deploy-source.ps1
git commit -m "feat: stamp canonical runtime deployment identity"
```

---

### Task 3: Lifecycle broker, supervisor and child PID attestations

**Files:**
- Modify: `scripts/run-phase7c-executor-task-runner-local.ps1`
- Modify: `scripts/run-phase7c-executors-local.ps1`
- Modify: `scripts/test-phase7c-runtime-source-attestation-source.ps1`
- Modify: `scripts/test-phase7c-system-lifecycle-broker-source.ps1`

**Interfaces:**
- Consumes Task 1 component writer and Task 2 deployment manifest.
- Produces canonical component files for `lifecycle-broker`, `supervisor`, `trend`, `sideway`, `telegram`, `regime-notifier`.

- [ ] **Step 1: Add RED assertions for exact canonical PID binding**

Require:

```text
lifecycle-broker -> $PID in task runner
supervisor       -> $PID used for supervisor.pid
trend            -> $trend.Id used for trend.pid
sideway          -> $sideway.Id used for sideway.pid
telegram         -> returned Start-Process child Id used for telegram-mode.pid
regime-notifier  -> returned Start-Process child Id used for regime-notifier.pid
```

Require launcher paths exactly:

```text
scripts/run-phase7c-executor-task-runner-local.ps1
scripts/run-phase7c-executors-local.ps1
scripts/run-phase7c-trend-controller-local.ps1
scripts/run-phase7c-sideway-controller-local.ps1
scripts/run-phase7c-telegram-mode-controller-local.ps1
scripts/run-phase7c-regime-notifier-local.ps1
```

- [ ] **Step 2: Prove RED in PS7 + PS5.1**

Run the new source contract plus lifecycle broker source contract. Expected: attestation markers/writer calls missing.

- [ ] **Step 3: Add best-effort broker attestation**

Dot-source the helper from the task runner. After runtime root is resolved and startup lock is acquired, call:

```powershell
try {
  Write-Phase7CRuntimeSourceComponentAttestation `
    -RuntimeRoot $workDir `
    -Component "lifecycle-broker" `
    -ProcessId $PID `
    -LauncherPath $PSCommandPath
  Write-Host "PHASE7C_RUNTIME_SOURCE_ATTESTATION_LIFECYCLE_BROKER=WRITTEN"
} catch {
  Write-Warning "Runtime source attestation unavailable for lifecycle-broker: $($_.Exception.Message)"
}
```

The catch must not change broker state or exit.

- [ ] **Step 4: Add best-effort supervisor and child attestations**

After each existing PID file is written, write the corresponding attestation with that exact PID. Centralize this in a local helper such as:

```powershell
function Write-ChildSourceAttestation([string]$Component, [int]$ProcessId, [string]$LauncherPath) {
  try {
    Write-Phase7CRuntimeSourceComponentAttestation -RuntimeRoot $WorkDir -Component $Component -ProcessId $ProcessId -LauncherPath $LauncherPath
  } catch {
    Write-Warning "Runtime source attestation unavailable for ${Component}: $($_.Exception.Message)"
  }
}
```

Do not modify child command lines or trading arguments.

- [ ] **Step 5: Run PS7/PS5.1 source contracts GREEN**

Also run existing lifecycle broker protocol/source contracts to prove lifecycle semantics did not change.

- [ ] **Step 6: Commit**

```bash
git add scripts/run-phase7c-executor-task-runner-local.ps1 scripts/run-phase7c-executors-local.ps1 scripts/test-phase7c-runtime-source-attestation-source.ps1 scripts/test-phase7c-system-lifecycle-broker-source.ps1
git commit -m "feat: attest Phase7C executor runtime processes"
```

---

### Task 4: API self-attestation, runtime aggregation and GET-only endpoint

**Files:**
- Modify: `scripts/run-phase7b-api-runtime-local.ps1`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/services/phase7c-runtime-source-attestation.service.ts`
- Modify: `apps/api/src/services/phase7c-runtime-source-attestation.service.test.ts`
- Modify: `apps/api/src/routes/phase7c.route.ts`
- Modify: `scripts/test-phase7c-runtime-source-attestation-source.ps1`

**Interfaces:**
- Produces `writePhase7CApiRuntimeSourceAttestation()`.
- Produces `getPhase7CRuntimeSourceAttestationSnapshot()`.
- Exposes `GET /api/v1/phase7c/runtime-source-attestation` only on loopback.

- [ ] **Step 1: Add RED tests for full snapshot construction**

Use a temp fixture tree with `deployment.json`, component JSON, PID files and broker heartbeat/status. Inject `isPidAlive` and `hashFile` functions so the test can prove all four verdicts without real processes.

The all-exact fixture must assert:

```ts
assert.equal(snapshot.readOnly, true);
assert.equal(snapshot.overall, "EXACT_MATCH");
assert.equal(snapshot.components.length, 7);
assert.deepEqual(snapshot.safety, {
  readOnly: true,
  modeMutation: false,
  armMutation: false,
  autoGate: false,
  lifecycleGate: false,
  orderMutation: false,
  positionMutation: false,
  strategyMutation: false,
  autoRetune: false,
});
```

- [ ] **Step 2: Prove Node RED**

Run the Task 1 Node command. Expected: snapshot/writer exports missing.

- [ ] **Step 3: Pass immutable API attestation context from PowerShell**

Set only non-secret process env values before `pnpm --filter '@xauusd/api' start`:

```powershell
$env:PHASE7C_SOURCE_ATTESTATION_ROOT = Join-Path $WorkDir "phase7c-source-attestation"
$env:PHASE7C_SOURCE_ATTESTATION_API_LAUNCHER = $PSCommandPath
```

Do not pass commit/tree separately; Node reads the immutable deployment manifest.

- [ ] **Step 4: Write API record from actual Node PID**

In `apps/api/src/index.ts`, inside the successful `app.listen` callback call a non-throwing wrapper:

```ts
try {
  writePhase7CApiRuntimeSourceAttestation();
  console.log("PHASE7C_RUNTIME_SOURCE_ATTESTATION_API=WRITTEN");
} catch (error) {
  console.warn(`PHASE7C_RUNTIME_SOURCE_ATTESTATION_API=UNKNOWN reason=${error instanceof Error ? error.message : "unknown"}`);
}
```

The service writes `pid: process.pid`; the PowerShell wrapper PID must never be substituted.

- [ ] **Step 5: Implement canonical PID resolver and launcher mapping**

Use exact mappings:

```ts
api -> process.pid
lifecycle-broker -> heartbeat/status brokerPid (must agree)
supervisor -> phase7c-executors/supervisor.pid
trend -> phase7c-executors/trend.pid
sideway -> phase7c-executors/sideway.pid
telegram -> phase7c-executors/telegram-mode.pid
regime-notifier -> phase7c-executors/regime-notifier.pid
```

and exact launcher paths listed in Task 3 plus API launcher `scripts/run-phase7b-api-runtime-local.ps1`.

The normal GET path may read files and hash launcher bytes; it must never shell out to Git.

- [ ] **Step 6: Implement localhost GET route**

Place beside existing `/source-safety`/`/lifecycle` diagnostics:

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

No POST/PUT/PATCH/DELETE sibling route is added.

- [ ] **Step 7: Expand source contract with mutation and Git prohibitions**

Static assertions must reject these patterns in the new route/service/helper:

```text
phase7CBotModeService.set
ARM_LIVE
DISARM_LIVE
Start-ScheduledTask
Stop-ScheduledTask
/v1/orders with POST/DELETE
child_process
exec(
spawn(
git rev-parse in GET service
```

Allow `process.kill(pid, 0)`-style liveness only; no signal other than `0`.

- [ ] **Step 8: Run Node tests, API build and PowerShell contracts GREEN**

```bash
pnpm --filter @xauusd/api exec node --import tsx --test src/services/phase7c-runtime-source-attestation.service.test.ts
pnpm --filter @xauusd/api build
```

plus PS7/PS5.1 source contract.

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
- `getPhase7CRuntimeSourceAttestation(): Promise<Phase7CRuntimeSourceAttestationSnapshot>`
- Card query key: `phase7c-runtime-source-attestation`.

- [ ] **Step 1: Add RED static UI contract**

Require the Web type/API/card/shell to contain the GET client and exact warning copy:

```text
Runtime Source Attestation
READ-ONLY WARNING — NO AUTOMATIC ACTION TAKEN
```

and forbid mutation imports/calls in the new card (`useMutation`, `setPhase7CBotMode`, `enablePhase7CAuto`, ARM execute APIs, lifecycle action APIs).

- [ ] **Step 2: Prove RED under PS7 + PS5.1**

Expected: missing card/type/API getter.

- [ ] **Step 3: Add response types**

Define `Phase7CRuntimeSourceAttestationSnapshot` with the exact V1 deployment/component/safety fields from the spec. Keep `sourceCommit` full length in data; shorten only at render time.

- [ ] **Step 4: Add GET client**

```ts
export async function getPhase7CRuntimeSourceAttestation(): Promise<Phase7CRuntimeSourceAttestationSnapshot> {
  return read<Phase7CRuntimeSourceAttestationSnapshot>(
    await fetch(`${API_BASE}/api/v1/phase7c/runtime-source-attestation`, { cache: "no-store" }),
  );
}
```

- [ ] **Step 5: Implement the card with query-only behavior**

Use `useQuery` with a 5-second refresh and `retry: false`. Render accepted commit, shortened deployment ID, overall verdict, and seven component rows. Color mapping:

```text
EXACT_MATCH -> success
MISMATCH -> error
STALE -> warning
UNKNOWN -> warning/default
```

Non-exact overall must render the exact read-only warning. No button or switch belongs in this card.

- [ ] **Step 6: Mount card in `Phase7CControlCenterShellPage`**

Order:

```tsx
<Phase7CExecutionAuthorizationCard />
<Phase7CRuntimeSourceAttestationCard />
<Phase7CControlCenterPage />
```

This keeps authorization controls separate from provenance observability.

- [ ] **Step 7: Run Web build and source contract GREEN**

```bash
pnpm --filter @xauusd/web build
```

plus PS7/PS5.1 source contract.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/phase7c-types.ts apps/web/src/api.ts apps/web/src/ui/Phase7CRuntimeSourceAttestationCard.tsx apps/web/src/pages/Phase7CControlCenterShellPage.tsx scripts/test-phase7c-runtime-source-attestation-source.ps1
git commit -m "feat: show runtime source attestation in Control Center"
```

---

### Task 6: CI coverage and regression lock

**Files:**
- Modify: `.github/workflows/phase7c-canonical-pr-gate.yml`
- Modify: `.github/workflows/phase7c-runtime-ready-stable-recovery-deploy-ci.yml`
- Modify: `scripts/test-phase7c-runtime-source-attestation-source.ps1`

**Interfaces:**
- CI must exercise Node service behavior, PS7, PS5.1, API build, Web build, and all existing touched-path safety regressions.

- [ ] **Step 1: Add RED workflow assertions to the source contract**

Require both workflow files to reference `test-phase7c-runtime-source-attestation-source.ps1`. Require canonical Linux to run the TypeScript service test after installing workspace dependencies. Require recovery workflow path filters to include the new helper and all modified launch/deploy files.

- [ ] **Step 2: Prove RED**

Run source contract in PS7/PS5.1. Expected: workflow markers missing.

- [ ] **Step 3: Update Canonical PR Gate**

Add Linux step:

```yaml
- name: Runtime source attestation service contract
  run: pnpm --filter @xauusd/api exec node --import tsx --test src/services/phase7c-runtime-source-attestation.service.test.ts
```

Add Windows PS7 and PS5.1 source-contract steps. Do not grant write permissions; keep `permissions: contents: read`.

- [ ] **Step 4: Update Runtime Ready Stable Recovery Deploy CI**

Add P1 paths to PR/push path filters and add source-contract steps in both PowerShell engines. Preserve all existing battery/recovery/safety jobs unchanged.

- [ ] **Step 5: Run complete local/source verification**

Run:

```bash
pnpm --filter @xauusd/api exec node --import tsx --test src/services/phase7c-runtime-source-attestation.service.test.ts
pnpm --filter @xauusd/api build
pnpm --filter @xauusd/web build
node --test scripts/test-phase7c-canonical-pr-gate-contract.mjs
```

On Windows run:

```powershell
pwsh -NoProfile -File .\scripts\test-phase7c-runtime-source-attestation-source.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-phase7c-runtime-source-attestation-source.ps1
pwsh -NoProfile -File .\scripts\test-phase7c-system-lifecycle-broker-source.ps1
pwsh -NoProfile -File .\scripts\test-phase7c-system-lifecycle-broker-contract.ps1
pwsh -NoProfile -File .\scripts\test-phase7c-web-ui-safe-deploy-source.ps1
pwsh -NoProfile -File .\scripts\test-phase7c-runtime-ready-stable-recovery-deploy-source.ps1
pwsh -NoProfile -File .\scripts\test-phase7c-web-live-arm-demo-auto-source.ps1
```

Expected: all PASS, `git diff --check` clean.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/phase7c-canonical-pr-gate.yml .github/workflows/phase7c-runtime-ready-stable-recovery-deploy-ci.yml scripts/test-phase7c-runtime-source-attestation-source.ps1
git commit -m "ci: gate runtime source attestation"
```

---

### Task 7: Final source verification, PR and production-acceptance evidence

**Files:**
- Review all files changed by Tasks 1-6 plus the approved spec and this plan.
- No new production file should be introduced in this task.

**Interfaces:**
- Produces an exact tested head suitable for PR/merge.

- [ ] **Step 1: Verify branch provenance**

Before PR, record:

```bash
git merge-base --is-ancestor 4f156ef1b019ef676cc23ed978c9487eb41f2fe6 HEAD
git status --porcelain
git diff --check
git log --oneline --decorate -n 12
```

Expected: accepted base is an ancestor; worktree clean; diff check clean.

- [ ] **Step 2: Re-run the complete verification matrix from Task 6**

Do not reuse earlier GREEN output. This is the final tested head.

- [ ] **Step 3: Inspect diff for forbidden scope expansion**

The diff must contain no changes to strategy entry/exit rules, AUTO/ARM policy, order routes, recovery sizing, lot/TP business rules, or MT5 bridge trading behavior.

- [ ] **Step 4: Open non-draft PR against current `main`**

PR body must state:

```text
P1_V1=READ_ONLY
AUTO_GATE=NONE
ARM_GATE=NONE
START_GATE=NONE
ORDER_MUTATION=NONE
AUTO_RETUNE=NONE
LIVE_DEPLOYMENT_IN_PR=NONE
```

and include the exact RED run evidence plus final GREEN run evidence.

- [ ] **Step 5: Require fresh PR CI on exact PR head**

Minimum required fresh checks:

```text
Phase7C Canonical PR Gate = SUCCESS
Phase7C Runtime Ready Stable Recovery Deploy CI = SUCCESS
```

Do not merge if head SHA changes after the last inspected CI.

- [ ] **Step 6: Merge only the exact tested head**

Use squash merge with expected head SHA. After merge, capture the new `main` SHA and verify main-push CI on that exact merge SHA is SUCCESS.

- [ ] **Step 7: Mark source production-accepted, not yet LIVE-proven**

At this point the correct state is:

```text
P1_SOURCE_PRODUCTION_ACCEPTED=TRUE
P1_RUNTIME_LIVE_PROVEN=FALSE
LIVE_RUNTIME_MUTATION=NONE
```

because old LIVE processes cannot retrospectively have P1 attestations.

---

### Task 8: Guarded LIVE rollout and post-deploy proof — separate operator approval required

**Files:**
- No source edits.
- Uses existing canonical source-sync/read-only-preflight/recovery/deploy procedures after exact merged main SHA is known.

**Interfaces:**
- Produces the final acceptance condition `POST_DEPLOY_RUNTIME_ATTESTATION=EXACT_MATCH`.

- [ ] **Step 1: Stop before any LIVE mutation and obtain explicit operator approval**

Do not PAUSE, DISARM, restart, deploy, or recover as part of source implementation. Present current LIVE state and exact merged/main CI evidence first.

- [ ] **Step 2: Sync LIVE source by guarded fast-forward only**

After approval, resolve the actual merged main SHA from GitHub, verify local `main`, clean worktree, and fast-forward-only ancestry. No destructive Git reset/clean.

- [ ] **Step 3: Run fresh read-only LIVE preflight**

Require account/runtime/positions/orders/task/broker/lifecycle state to classify an approved canonical deployment route. If mixed or blocked, stop; do not improvise a restart.

- [ ] **Step 4: Perform the existing canonical controlled deploy/recovery once**

Use the exact merged SHA as `ExpectedCommit`. Preserve the existing policy that controlled recovery ends `PAUSE + DISARMED + flat` before any later operator ARM/AUTO action.

- [ ] **Step 5: Query the new GET endpoint before ARM/AUTO**

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:3711/api/v1/phase7c/runtime-source-attestation" -Method Get
```

Require:

```text
overall=EXACT_MATCH
api=EXACT_MATCH
lifecycle-broker=EXACT_MATCH
supervisor=EXACT_MATCH
trend=EXACT_MATCH
sideway=EXACT_MATCH
telegram=EXACT_MATCH
regime-notifier=EXACT_MATCH
readOnly=true
```

Also require canonical runtime health, zero task definition drift, fresh broker heartbeat, startup lock HELD, lifecycle READY, XAUUSD flat.

- [ ] **Step 6: Only after exact attestation proof, use existing manual ARM/AUTO procedure if the operator separately requests it**

P1 itself must never invoke ARM/AUTO. The final P1 evidence is:

```text
P1_RUNTIME_LIVE_PROVEN=TRUE
POST_DEPLOY_RUNTIME_ATTESTATION=EXACT_MATCH
P1_MODE_MUTATION=NONE
P1_ARM_MUTATION=NONE
P1_ORDER_MUTATION=NONE
P1_AUTO_RETUNE=NONE
```

---

## Plan Self-Review Checklist

Before execution starts, verify these mappings:

- Spec deployment manifest/idempotency -> Tasks 1-2.
- Spec non-secret fingerprint -> Task 1, with only stable launch identity in V1.
- Spec seven required components/canonical PIDs -> Tasks 3-4.
- Spec API self-PID -> Task 4.
- Spec GET-only/no Git/no mutations -> Task 4 + Task 6 source contract.
- Spec Control Center warning/no actions -> Task 5.
- Spec PS7/PS5.1 + API/Web build + regression -> Task 6.
- Spec PR/main CI -> Task 7.
- Spec post-deploy `EXACT_MATCH` -> Task 8.
- P2/P3/P4/P5 are not implemented by this plan.
