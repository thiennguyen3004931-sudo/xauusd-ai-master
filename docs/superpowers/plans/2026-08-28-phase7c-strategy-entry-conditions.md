# Phase 7C Strategy Entry Conditions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one canonical, versioned, Web-editable strategy-entry-condition profile for Phase 7C Trend and Sideway that applies on the next NEW ENTRY cycle without executor restart, preserves current defaults exactly, keeps mandatory directional anchors locked, and cannot weaken safety/risk/orchestration gates.

**Architecture:** A shared pure ESM contract module under `scripts/` owns condition IDs, defaults, mandatory-anchor rules, validation, PASS/FAIL/IGNORED composition, and version comparison. The API owns the single persisted `.runtime/phase7c-strategy-entry-conditions.json` file and whole-state optimistic-concurrency writes. Trend and Sideway consume immutable snapshots per entry cycle, recheck config version immediately before order mutation, and write the normalized condition result into the existing decision-audit channel. Web Control Center edits only non-mandatory toggles and renders `patternM15` / `rangeEdge` as checked locked anchors.

**Tech Stack:** Node.js ESM/MJS, TypeScript 5.9 API, Express 4, React 19, MUI 7, TanStack Query 5, pnpm 10.18, repository Node contract scripts, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-28-phase7c-strategy-entry-conditions-design.md` at approved spec commit `4f56cda197ff40b3515b0b7ae6e41b8c47bbe62a`.

## Global Constraints

- Implementation branch starts from exact approved design HEAD `4f56cda197ff40b3515b0b7ae6e41b8c47bbe62a`; do not start from a stale `main` checkout.
- NEW ENTRY only. HOLD, BE +6, one-third partial +10, structural trailing, TP2, Recovery TP, exit logic, lot/risk, LIVE ARM, account-switch, lifecycle-broker, and Telegram control semantics remain unchanged.
- DEMO and LIVE share exactly one strategy-condition profile; do not create `.demo.json` / `.live.json` strategy-condition files.
- Saving is allowed only while `BOT_MODE=PAUSE`, account state is valid, Bridge telemetry is usable, and XAUUSD position count is `0`.
- Trend `patternM15=true` is mandatory and is the only strategy-profile origin of Trend BUY/SELL.
- Sideway `rangeEdge=true` is mandatory and is the only strategy-profile origin of Sideway BUY/SELL.
- Sideway `m5Confirmation` remains toggleable and only confirms the side already selected by `rangeEdge`.
- All enabled conditions use logical AND; disabled non-mandatory conditions report `IGNORED`, never `PASS`.
- Internal parameters/thresholds remain canonical and are not editable through this feature.
- No executor restart is required to apply a successful strategy-condition save.
- A config version change between entry evaluation and final order boundary blocks the order with `ENTRY_CONFIG_VERSION_CHANGED`; no stale-signal retry.
- Invalid persisted config fails closed for NEW ENTRY and is not silently replaced with defaults.
- The no-file state is valid virtual E1 default version `0`; first save persists version `1`.
- No LIVE or DEMO order is sent for testing. Use pure/synthetic contracts and order-boundary stubs only.
- Preserve runtime safety while source work is performed: do not ARM, do not AUTO, do not restart Bridge/executors, and do not mutate an existing position as part of these tasks.
- TDD order is mandatory per task: RED test -> prove exact RED cause -> minimum production change -> GREEN -> commit. Full CI occurs only after all focused tests are GREEN.

---

## File Structure Map

### Create

- `scripts/phase7c-strategy-entry-conditions.mjs` — canonical condition catalog, E1 defaults, mandatory-anchor rules, schema validation, evaluator, version comparator.
- `scripts/phase7c-strategy-entry-conditions.d.mts` — TypeScript declarations for the shared MJS module imported by API TypeScript.
- `apps/api/src/services/phase7c-strategy-entry-conditions.service.ts` — canonical file read/write service, virtual-default behavior, invalid-file fail-closed behavior, versioned atomic persistence.
- `apps/web/src/ui/Phase7CStrategyEntryConditionsCard.tsx` — dedicated Control Center editor/status card.
- `scripts/test-phase7c-strategy-entry-conditions-core-contract.mjs` — pure shared-module RED/GREEN contracts.
- `scripts/test-phase7c-strategy-entry-conditions-api-contract.mjs` — service/route source and persistence contracts.
- `scripts/test-phase7c-strategy-entry-conditions-audit-contract.mjs` — audit/monitor normalized payload contracts.
- `scripts/test-phase7c-trend-strategy-entry-conditions-contract.mjs` — Trend default-equivalence, toggle, anchor, and version-race contracts.
- `scripts/test-phase7c-sideway-strategy-entry-conditions-contract.mjs` — Sideway default-equivalence, `rangeEdge`, M5 toggle, and version-race contracts.
- `scripts/test-phase7c-strategy-entry-conditions-web-contract.mjs` — Web/API-client locked-anchor, runtime-lock, stale-version, restore/default draft contracts.
- `.github/workflows/phase7c-strategy-entry-conditions-ci.yml` — focused feature CI plus API/Web builds and selected safety regressions.

### Modify

- `apps/api/src/routes/phase7c.route.ts` — add GET/POST `/strategy-entry-conditions` with authorization and runtime save guards.
- `scripts/phase7c-decision-audit.mjs` — preserve `entryConditions` normalized telemetry and new entry strategy reason codes in the existing audit record.
- `apps/api/src/services/phase7c-decision-monitor.service.ts` — expose latest Trend/Sideway `entryConditions` without replacing later safety block reasons.
- `scripts/run-phase7b-demo-controller.ts` — read one config snapshot per NEW ENTRY cycle, use `patternM15` anchor, compose toggles, final version recheck before order mutation.
- `scripts/run-phase7c-sideway-controller.mjs` — read one config snapshot per NEW ENTRY cycle, keep `rangeEdge` as side origin, make M5 optional, final version recheck before order mutation.
- `apps/web/src/phase7c-types.ts` — add strategy-condition state/snapshot/audit UI types.
- `apps/web/src/api.ts` — add GET/POST client functions for strategy-entry conditions.
- `apps/web/src/pages/Phase7CControlCenterShellPage.tsx` — render the new card in Control Center, separate from Account & Risk and LIVE ARM card.

### Explicitly Do Not Modify

- Lot limits or lot settings behavior.
- LIVE ARM authorization logic.
- lifecycle START/STOP implementation.
- account-switch/recovery implementation.
- HOLD/BE/partial/Recovery TP management state machines.
- MT5 Bridge order permission to create a test order.

---

### Task 1: Shared Canonical Contract and Evaluator

**Files:**
- Create: `scripts/phase7c-strategy-entry-conditions.mjs`
- Create: `scripts/phase7c-strategy-entry-conditions.d.mts`
- Test: `scripts/test-phase7c-strategy-entry-conditions-core-contract.mjs`

**Interfaces:**
- Produces `TREND_STRATEGY_CONDITION_IDS`, `SIDEWAY_STRATEGY_CONDITION_IDS`, `STRATEGY_ENTRY_MANDATORY`, `createVirtualStrategyEntryConditionState()`, `validateStrategyEntryConditionState(value, options)`, `evaluateStrategyEntryConditions(input)`, and `compareStrategyEntryConfigVersion(cycleSnapshot, currentSnapshot)`.
- `evaluateStrategyEntryConditions` consumes a canonical side already produced by the adapter and a complete observation map. It never invents an alternate side.

- [ ] **Step 1: Write the failing pure contract first**

Create `scripts/test-phase7c-strategy-entry-conditions-core-contract.mjs` with assertions equivalent to:

```js
import assert from "node:assert/strict";
import {
  STRATEGY_ENTRY_MANDATORY,
  createVirtualStrategyEntryConditionState,
  validateStrategyEntryConditionState,
  evaluateStrategyEntryConditions,
  compareStrategyEntryConfigVersion,
} from "./phase7c-strategy-entry-conditions.mjs";

