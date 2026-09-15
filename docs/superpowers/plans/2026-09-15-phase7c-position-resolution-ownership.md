# Phase 7C Position Resolution Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure an MT5 position opened by Trend is adopted into canonical managed state when fixed TP is enabled, and restore truthful Telegram pending-vs-unresolved lifecycle semantics.

**Architecture:** Keep the existing Trend/SEMI ownership architecture. Fix the pending-position matcher to compare broker TP against the TP actually sent to MT5 (`fixedTpPrice` when fixed TP is active; otherwise the existing `takeProfit`), then fix the source adapter ordering so the immediate accepted-but-not-visible event becomes `ENTRY_ACCEPTED_POSITION_PENDING_RESOLUTION` while only the real pending timeout emits `ENTRY_ACCEPTED_POSITION_NOT_RESOLVED`. No strategy, +6/+10, FastMove, M5, account-mode, ARM, or production runtime mutation is included.

**Tech Stack:** Node.js, TypeScript, native `node:test`, source-transform adapters, GitHub Actions.

**Spec:** Runtime evidence from 2026-09-15 incident: tickets `304897364` and `304898559` repeatedly failed ownership recovery with `PENDING_TAKE_PROFIT_MISMATCH` while MT5 had the fixed TP actually sent by the controller.

## Global Constraints

- Source/CI only; no production mutation.
- No bot mode or ARM mutation.
- No process restart.
- No order or position mutation.
- No LIVE test order.
- Preserve Trend/SEMI management contract: +6 -> BE; +10 -> exactly 1/3 partial; FastMove/M5 unchanged.
- Use TDD: failing regression first, then minimal source fix.

---

### Task 1: Fixed-TP Pending Position Ownership

**Files:**
- Modify: `scripts/test-phase7c-telegram-entry-resolution-lifecycle-contract.mjs`
- Modify: `scripts/run-phase7b-demo-controller.ts`

**Interfaces:**
- Consumes: `PendingTrendEntry.fixedTpEnabled`, `PendingTrendEntry.fixedTpPrice`, `PendingTrendEntry.takeProfit`, broker `Position.takeProfit`.
- Produces: pending-position matcher accepts the broker position when its TP equals the actual TP sent to MT5.

- [ ] **Step 1: Write the failing test**

Extend the lifecycle contract test with a source contract requiring the matcher to derive the expected pending TP from `fixedTpPrice` when fixed TP is active and to retain `takeProfit` as fallback:

```js
test("pending Trend recovery matches the broker TP actually sent when fixed TP is enabled", () => {
  const source = fs.readFileSync(controllerPath, "utf8");
  const matcherStart = source.indexOf("function matchPendingTrendPosition(");
  const matcherEnd = source.indexOf("function managedFromPending(", matcherStart);
  const matcher = source.slice(matcherStart, matcherEnd);

  assert.match(
    matcher,
    /pending\.fixedTpEnabled[\s\S]*pending\.fixedTpPrice[\s\S]*pending\.takeProfit/,
  );
  assert.match(
    matcher,
    /position\.takeProfit\s*-\s*expectedTakeProfit/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test ./scripts/test-phase7c-telegram-entry-resolution-lifecycle-contract.mjs
```

Expected: FAIL because current matcher compares `position.takeProfit` directly against `pending.takeProfit` and has no fixed-TP expected value.

- [ ] **Step 3: Write minimal implementation**

In `matchPendingTrendPosition(...)`, compute the TP expected at the broker boundary before the TP mismatch check:

```ts
const expectedTakeProfit =
  pending.dailyMode !== "RECOVERY_TP" &&
  pending.fixedTpEnabled &&
  pending.fixedTpPrice !== null
    ? pending.fixedTpPrice
    : pending.takeProfit;

if (
  Math.abs(position.takeProfit - expectedTakeProfit) >
  priceTolerance
) {
  return {
    matched: false,
    reason: "PENDING_TAKE_PROFIT_MISMATCH",
  };
}
```

