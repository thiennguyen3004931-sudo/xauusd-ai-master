# Phase7C Web Deploy Stale Broker Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Web/API deployment from activating source that depends on newer Phase7C lifecycle broker libraries while the long-running SYSTEM lifecycle broker is still executing older in-memory code.

**Architecture:** Reuse the proven broker boot-log/heartbeat timestamp pattern already used by the Sideway runtime deploy helper. Extend the Web UI deploy preflight to compare the running broker start time with every source file loaded by `run-phase7c-executor-task-runner-local.ps1` at process startup: the runner itself, `phase7c-startup-runner-guard.ps1`, `phase7c-account-mode.ps1`, and `phase7c-lifecycle-broker.ps1`. Fail closed before build/runtime restart when any dependency is newer than the running broker.

**Tech Stack:** Windows PowerShell 5.1, PowerShell 7, GitHub Actions source-contract CI.

**Spec:** Runtime incident 2026-09-01: Fixed TP schema v2 was written by the freshly deployed API while an older long-running executor task runner still held the v1 `Assert-Phase7CRiskProfile` implementation in memory.

## Global Constraints

- SOURCE_ONLY=TRUE
- PRODUCTION_RUNTIME_MUTATION=NONE
- MODE_CHANGE=NONE
- ARM_CHANGE=NONE
- BRIDGE_RESTART=NONE
- EXECUTOR_RESTART=NONE
- ORDER_MUTATION=NONE
- LIVE_TEST_ORDER=NONE
- Preserve exact-main/exact-SHA/clean-worktree deployment guards.
- Preserve the Web deploy contract that does not directly start/stop executors.

---

### Task 1: Lock stale-broker regression with RED source contract

**Files:**
- Modify: `scripts/test-phase7c-web-ui-safe-deploy-source.ps1`

**Interfaces:**
- Consumes: current `deploy-phase7c-web-ui-local.ps1` source.
- Produces: assertions requiring broker freshness inputs, boot evidence, all startup-loaded dependencies, and pre-build fail-fast ordering.

- [ ] **Step 1: Write the failing test**

Require literals for `run-phase7c-executor-task-runner-local.ps1`, `lib\\phase7c-startup-runner-guard.ps1`, `lib\\phase7c-account-mode.ps1`, `lib\\phase7c-lifecycle-broker.ps1`, broker heartbeat/log paths, `Lifecycle broker starting. PID=$brokerPid`, `LastWriteTimeUtc`, a PASS marker, and freshness invocation before the first `pnpm` build.

- [ ] **Step 2: Run test to verify it fails**

Run in GitHub Actions through the existing Phase7C Web UI Safe Deploy workflow. Expected: source-contract failure because current Web deploy has no lifecycle broker freshness preflight.

- [ ] **Step 3: Commit RED test only**

Commit message: `test: require fresh lifecycle broker before web deploy`.

### Task 2: Add minimal Web deploy freshness preflight

**Files:**
- Modify: `scripts/deploy-phase7c-web-ui-local.ps1`

**Interfaces:**
- Consumes: `.runtime/phase7c-lifecycle-broker/state/heartbeat.json`, `.runtime/phase7c-lifecycle-broker/logs/broker.log`, and four broker startup-loaded source files.
- Produces: fail-closed exception before build/runtime restart when the running broker predates any startup-loaded dependency; `PHASE7C_WEB_UI_DEPLOY_BROKER_SOURCE_FRESH=PASS` on success.

- [ ] **Step 1: Implement minimal production guard**

Add read-only heartbeat/log parsing and compute the maximum `LastWriteTimeUtc` of the runner plus its three dot-sourced libraries. Compare that with the boot marker timestamp for the current broker PID.

- [ ] **Step 2: Invoke the guard before any build**

Run the freshness assertion after exact branch/SHA/clean-worktree validation and before `@xauusd/mt5-broker` build.

- [ ] **Step 3: Verify GREEN**

Run the existing safe-deploy source contract under PowerShell 7 and Windows PowerShell 5.1. Expected: PASS.

- [ ] **Step 4: Run related regressions**

Run Web UI Safe Deploy CI, System Lifecycle Broker CI, and Fixed TP Additive CI on the exact PR head; require all triggered workflows to pass.

- [ ] **Step 5: Commit production fix**

Commit message: `fix: block web deploy on stale lifecycle broker`.

### Task 3: Final verification and PR

**Files:**
- Remove before final diff: `docs/superpowers/plans/2026-09-02-phase7c-web-deploy-stale-broker-guard.md`

- [ ] **Step 1: Verify final diff contains only test + deploy guard**
- [ ] **Step 2: Confirm no runtime mutation occurred**
- [ ] **Step 3: Open PR from exact tested head and wait for fresh PR CI**
- [ ] **Step 4: Merge only after exact-head CI is green**