const defaults = createVirtualStrategyEntryConditionState();
assert.equal(defaults.version, 0);
assert.equal(defaults.trend.patternM15, true);
assert.equal(defaults.trend.supertrendM15, true);
assert.equal(defaults.trend.supertrendM5, true);
assert.equal(defaults.trend.validTrendStructure, true);
assert.equal(defaults.trend.ma20Ma50, false);
assert.equal(defaults.trend.fvg, false);
assert.equal(defaults.sideway.rangeEdge, true);
assert.equal(defaults.sideway.m5Confirmation, true);
assert.deepEqual(STRATEGY_ENTRY_MANDATORY, {
  TREND: ["patternM15"],
  SIDEWAY: ["rangeEdge"],
});

assert.equal(validateStrategyEntryConditionState(defaults, { allowVirtualVersionZero: true }).valid, true);
assert.equal(validateStrategyEntryConditionState({ ...defaults, trend: { ...defaults.trend, patternM15: false } }, { allowVirtualVersionZero: true }).valid, false);
assert.equal(validateStrategyEntryConditionState({ ...defaults, sideway: { ...defaults.sideway, rangeEdge: false } }, { allowVirtualVersionZero: true }).valid, false);

const trend = evaluateStrategyEntryConditions({
  strategy: "TREND",
  config: defaults,
  side: "BUY",
  observations: {
    patternM15: { passed: true, observed: "BULLISH_ENGULFING" },
    supertrendM15: { passed: true, observed: "BUY" },
    supertrendM5: { passed: false, observed: "SELL" },
    validTrendStructure: { passed: true, observed: "VALID" },
    ma20Ma50: { passed: false, observed: "SELL" },
    fvg: { passed: false, observed: "NONE" },
  },
});
assert.equal(trend.allEnabledPassed, false);
assert.equal(trend.conditions.find((row) => row.id === "supertrendM5").status, "FAIL");
assert.equal(trend.conditions.find((row) => row.id === "ma20Ma50").status, "IGNORED");
assert.equal(trend.conditions.find((row) => row.id === "patternM15").mandatory, true);

assert.deepEqual(
  compareStrategyEntryConfigVersion({ version: 7, valid: true }, { version: 8, valid: true }),
  { ok: false, reasonCode: "ENTRY_CONFIG_VERSION_CHANGED" },
);
assert.deepEqual(
  compareStrategyEntryConfigVersion({ version: 7, valid: true }, { version: 7, valid: false }),
  { ok: false, reasonCode: "ENTRY_STRATEGY_CONFIG_INVALID" },
);
```

Also include negative assertions for unknown key, missing key, non-boolean value, `version < 0`, persisted `version=0` when `allowVirtualVersionZero=false`, and zero enabled condition sets.

- [ ] **Step 2: Run RED and prove the exact cause**

Run:

```bash
node scripts/test-phase7c-strategy-entry-conditions-core-contract.mjs
```

Expected RED: Node fails because `scripts/phase7c-strategy-entry-conditions.mjs` does not exist. Record that the failure is absence of the approved canonical module, not an unrelated runtime/network failure.

- [ ] **Step 3: Implement the minimum shared module**

Create `scripts/phase7c-strategy-entry-conditions.mjs` with these exact public names and semantics:

```js
export const TREND_STRATEGY_CONDITION_IDS = Object.freeze([
  "patternM15", "supertrendM15", "supertrendM5", "validTrendStructure", "ma20Ma50", "fvg",
]);
export const SIDEWAY_STRATEGY_CONDITION_IDS = Object.freeze([
  "rangingRegime", "recommendedModeSideway", "minimumRegimeConfidence", "supplyDemandRange", "rangeEdge", "m5Confirmation",
]);
export const STRATEGY_ENTRY_MANDATORY = Object.freeze({
  TREND: Object.freeze(["patternM15"]),
  SIDEWAY: Object.freeze(["rangeEdge"]),
});