Do not weaken ticket/side/time/entry/volume/SL validation.

- [ ] **Step 4: Run test to verify it passes**

Run the same targeted test. Expected: PASS.

- [ ] **Step 5: Commit**

Commit test + minimal matcher fix with a message such as:

```bash
git commit -m "fix: match pending Trend positions against broker fixed TP"
```

---

### Task 2: Telegram Pending vs Timeout Lifecycle

**Files:**
- Modify: `scripts/test-phase7c-telegram-entry-resolution-lifecycle-contract.mjs`
- Modify: `scripts/phase7c-semi-trend-runtime-source-adapter.mjs`

**Interfaces:**
- Consumes: legacy immediate `ENTRY_ACCEPTED_POSITION_NOT_RESOLVED` marker and pending-expiry block.
- Produces: immediate event -> `ENTRY_ACCEPTED_POSITION_PENDING_RESOLUTION`; real timeout -> `ENTRY_ACCEPTED_POSITION_NOT_RESOLVED`.

- [ ] **Step 1: Write the failing test**

Add a source-location contract that checks the event names are attached to the correct control-flow blocks, not merely present once each:

```js
test("runtime transform attaches pending and unresolved events to the correct lifecycle blocks", () => {
  const legacySource = fs.readFileSync(controllerPath, "utf8");
  const source = transformPhase7CSemiTrendRuntimeSource(legacySource);

  assert.match(
    source,
    /if \(!opened\) \{\s*journal\("ENTRY_ACCEPTED_POSITION_PENDING_RESOLUTION"/,
  );
  assert.match(
    source,
    /pendingAgeMs >= 60_000[\s\S]*PENDING_ENTRY_EXPIRED_NO_POSITION[\s\S]*ENTRY_ACCEPTED_POSITION_NOT_RESOLVED/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test ./scripts/test-phase7c-telegram-entry-resolution-lifecycle-contract.mjs
```

Expected: FAIL because the transform currently injects the timeout marker first and then renames the first unresolved marker, which is the timeout marker rather than the immediate unresolved marker.

- [ ] **Step 3: Write minimal implementation**

In `transformEntryResolutionLifecycle(source)`, rename the single legacy immediate unresolved marker **before** injecting the timeout block. Keep the existing postconditions and do not change notifier formatting.

- [ ] **Step 4: Run targeted tests and regressions**

Run:

```bash
node --test ./scripts/test-phase7c-telegram-entry-resolution-lifecycle-contract.mjs
node --test ./scripts/test-phase7c-telegram-lifecycle-observability-contract.mjs
node --test ./scripts/phase7c-trade-notifier-synthetic.test.mjs
node --test ./scripts/test-phase7c-hold-telegram-dedupe-contract.mjs
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "fix: attach Telegram entry resolution events to correct lifecycle blocks"
```

---

### Task 3: Verification and Pull Request

**Files:**
- No production file changes beyond Tasks 1-2.

**Interfaces:**
- Consumes: two green commits.
- Produces: reviewable PR against `main`, no merge and no production rollout.

- [ ] **Step 1: Run focused CI-equivalent tests**

Run all tests from Tasks 1-2 plus any workflow-required contract tests triggered by the changed files.

- [ ] **Step 2: Review diff**

Verify only ownership TP matching, lifecycle transform ordering, tests, and this plan changed. Confirm no +6/+10/FastMove/M5/ARM/mode behavior changed.

- [ ] **Step 3: Open PR**

PR body must record:

```text
ROOT_CAUSE_1=PENDING_TAKE_PROFIT_MISMATCH_FROM_FIXED_TP_EXPECTATION
ROOT_CAUSE_2=TRANSFORM_RENAMED_TIMEOUT_MARKER_INSTEAD_OF_TRANSIENT_MARKER
LIVE_TEST_ORDER=NONE
PRODUCTION_MUTATION=NONE
```

- [ ] **Step 4: Verify PR CI**

Require all relevant checks green before marking ready for review. Do not merge in this task.
