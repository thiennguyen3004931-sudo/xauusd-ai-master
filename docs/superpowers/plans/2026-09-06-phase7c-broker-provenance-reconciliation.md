# Phase7C Broker Provenance Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fail-closed, broker-only canonical reconciliation entrypoint that refreshes the lifecycle-broker runtime-source attestation while the Phase7C lifecycle remains stopped.

**Architecture:** Reuse the existing Scheduled Task ownership/hash guard and runtime-generation probe. The new entrypoint proves exact Git source, accepted deployment identity, PAUSE + DISARMED + stopped lifecycle + XAUUSD flatness, exact API/Web attestation, canonical task ownership, and the specific live-broker provenance mismatch before performing the only allowed mutation: stop and restart the canonical SYSTEM Scheduled Task. It never calls lifecycle START/RESTART, never launches executors, never repairs task definition, and verifies a new broker PID/heartbeat/lock/attestation plus unchanged API/Web/Bridge identity before reporting `WHOLE_RUNTIME_OVERALL=STALE`.

**Tech Stack:** Windows PowerShell 5.1, PowerShell 7, Git, Windows ScheduledTasks, Phase7C local Control API/MT5 Bridge, GitHub Actions.

**Spec:** User-approved option 1 from the 2026-09-06 broker-only reconciliation design checkpoint.

## Global Constraints

- `MODE_MUTATION=NONE`
- `ARM_MUTATION=NONE`
- `ORDER_MUTATION=NONE`
- `POSITION_MUTATION=NONE`
- `LIVE_TEST_ORDER=NONE`
- No `/api/v1/phase7c/lifecycle/start` or `/restart`.
- No executor/supervisor launch.
- No `Set-ScheduledTask` or `Register-ScheduledTask`.
- No Bridge, API, or Web restart.
- Task action must be exact canonical runner path plus Git-trusted SHA256 guard.
- Preflight must require `PAUSE`, `DISARMED`, lifecycle stopped, zero alive lifecycle executors, XAUUSD positions `0`, pending orders `0`, healthy LIVE Bridge, exact accepted deployment identity, API/Web exact+alive, broker live provenance-only mismatch, inactive roles stale+dead.
- Postflight must require a new broker PID, fresh heartbeat, startup runner lock HELD, exact broker attestation at the accepted deployment, unchanged API/Web/Bridge identities, lifecycle still stopped, PAUSE/DISARMED, and XAUUSD still flat.
- A bounded orphan-Queued recovery may clear/retry the same canonical Scheduled Task once only after the exact fail-closed tuple is re-proven.

---

### Task 1: RED source contract

**Files:**
- Create: `scripts/test-phase7c-stopped-lifecycle-broker-provenance-reconciliation-source.ps1`
- Modify: `.github/workflows/phase7c-runtime-ready-stable-recovery-deploy-ci.yml`

**Interfaces:**
- Consumes: approved broker-only design.
- Produces: a static source contract that fails until the new reconciliation entrypoint exists with all required gates and forbidden operations absent.

- [ ] **Step 1: Write the failing source contract**

Require the new entrypoint path, exact parameter names, Git/deployment gates, PAUSE/DISARMED/stopped/flat gates, canonical task ownership/hash, provenance-only broker mismatch, stop/wait/start/new-PID/heartbeat/lock/attestation sequence, unchanged API/Web/Bridge checks, and explicit final safety markers. Forbid lifecycle start/restart, executor launch, task-definition mutation, control POSTs for mode/arm, order/position mutation commands, Bridge/API/Web restart, and force process termination.

- [ ] **Step 2: Wire the source contract into Windows CI**

Run it under both `pwsh` and Windows PowerShell 5.1 and include both the test file and new entrypoint path in workflow path filters.

- [ ] **Step 3: Open draft PR and verify RED**

Expected failure: source contract reports that `scripts/reconcile-phase7c-stopped-lifecycle-broker-provenance-local.ps1` is missing.

### Task 2: Minimal broker-only implementation

**Files:**
- Create: `scripts/reconcile-phase7c-stopped-lifecycle-broker-provenance-local.ps1`

**Interfaces:**
- Consumes: `Test-Phase7CExecutorTaskActionOwnership`, `Get-Phase7CTrustedGitFileSha256`, `Get-Phase7CExecutorTaskDrift`, `Get-Phase7CRuntimeGenerationSnapshot`, `Read-Phase7CRuntimeSourceDeployment`.
- Produces: one explicit broker-only reconciliation command.

- [ ] **Step 1: Implement exact Git/deployment and safety preflight**

Validate main/clean/HEAD/tree, accepted deployment ID/commit/tree, LIVE account context, Control API and Bridge GET-only snapshot, exact API/Web attestation, stale+dead inactive roles, and live broker mismatch restricted to source commit/tree/deployment identity reasons.

- [ ] **Step 2: Implement canonical task/generation ownership proof**

Require SYSTEM + ServiceAccount + Highest, exact runner path/hash guard, zero task drift, running broker with fresh heartbeat, matching status/heartbeat PID, startup runner lock HELD, and capture old broker/API/Web/Bridge identities.

- [ ] **Step 3: Implement bounded stop/start**

Stop the canonical task, wait for old broker exit and task quiescence, re-prove PAUSE/DISARMED/stopped/flat/Bridge identity, start the same task, and allow one exact orphan-Queued clear/retry path only when all canonical-process/runtime-generation conditions match the known safe tuple.

- [ ] **Step 4: Implement postflight**

Require new broker PID, fresh heartbeat, lock HELD, exact broker attestation, unchanged API/Web/Bridge PID/session, inactive roles still dead/stale, lifecycle still stopped, PAUSE/DISARMED, XAUUSD still flat, and overall attestation `STALE`.

- [ ] **Step 5: Verify GREEN in CI**

Both PowerShell source-contract steps must pass and all existing safety regression jobs must remain green.

### Task 3: Final branch verification and PR readiness

**Files:**
- Review only the three intended production/test/CI files plus this plan document; remove the plan document before final PR if diff hygiene requires source-only scope.

**Interfaces:**
- Consumes: GREEN branch.
- Produces: review-ready source-only PR with no runtime rollout.

- [ ] **Step 1: Compare base-to-head diff**

Require no strategy, risk, order, Bridge, Web UI, API route, runner, lifecycle-broker protocol, or executor source changes.

- [ ] **Step 2: Re-run/check all commit-associated CI**

Require every triggered workflow and canonical PR gate to be successful.

- [ ] **Step 3: Mark PR ready**

Do not merge or deploy unless a later explicit merge/rollout gate is authorized.