export function createVirtualStrategyEntryConditionState() {
  return {
    version: 0,
    updatedAt: new Date(0).toISOString(),
    updatedBy: "safe-default",
    trend: {
      patternM15: true,
      supertrendM15: true,
      supertrendM5: true,
      validTrendStructure: true,
      ma20Ma50: false,
      fvg: false,
    },
    sideway: {
      rangingRegime: true,
      recommendedModeSideway: true,
      minimumRegimeConfidence: true,
      supplyDemandRange: true,
      rangeEdge: true,
      m5Confirmation: true,
    },
  };
}
```

Validation must whitelist exact keys, require booleans, require `patternM15 === true` and `rangeEdge === true`, and return a structured object rather than silently coercing data:

```js
{ valid: true, state }
// or
{ valid: false, reasonCode: "ENTRY_STRATEGY_CONFIG_INVALID", error: "..." }
```

Evaluator output shape is fixed:

```js
{
  configVersion,
  side,
  anchorCondition,
  enabledCount,
  allEnabledPassed,
  failedConditions,
  conditions: [{ id, enabled, mandatory, status, observed }],
}
```

`compareStrategyEntryConfigVersion` returns `{ ok: true }`, `ENTRY_CONFIG_VERSION_CHANGED`, or `ENTRY_STRATEGY_CONFIG_INVALID` only.

Create `scripts/phase7c-strategy-entry-conditions.d.mts` declaring the same exports so API TypeScript can import the MJS module without `any` drift.

- [ ] **Step 4: Run focused GREEN**

```bash
node scripts/test-phase7c-strategy-entry-conditions-core-contract.mjs
```

Expected: PASS with an explicit final line such as `PHASE7C_STRATEGY_ENTRY_CORE_CONTRACT=PASS`.

- [ ] **Step 5: Commit Task 1**

```bash
git add scripts/phase7c-strategy-entry-conditions.mjs scripts/phase7c-strategy-entry-conditions.d.mts scripts/test-phase7c-strategy-entry-conditions-core-contract.mjs
git commit -m "feat(strategy): add canonical entry condition contract"
```

---

### Task 2: Canonical Persistence Service

**Files:**
- Create: `apps/api/src/services/phase7c-strategy-entry-conditions.service.ts`
- Modify only if required for TypeScript resolution: `apps/api/tsconfig.json`
- Test: `scripts/test-phase7c-strategy-entry-conditions-api-contract.mjs`

**Interfaces:**
- Consumes shared validation/defaults from `../../../../scripts/phase7c-strategy-entry-conditions.mjs`.
- Produces `Phase7CStrategyEntryConditionsService`, singleton `phase7CStrategyEntryConditionsService`, typed error `Phase7CStrategyEntryConfigError`, and methods `read()` / `set(input)`.

- [ ] **Step 1: Extend the API contract test for persistence RED**

In `scripts/test-phase7c-strategy-entry-conditions-api-contract.mjs`, use a temporary directory and dynamically import the service after API build. Assert these cases:

```js
const service = new Phase7CStrategyEntryConditionsService(tempFile);
const initial = service.read();
assert.equal(initial.valid, true);
assert.equal(initial.persisted, false);
assert.equal(initial.state.version, 0);

const saved = service.set({
  expectedVersion: 0,
  source: "web-control-center",
  trend: initial.state.trend,
  sideway: { ...initial.state.sideway, m5Confirmation: false },
});
assert.equal(saved.state.version, 1);
assert.equal(saved.state.sideway.m5Confirmation, false);
assert.equal(fs.existsSync(tempFile), true);
```

Then assert stale version performs no write, `patternM15=false` and `rangeEdge=false` are rejected, unknown keys are rejected, an existing malformed file returns `valid=false`, and `set()` refuses to repair that malformed file through the normal path.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @xauusd/api build
node scripts/test-phase7c-strategy-entry-conditions-api-contract.mjs
```

Expected RED: service module/import is missing. The API build before implementation may pass; the focused contract must fail specifically because the new service does not exist.

- [ ] **Step 3: Implement the persistence service minimally**

Use a constructor with an injectable path:

```ts
export class Phase7CStrategyEntryConditionsService {
  constructor(
    filePath = process.env.PHASE7C_STRATEGY_ENTRY_CONDITIONS_FILE,
  ) {
    this.filePath = filePath?.trim()
      ? resolve(filePath)
      : resolve(process.cwd(), ".runtime", "phase7c-strategy-entry-conditions.json");
  }

  read(): Phase7CStrategyEntryReadResult { /* exact validation behavior below */ }
  set(input: Phase7CStrategyEntryWriteInput): Phase7CStrategyEntryReadResult { /* exact write behavior below */ }
}
```

`read()` behavior:

```ts
// no file
{ state: createVirtualStrategyEntryConditionState(), valid: true, persisted: false, error: null }

// valid file
{ state: parsedValidatedState, valid: true, persisted: true, error: null }

// existing invalid file
{ state: null, valid: false, persisted: true, error: validation.error }
```

