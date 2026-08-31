# Telegram Recovery Position Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure Phase 7C Telegram lifecycle/recovery notifications show canonical Entry, SL, TP, and Lot instead of `0.00` or `— lot` when journal events contain zero placeholders but live/cached position context is available.

**Architecture:** Keep the notifier read-only. Treat non-positive values as invalid only for position-context price/volume fields (Entry, SL, TP, Lot), while preserving `numberOrNull()` semantics for P&L and other fields where zero is meaningful. For HOLD/management events, prefer validated live MT5 managed-position metrics and backfill the notifier trade state so the subsequent close/recovery-completed card retains position context after the open position disappears.

**Tech Stack:** Node.js ESM, `node:test`, Phase 7C Telegram notifier dry-run harness.

**Spec:** User-reported LIVE Telegram recovery card for ticket `304521969`: HOLD displayed Entry/SL/TP as `0.00` and Lot as `— lot`; recovery-completed retained TP/P&L/Exit but still lost Entry/SL/Lot.

## Global Constraints

- SOURCE_ONLY until RED → GREEN and review/CI pass.
- ORDER_MUTATION=NONE.
- LIVE_TEST_ORDER=NONE.
- ARM_CHANGE=NONE.
- MODE_CHANGE=NONE.
- BRIDGE_RESTART=NONE.
- EXECUTOR_RESTART=NONE.
- Do not change generic numeric semantics where zero is a valid P&L/value.
- Telegram notifier remains read-only and must not call order endpoints.

---

### Task 1: Lock regression and fix position-context fallback

**Files:**
- Modify: `scripts/phase7c-trade-notifier-synthetic.test.mjs`
- Modify: `scripts/run-phase7b-telegram-notifier.mjs`

**Interfaces:**
- Consumes: journal lifecycle events plus `/api/v1/phase7b-demo` read-only snapshot.
- Produces: validated Entry/SL/TP/Lot context in lifecycle cards and persisted `state.trade` context for later close cards.

- [ ] **Step 1: Write the failing regression test**

Add a synthetic recovery lifecycle where `ENTRY_FILLED`/HOLD carry zero placeholders while a local read-only monitor fixture exposes a real managed position. Assert HOLD does not contain `Entry: 0.00`, `SL: 0.00`, `TP: 0.00`, or `Lot: — lot`, and instead contains the fixture values. Assert the close/recovery-completed card retains Entry/Lot and recovery TP after the position is gone.

- [ ] **Step 2: Run test to verify RED**

Run: `node --test scripts/phase7c-trade-notifier-synthetic.test.mjs`

Expected: FAIL because current nullish fallback accepts numeric zero and stores zero placeholders in `state.trade`.

- [ ] **Step 3: Write minimal implementation**

Add a position-context validator such as `positiveNumberOrNull(raw)` and a first-positive selector. Use it only for Entry/SL/TP/Lot and live managed-position metrics. When live enrichment supplies validated context, merge it into `state.trade` without overwriting valid values with zero/null placeholders. For recovery TP, fall through zero placeholders to valid recovery/state values.

- [ ] **Step 4: Run focused test to verify GREEN**

Run: `node --test scripts/phase7c-trade-notifier-synthetic.test.mjs`

Expected: PASS, including existing LIVE/DEMO/Sideway/rejection coverage.

- [ ] **Step 5: Run repository CI/checks**

Run the repository test/check commands used by CI and confirm no order endpoint is invoked by the notifier synthetic test.

- [ ] **Step 6: Review and merge**

Open a PR containing only this notifier regression/fix, review changed files, wait for required CI to pass, then merge. Deployment/runtime restart is a separate controlled step after merge.