`set()` must first call `read()`. If persisted state is invalid, throw `Phase7CStrategyEntryConfigError("ENTRY_STRATEGY_CONFIG_INVALID", ...)`. Require exact `expectedVersion`. Build the persisted next state with `version: current.version + 1`, current ISO timestamp, restricted source, and validated whole Trend/Sideway shape. Persist through same-directory temp file + `renameSync`, matching the repository atomic lot-settings pattern.

Define typed error codes:

```ts
export type Phase7CStrategyEntryConfigErrorCode =
  | "ENTRY_STRATEGY_CONFIG_INVALID"
  | "CONFIG_VERSION_CONFLICT";
```

Do not add account-specific strategy-condition profile files.

- [ ] **Step 4: Run GREEN and API build**

```bash
pnpm --filter @xauusd/api build
node scripts/test-phase7c-strategy-entry-conditions-api-contract.mjs
```

Expected: both PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/api/src/services/phase7c-strategy-entry-conditions.service.ts scripts/test-phase7c-strategy-entry-conditions-api-contract.mjs apps/api/tsconfig.json
git commit -m "feat(api): persist strategy entry condition profiles"
```

Only add `apps/api/tsconfig.json` to the commit if an actual MJS declaration-resolution change was required; otherwise leave it untouched.

---

### Task 3: GET/POST API With Runtime Save Guards

**Files:**
- Modify: `apps/api/src/routes/phase7c.route.ts`
- Test: `scripts/test-phase7c-strategy-entry-conditions-api-contract.mjs`

**Interfaces:**
- `GET /api/v1/phase7c/strategy-entry-conditions`
- `POST /api/v1/phase7c/strategy-entry-conditions`
- Reuses existing `canChangeBotMode`, `phase7CBotModeService`, `getPhase7CAccountModeState`, `getMt5Telemetry`, and `accountModeAllowsBroker`.

- [ ] **Step 1: Add route-source and route-behavior RED assertions**

The focused script must assert the route exposes both endpoints and that POST checks authorization, PAUSE, valid account state, matching/healthy Bridge telemetry, zero XAUUSD positions, whole-state payload, expected version, and mandatory anchors before calling `set()`.

Expected response semantics:

```text
403  mutation not authorized
400  malformed/schema-invalid payload or mandatory anchor false
409  mode != PAUSE
409  invalid account state
409  Bridge/account-mode guard cannot be proven
409  positions > 0
409  CONFIG_VERSION_CONFLICT
409  existing persisted config invalid / non-editable
200  successful save
```

GET must be read-only. If Bridge telemetry is unavailable, still return the config state plus `editable=false` and guard status; do not mutate anything.

- [ ] **Step 2: Run RED**

```bash
node scripts/test-phase7c-strategy-entry-conditions-api-contract.mjs
```

Expected RED: route declarations/guard contract are absent.

- [ ] **Step 3: Add the routes minimally**

Import the singleton/error type and implement GET response shape:

```ts
{
  state: read.valid ? read.state : null,
  valid: read.valid,
  editable,
  error: read.error,
  appliesTo: "NEW_ENTRIES_ONLY",
  sharedAcrossAccounts: true,
  mandatory: { trend: ["patternM15"], sideway: ["rangeEdge"] },
  guards: {
    mode,
    accountStateValid,
    bridgeReachable,
    accountModeMatches,
    openXauusdPositions,
  },
  safety: { requiresPause: true, requiresZeroXauusdPositions: true },
}
```

POST body is whole-state only:

```ts
const input = {
  expectedVersion: Number(req.body?.expectedVersion),
  trend: req.body?.trend,
  sideway: req.body?.sideway,
  source: req.body?.source,
};
```

Do not accept threshold/parameter fields. Do not silently retry `CONFIG_VERSION_CONFLICT`. Do not create or start executors from this route.

- [ ] **Step 4: Run GREEN and build**

```bash
node scripts/test-phase7c-strategy-entry-conditions-api-contract.mjs
pnpm --filter @xauusd/api build
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/api/src/routes/phase7c.route.ts scripts/test-phase7c-strategy-entry-conditions-api-contract.mjs
git commit -m "feat(api): expose guarded strategy entry condition API"
```

---

### Task 4: Decision Audit and Monitor Observability

**Files:**
- Modify: `scripts/phase7c-decision-audit.mjs`
- Modify: `apps/api/src/services/phase7c-decision-monitor.service.ts`
- Test: `scripts/test-phase7c-strategy-entry-conditions-audit-contract.mjs`

**Interfaces:**
- Audit payload field `entryConditions` keeps the evaluator result.
- New canonical entry reason/event codes: `ENTRY_STRATEGY_CONDITION_BLOCK`, `ENTRY_STRATEGY_CONDITIONS_PASS`, `ENTRY_CONFIG_VERSION_CHANGED`, `ENTRY_STRATEGY_CONFIG_INVALID`.
- Monitor exposes latest entry-condition result for each strategy without treating `ENTRY_STRATEGY_CONDITIONS_PASS` as permission to trade.

- [ ] **Step 1: Write audit RED**

Test `__test.normalizeRecord` with:

```js
const record = __test.normalizeRecord("TREND", "XAUUSD", {}, "ENTRY_STRATEGY_CONDITION_BLOCK", {
  side: "BUY",
  reason: "Enabled condition failed",
  entryConditions: {
    configVersion: 3,
    side: "BUY",
    anchorCondition: "patternM15",
    enabledCount: 4,
    allEnabledPassed: false,
    failedConditions: ["supertrendM5"],
    conditions: [
      { id: "patternM15", enabled: true, mandatory: true, status: "PASS", observed: "BULLISH_ENGULFING" },
      { id: "supertrendM5", enabled: true, mandatory: false, status: "FAIL", observed: "SELL" },
    ],
  },
});
assert.equal(record.reasonCode, "ENTRY_STRATEGY_CONDITION_BLOCK");
assert.equal(record.entryConditions.configVersion, 3);
assert.deepEqual(record.entryConditions.failedConditions, ["supertrendM5"]);
```

Also assert an existing safety-block event that occurs after a strategy-pass retains its safety `reasonCode`; strategy-pass must not overwrite final block reason.

- [ ] **Step 2: Run RED**

```bash
node scripts/test-phase7c-strategy-entry-conditions-audit-contract.mjs
```

Expected RED: normalized audit does not yet preserve `entryConditions`.

- [ ] **Step 3: Extend audit and monitor minimally**

In `normalizeRecord`, add:

```js
entryConditions: payload?.entryConditions && typeof payload.entryConditions === "object"
  ? payload.entryConditions
  : null,
```

Do not change canonical HOLD translations. Update monitor `DecisionAuditRecord` type and snapshot assembly so the newest Trend and Sideway audit row containing `entryConditions` can be returned for Web observability. Keep final `preTrade` safety decision logic independent.

- [ ] **Step 4: Run GREEN and API build**

```bash
node scripts/test-phase7c-strategy-entry-conditions-audit-contract.mjs
pnpm --filter @xauusd/api build
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add scripts/phase7c-decision-audit.mjs apps/api/src/services/phase7c-decision-monitor.service.ts scripts/test-phase7c-strategy-entry-conditions-audit-contract.mjs
git commit -m "feat(observability): report strategy entry condition decisions"
```

---

### Task 5: Trend Executor Integration

**Files:**
- Modify: `scripts/run-phase7b-demo-controller.ts`
- Test: `scripts/test-phase7c-trend-strategy-entry-conditions-contract.mjs`
- Regression inputs: existing Trend entry/pullback/recovery contract scripts and `phase7b-supertrend-entry-gates-ci.yml` / `phase7b-wait-pullback-ci.yml` commands.

**Interfaces:**
- Reads one config snapshot at the beginning of each NEW ENTRY evaluation.
- `patternM15` remains the sole side origin.
- Optional Trend confirmations only confirm/reject anchor side.
- Before any order POST, re-read config and call `compareStrategyEntryConfigVersion`.

- [ ] **Step 1: Write Trend RED contracts before changing controller**

The new contract script must statically/dynamically prove all of these:

```text
E1 default == existing Trend gate:
patternM15 AND supertrendM15 AND supertrendM5 AND validTrendStructure
ma20Ma50 disabled
fvg disabled

patternM15 is mandatory and never IGNORED
supertrendM15 disabled => IGNORED and no longer blocks
supertrendM5 disabled => IGNORED and no longer blocks
ma20Ma50 enabled + disagreement => FAIL
fvg enabled + missing/same-side false => FAIL
all enabled PASS => strategy gate PASS
config invalid => ENTRY_STRATEGY_CONFIG_INVALID and no order mutation
mid-cycle version mismatch => ENTRY_CONFIG_VERSION_CHANGED and no order mutation
```

Use pure helpers/stubs; no Bridge order endpoint may be called.

- [ ] **Step 2: Run Trend RED and prove exact failure**

```bash
node scripts/test-phase7c-trend-strategy-entry-conditions-contract.mjs
```

Expected RED: controller has hard-coded Trend entry gating and no strategy-condition snapshot/version recheck.

- [ ] **Step 3: Refactor only NEW ENTRY evaluation**

Import shared helpers. At the point the current M15 trigger is available, construct anchor first:

```ts
const trigger = detectEntryPattern(m15, index);
if (!trigger) return null;
const cycleConfig = readStrategyEntrySnapshotOrFailClosed();
const side = trigger.side;
```

Compute existing canonical observations without changing indicator parameters:

```ts
const observations = {
  patternM15: { passed: true, observed: `${side}:${trigger.pattern}` },
  supertrendM15: { passed: m15Direction === side, observed: m15Direction },
  supertrendM5: { passed: m5Direction === side, observed: m5Direction },
  validTrendStructure: { passed: structuralStopDistance > 0, observed: structuralStopDistance > 0 ? "VALID" : "INVALID" },
  ma20Ma50: { passed: side === "BUY" ? ma20 > ma50 : ma20 < ma50, observed: ma20 > ma50 ? "BUY" : ma20 < ma50 ? "SELL" : "FLAT" },
  fvg: { passed: sameDirectionFvgConfirmed, observed: sameDirectionFvgConfirmed ? side : "NONE" },
};
```

Use the existing FVG detector/diagnostic value; do not introduce a new FVG definition. If the exact existing observation is produced elsewhere in the controller, wire that value into this map rather than duplicating detector logic.

Evaluate:

```ts
const entryConditions = evaluateStrategyEntryConditions({
  strategy: "TREND",
  config: cycleConfig.state,
  side,
  observations,
});
if (!entryConditions.allEnabledPassed) {
  journal("ENTRY_STRATEGY_CONDITION_BLOCK", { side, entryConditions, reason: entryConditions.failedConditions.join(",") });
  return null;
}
journal("ENTRY_STRATEGY_CONDITIONS_PASS", { side, entryConditions });
```

Immediately before the existing order mutation boundary, re-read only the strategy config and block on mismatch/invalid:

```ts
const versionGuard = compareStrategyEntryConfigVersion(
  { version: cycleConfig.state.version, valid: true },
  readCurrentStrategyEntryVersion(),
);
if (!versionGuard.ok) {
  journal(versionGuard.reasonCode, { side, entryConditions });
  return;
}
```

Do not move/relax Bridge, account, position, spread, lot, ARM, or final market safety gates.

- [ ] **Step 4: Run focused GREEN plus existing Trend regressions**

```bash
node scripts/test-phase7c-trend-strategy-entry-conditions-contract.mjs
node scripts/test-phase7c-trend-entry-recovery-contract.mjs
node scripts/test-phase7c-reversal-entry-gate-contract.mjs
pnpm --filter @xauusd/api build
```

If an existing script has a different exact filename on the execution checkout, list `scripts/test-phase7c-*trend*` / workflow commands first and run the repository's canonical equivalent; do not skip the regression category.

Expected: all selected Trend contracts GREEN and no test sends an order.

- [ ] **Step 5: Commit Task 5**

```bash
git add scripts/run-phase7b-demo-controller.ts scripts/test-phase7c-trend-strategy-entry-conditions-contract.mjs
git commit -m "feat(trend): apply configurable entry condition profile"
```

---

### Task 6: Sideway Executor Integration

**Files:**
- Modify: `scripts/run-phase7c-sideway-controller.mjs`
- Test: `scripts/test-phase7c-sideway-strategy-entry-conditions-contract.mjs`
- Regression inputs: existing Sideway regime/recovery/management contracts and `phase7c-sideway-regime-ci.yml` commands.

**Interfaces:**
- `rangeEdge` stays mandatory and uses existing `chooseRangeSide(...)` as sole side origin.
- `m5Confirmation=false` yields IGNORED and does not call M5 confirmation as a required gate.
- Mandatory orchestration `resolveSidewayPermission(...)` remains outside the editable strategy profile even if `recommendedModeSideway` is disabled as an observation.

- [ ] **Step 1: Write Sideway RED contracts**

Assert:

```text
E1 default == existing Sideway strategy entry behavior
rangeEdge=false is invalid before executor evaluation
rangeEdge cannot be IGNORED
rangeEdge chooses BUY/SELL using current chooseRangeSide logic
m5Confirmation=true + matching confirmation => PASS
m5Confirmation=true + no matching confirmation => FAIL
m5Confirmation=false => IGNORED and does not block
rangingRegime / recommendedModeSideway / confidence / supplyDemandRange each become IGNORED when disabled
missing usable range still makes mandatory rangeEdge FAIL even if supplyDemandRange toggle is disabled
resolveSidewayPermission remains mandatory and cannot be disabled
version mismatch before order boundary => no order mutation
```

- [ ] **Step 2: Run Sideway RED**

```bash
node scripts/test-phase7c-sideway-strategy-entry-conditions-contract.mjs
```

Expected RED: current controller hard-codes all regime/range/M5 conditions and has no config snapshot/version recheck.

- [ ] **Step 3: Implement minimum Sideway composition**

At new-entry cycle start, read config snapshot together with market/control inputs or immediately before strategic evaluation. Keep the existing mandatory permission first or separately mandatory:

```js
const permission = resolveSidewayPermission(activeMode, regime?.recommendedMode);
if (!permission.allowed) {
  journal("ENTRY_MODE_BLOCK", permission);
  return;
}
```

Resolve mandatory side with existing code:

```js
const side = regime?.supplyDemandRange
  ? chooseRangeSide(regime.supplyDemandRange, Number(quote.bid), Number(quote.ask))
  : null;
```

Build observations:

```js
const confirmation = side ? detectM5Confirmation(m5, side) : null;
const observations = {
  rangingRegime: { passed: regime?.regime === "RANGING", observed: regime?.regime ?? null },
  recommendedModeSideway: { passed: regime?.recommendedMode === "SIDEWAY", observed: regime?.recommendedMode ?? null },
  minimumRegimeConfidence: { passed: Number(regime?.confidence ?? 0) >= minRegimeConfidence, observed: regime?.confidence ?? null },
  supplyDemandRange: { passed: Boolean(regime?.supplyDemandRange), observed: Boolean(regime?.supplyDemandRange) ? "VALID" : "MISSING" },
  rangeEdge: { passed: side === "BUY" || side === "SELL", observed: side },
  m5Confirmation: { passed: Boolean(confirmation && Number(confirmation.closeTime) === closeTime), observed: confirmation?.pattern ?? null },
};
```

Evaluate through the shared module. Disabled M5 becomes `IGNORED`; do not require its pass in controller branches outside the evaluator. Keep `rangeEdge` mandatory.

At final market recheck, preserve existing final permission, freshness, spread, and side-consistency checks. Add config version recheck before order mutation. Do not make disabled `recommendedModeSideway` bypass `resolveSidewayPermission`.

- [ ] **Step 4: Run focused GREEN plus Sideway regressions**

```bash
node scripts/test-phase7c-sideway-strategy-entry-conditions-contract.mjs
node scripts/test-phase7c-sideway-recovery-management-contract.mjs
node scripts/test-phase7c-sideway-execution-guards.mjs
```

If the execution checkout names the guard test differently, run the exact test command referenced by `.github/workflows/phase7c-sideway-regime-ci.yml`; do not omit guard coverage.

Expected: GREEN and no Bridge order mutation.

- [ ] **Step 5: Commit Task 6**

```bash
git add scripts/run-phase7c-sideway-controller.mjs scripts/test-phase7c-sideway-strategy-entry-conditions-contract.mjs
git commit -m "feat(sideway): apply configurable entry condition profile"
```

---

### Task 7: Web Control Center Editor

**Files:**
- Create: `apps/web/src/ui/Phase7CStrategyEntryConditionsCard.tsx`
- Modify: `apps/web/src/phase7c-types.ts`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/pages/Phase7CControlCenterShellPage.tsx`
- Test: `scripts/test-phase7c-strategy-entry-conditions-web-contract.mjs`

**Interfaces:**
- `getPhase7CStrategyEntryConditions()` returns canonical/virtual state plus guards.
- `setPhase7CStrategyEntryConditions(input)` sends one POST only, with `expectedVersion` and complete state.
- Card has locked Trend `patternM15`, locked Sideway `rangeEdge`, editable remaining toggles, `Khôi phục`, `Khôi phục mặc định chiến lược`, and `Lưu cấu hình`.

- [ ] **Step 1: Write Web RED contract**

Source/behavior assertions must require:

```text
section title: Điều kiện vào lệnh
shared scope copy: Dùng chung DEMO / LIVE
NEW ENTRY ONLY copy
patternM15 rendered checked + disabled/locked
rangeEdge rendered checked + disabled/locked
m5Confirmation rendered editable when runtime save guards allow editing
Save disabled unless valid && editable && draft changed && anchors true
Restore saved resets draft only
Restore default resets draft to E1 only; no POST until Save
POST includes expectedVersion and complete Trend/Sideway state
CONFIG_VERSION_CONFLICT triggers reload and explicit user-facing stale-version message; no automatic retry
PAUSE + positions=0 runtime lock is visible
PASS / FAIL / IGNORED rendered from latest decision-monitor condition telemetry when available
no input for Supertrend parameters, MA periods, confidence threshold, FVG parameters, or range thresholds
```

- [ ] **Step 2: Run Web RED**

```bash
node scripts/test-phase7c-strategy-entry-conditions-web-contract.mjs
```

Expected RED: component/client/types do not exist.

- [ ] **Step 3: Add Web types and API client**

In `phase7c-types.ts`, add exact core UI types:

```ts
export type Phase7CStrategyConditionStatus = "PASS" | "FAIL" | "IGNORED";
export interface Phase7CStrategyEntryConditionState {
  version: number;
  updatedAt: string;
  updatedBy: string;
  trend: {
    patternM15: boolean;
    supertrendM15: boolean;
    supertrendM5: boolean;
    validTrendStructure: boolean;
    ma20Ma50: boolean;
    fvg: boolean;
  };
  sideway: {
    rangingRegime: boolean;
    recommendedModeSideway: boolean;
    minimumRegimeConfidence: boolean;
    supplyDemandRange: boolean;
    rangeEdge: boolean;
    m5Confirmation: boolean;
  };
}
```

Add snapshot guard fields matching API Task 3. Add API functions using the existing single `API_BASE` transport pattern; do not add the old two-URL mutation fallback.

- [ ] **Step 4: Implement the dedicated editor card**

Use TanStack Query for config, and either its own decision-monitor query or shared cache key `phase7c-decision-monitor` for live statuses. Keep local draft separate from canonical query state.

Condition metadata is static UI presentation only:

```ts
const TREND_ROWS = [
  ["patternM15", "Mô hình nến M15", true],
  ["supertrendM15", "Supertrend M15", false],
  ["supertrendM5", "Supertrend M5", false],
  ["validTrendStructure", "Cấu trúc xu hướng hợp lệ", false],
  ["ma20Ma50", "MA20/MA50 xác nhận", false],
  ["fvg", "FVG xác nhận", false],
] as const;
const SIDEWAY_ROWS = [
  ["rangeEdge", "Giá nằm đúng vùng biên Range", true],
  ["rangingRegime", "Regime = RANGING", false],
  ["recommendedModeSideway", "Recommended Mode = SIDEWAY", false],
  ["minimumRegimeConfidence", "Độ tin cậy regime tối thiểu", false],
  ["supplyDemandRange", "Supply/Demand Range hợp lệ", false],
  ["m5Confirmation", "Xác nhận M5", false],
] as const;
```

Mandatory rows remain checked/disabled and show `Bắt buộc · xác định hướng BUY/SELL`.

Use mutation error handling that detects backend `CONFIG_VERSION_CONFLICT`; invalidate/reload config, clear stale draft, and display a warning requiring a fresh edit. Never auto-resubmit.

- [ ] **Step 5: Mount card in Control Center shell and run GREEN**

Mount between authorization and main control content:

```tsx
<Stack spacing={3}>
  <Phase7CExecutionAuthorizationCard />
  <Phase7CStrategyEntryConditionsCard />
  <Phase7CControlCenterPage />
</Stack>
```

Run:

```bash
node scripts/test-phase7c-strategy-entry-conditions-web-contract.mjs
pnpm --filter @xauusd/web build
```

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

```bash
git add apps/web/src/ui/Phase7CStrategyEntryConditionsCard.tsx apps/web/src/phase7c-types.ts apps/web/src/api.ts apps/web/src/pages/Phase7CControlCenterShellPage.tsx scripts/test-phase7c-strategy-entry-conditions-web-contract.mjs
git commit -m "feat(web): add strategy entry condition editor"
```

---

### Task 8: Focused CI, Full Regression, and Completion Evidence

**Files:**
- Create: `.github/workflows/phase7c-strategy-entry-conditions-ci.yml`
- Modify only if exact existing workflow integration requires it: no other workflow should be edited merely for duplication.

**Interfaces:**
- Feature workflow runs all six new focused contract scripts plus API/Web builds and selected existing regressions.
- Completion evidence includes exact branch HEAD SHA, clean status, file diff, focused GREEN output, full CI conclusion, and explicit `ORDER_TEST=NONE` / runtime mutation statement.

- [ ] **Step 1: Write the focused workflow before calling the feature complete**

Workflow commands must include at minimum:

```yaml
- run: node scripts/test-phase7c-strategy-entry-conditions-core-contract.mjs
- run: node scripts/test-phase7c-strategy-entry-conditions-api-contract.mjs
- run: node scripts/test-phase7c-strategy-entry-conditions-audit-contract.mjs
- run: node scripts/test-phase7c-trend-strategy-entry-conditions-contract.mjs
- run: node scripts/test-phase7c-sideway-strategy-entry-conditions-contract.mjs
- run: node scripts/test-phase7c-strategy-entry-conditions-web-contract.mjs
- run: pnpm --filter @xauusd/api build
- run: pnpm --filter @xauusd/web build
```

Also call the exact existing regression commands referenced by these workflows or their canonical test scripts:

```text
.github/workflows/phase7b-supertrend-entry-gates-ci.yml
.github/workflows/phase7b-wait-pullback-ci.yml
.github/workflows/phase7c-sideway-regime-ci.yml
.github/workflows/phase7c-reversal-entry-gate-ci.yml
.github/workflows/phase7c-system-lifecycle-broker-ci.yml
.github/workflows/phase7c-web-mutation-single-transport-ci.yml
.github/workflows/phase7c-web-live-arm-demo-auto-ci.yml
.github/workflows/phase7c-lot-range-120-ci.yml
```

The focused workflow must not require MT5 credentials and must not invoke a real Bridge order endpoint.

- [ ] **Step 2: Run the complete local/source verification set**

```bash
node scripts/test-phase7c-strategy-entry-conditions-core-contract.mjs
node scripts/test-phase7c-strategy-entry-conditions-api-contract.mjs
node scripts/test-phase7c-strategy-entry-conditions-audit-contract.mjs
node scripts/test-phase7c-trend-strategy-entry-conditions-contract.mjs
node scripts/test-phase7c-sideway-strategy-entry-conditions-contract.mjs
node scripts/test-phase7c-strategy-entry-conditions-web-contract.mjs
pnpm --filter @xauusd/api build
pnpm --filter @xauusd/web build
```

Then run the existing canonical regression commands extracted from the eight workflows listed above. Every command must be recorded with exit code `0` before proceeding.

- [ ] **Step 3: Verify scope isolation**

Run:

```bash
git diff --name-only 4f56cda197ff40b3515b0b7ae6e41b8c47bbe62a...HEAD
git diff --stat 4f56cda197ff40b3515b0b7ae6e41b8c47bbe62a...HEAD
git status --short
```

Check that no unrelated ARM, account-switch, lifecycle, lot-limit, management, or Bridge trading-permission file changed outside the explicit file map. `git status --short` must be empty before final SHA capture.

- [ ] **Step 4: Commit CI wiring**

```bash
git add .github/workflows/phase7c-strategy-entry-conditions-ci.yml
git commit -m "ci: verify configurable strategy entry conditions"
```

- [ ] **Step 5: Push/open PR and wait for full CI**

Use a feature branch name:

```text
feat/phase7c-strategy-entry-conditions
```

PR description must state:

```text
Safety: no LIVE/DEMO order test; NEW ENTRY configuration only; defaults preserve current behavior; patternM15/rangeEdge anchors are mandatory; no executor restart required for config changes; mandatory safety/risk/orchestration gates remain immutable.
```

Do not merge while any required or feature-relevant CI check is pending/failing.

- [ ] **Step 6: Capture exact completion evidence before merge claim**

Record:

```bash
git rev-parse HEAD
git status --short
git log -1 --oneline
```

Required evidence fields in the implementation report:

```text
RED_PROOF=<focused failing contract + exact reason before production code>
FOCUSED_GREEN=PASS
API_BUILD=PASS
WEB_BUILD=PASS
REGRESSION_GREEN=PASS
GITHUB_CI=PASS
HEAD_SHA=<40-char exact SHA>
ORDER_TEST=NONE
LIVE_ORDER_TEST=NONE
DEMO_ORDER_TEST=NONE
ARM_MUTATION=NONE
AUTO_MUTATION=NONE
EXECUTOR_RESTART_FOR_CONFIG=NONE
BRIDGE_RESTART=NONE
```

Only after CI is green and the exact SHA is captured should the PR be merged according to the repository's normal merge workflow.

---

## Self-Review Checklist for This Plan

- Spec sections A1/B2/C1/D1/E1/F1/G1/G2a are each mapped to explicit tests and implementation tasks.
- Both mandatory anchors are represented in shared validation, API validation, executor semantics, Web rendering, and tests.
- Sideway M5 stays toggleable but never becomes a side origin.
- Sideway `recommendedModeSideway` toggle cannot disable mandatory `resolveSidewayPermission` routing.
- Missing Supply/Demand data still fails mandatory `rangeEdge` even when the explicit `supplyDemandRange` observation is disabled.
- Default E1 behavior is regression-tested before optional gates are permitted to change composition.
- Invalid persisted config is fail-closed and normal Web POST cannot silently repair it.
- Version `0` is virtual-only; first persisted version is `1`.
- Optimistic concurrency and final pre-order version race are both tested.
- `ENTRY_STRATEGY_CONDITIONS_PASS` remains observability only and does not override a later safety block reason.
- No management-state or risk-rule behavior is in feature scope.
- No LIVE/DEMO order is needed to prove any contract.
- Plan contains no placeholder implementation steps; each task has exact files, interfaces, RED command, minimum implementation shape, GREEN command, and commit boundary.
