# Phase7C SYSTEM Lifecycle Broker Design

Date: 2026-08-27
Status: Proposed for implementation after user review
Base commit: `37e71c750ca1b4d21073f4cbf03c2b5f6df37682`

## 1. Problem statement

Phase7C currently has a privilege split that prevents Web lifecycle operations from safely restarting the executor runtime when lot settings change.

Observed runtime:
- API/Web control process runs as the interactive Windows user and is not elevated.
- `XAUUSD-Phase7C-Executors` runs as `SYSTEM`, `Highest`, `ServiceAccount`.
- Supervisor, Trend, Sideway, Telegram mode controller, regime notifier, and trade notifier are descendants of the SYSTEM task.
- Lifecycle reports the runtime as running, but `ready=false` when `lotSettings.restartRequired=true`.

Current `phase7c-lifecycle.service.ts` calls `schtasks.exe /End` and then `stop-phase7c-executors-local.ps1` from the non-elevated API token. The `/End` error is swallowed. The stopper then attempts to control SYSTEM-owned processes and can fail. This leaves the bot in `PAUSE` with `runtimeReady` blocked even though the executor tree itself is healthy.

The current SYSTEM task runner also resolves effective lot settings before entering its permanent retry loop. Restarting only the supervisor process therefore does not guarantee that newly saved lot settings are re-read.

## 2. Approved architecture

The Scheduled Task remains the single privileged execution boundary.

**The SYSTEM lifecycle runner always stays alive. Web/API never directly stops the Scheduled Task and never directly kills or launches privileged executor processes. Web/API only submits one of three bounded lifecycle requests: `START`, `STOP`, or `RESTART`.**

The SYSTEM runner owns all mutations to the privileged executor tree.

```text
Web / API (non-elevated)
        |
        | atomic bounded request
        v
.runtime/phase7c-lifecycle-broker/request.json
        |
        v
XAUUSD-Phase7C-Executors
SYSTEM + Highest
Lifecycle Broker Runner
        |
        +-- validates request and safety gates
        +-- reads canonical account/task/lot configuration
        +-- START / STOP / RESTART supervisor tree
        +-- writes status/result/heartbeat
        |
        v
Supervisor (SYSTEM)
   +-- Trend
   +-- Sideway
   +-- Telegram mode
   +-- Regime notifier
   +-- Trade notifier
```

The API remains non-elevated. No task ACL is broadened to grant the Web user direct SYSTEM task control.

## 3. Goals

1. Allow Web Control Center to start, stop, and restart Phase7C executors without Administrator prompts after one-time Scheduled Task installation.
2. Keep the privileged lifecycle runner alive while the trading executors are stopped.
3. Preserve the existing safety rule that Web lifecycle actions leave bot mode in `PAUSE`; AUTO remains a separate explicit Web action.
4. Preserve zero-position protection for STOP and RESTART.
5. Re-read canonical lot settings before every START or RESTART so `lotSettings.restartRequired` clears only after the newly launched runtime actually uses the new profile.
6. Preserve DEMO/LIVE account isolation and existing LIVE authorization/ARM requirements.
7. Make lifecycle failures auditable instead of swallowing task-control errors.
8. Avoid arbitrary command execution through the request channel.

## 4. Non-goals

- No change to Trend or Sideway trading strategy logic.
- No change to entry, SL, TP, BE, partial-close, HOLD, recovery, or exit contracts.
- No change to Telegram trade formatting.
- No automatic AUTO activation.
- No automatic LIVE ARM.
- No direct MT5 order test for lifecycle validation.
- No elevation of the API process.
- No user-granted `/Run` or `/End` permission on the SYSTEM task.
- No generic remote shell, script path, command line, or arbitrary argument support in lifecycle requests.

## 5. Broker files and ownership

Use a dedicated runtime directory:

```text
.runtime/phase7c-lifecycle-broker/
  request.json
  status.json
  result.json
  broker.log
  heartbeat.json
```

The interactive user/API may atomically replace `request.json`.
The SYSTEM runner reads requests and owns `status.json`, `result.json`, `broker.log`, and `heartbeat.json`.

All JSON writes must use temp-file + atomic rename/replace semantics to avoid partial reads.

The request channel is local-file-only. It is not a general IPC command channel.

## 6. Request contract

Version 1 request:

```json
{
  "version": 1,
  "requestId": "uuid",
  "action": "START | STOP | RESTART",
  "requestedAt": 1787830000000,
  "source": "WEB_CONTROL_CENTER",
  "reason": "USER_START | USER_STOP | LOT_SETTINGS_CHANGED | RECOVERY_START"
}
```

Rules:
- `version` must equal `1`.
- `requestId` must be a valid UUID and is the idempotency key.
- `action` is a closed enum: `START`, `STOP`, `RESTART` only.
- `source` is a closed enum for audit; initially only `WEB_CONTROL_CENTER`.
- `reason` is a closed enum used for audit only.
- Request must not contain executable path, script path, account path, environment path, PowerShell, command line, PID, lot value, login, server, ARM data, or arbitrary arguments.
- Unknown properties should cause rejection rather than being ignored silently.
- Requests older than a bounded freshness window, for example 120 seconds, are rejected.

The SYSTEM runner always resolves account mode, env file, lot profile, node path, pnpm path, runtime directory, LIVE execution authorization, and other launch inputs from canonical project state/configuration, never from `request.json`.

## 7. Result contract

The runner writes one canonical result for the last handled request:

```json
{
  "version": 1,
  "requestId": "uuid",
  "action": "RESTART",
  "status": "SUCCEEDED | REJECTED | FAILED | NOOP",
  "reasonCode": "...",
  "message": "...",
  "startedAt": 1787830000100,
  "completedAt": 1787830004200,
  "supervisorPid": 12345,
  "accountMode": "DEMO",
  "appliedLotProfile": {
    "trendFixedLot": 0.12,
    "sidewayRiskPercent": 1,
    "sidewayMaxLot": 0.12
  }
}
```

`message` is human-readable. `reasonCode` is canonical and stable for tests/audit.

Recommended initial reason codes:
- `OK_STARTED`
- `OK_STOPPED`
- `OK_RESTARTED`
- `NOOP_ALREADY_RUNNING`
- `NOOP_ALREADY_STOPPED`
- `REJECT_BOT_NOT_PAUSED`
- `REJECT_OPEN_XAUUSD_POSITION`
- `REJECT_ACCOUNT_INVALID`
- `REJECT_BRIDGE_UNAVAILABLE`
- `REJECT_LIVE_AUTH_INVALID`
- `REJECT_LIVE_ARM_INVALID`
- `REJECT_REQUEST_INVALID`
- `REJECT_REQUEST_STALE`
- `REJECT_REQUEST_DUPLICATE`
- `FAIL_STOP_TIMEOUT`
- `FAIL_START_TIMEOUT`
- `FAIL_SUPERVISOR_EXITED`
- `FAIL_INTERNAL`

## 8. Broker state machine

Canonical broker states:

```text
BOOTING
  -> IDLE
  -> STARTING
  -> RUNNING
  -> STOPPING
  -> IDLE
  -> RESTARTING
  -> RUNNING
  -> BLOCKED
  -> ERROR_RETRYING
```

`status.json` should expose at least:
- broker state
- broker PID
- supervisor PID
- desired executor state: `RUNNING | STOPPED`
- current account mode
- last handled request ID/action/result
- last error/reason code
- updated timestamp
- applied lot profile or deterministic hash/version

`heartbeat.json` is refreshed periodically even while executors are stopped. This distinguishes `Broker alive / executors IDLE` from `SYSTEM task dead`.

## 9. Boot behavior

Preserve the project startup safety policy:
- Scheduled Task starts at system boot under SYSTEM.
- Broker starts first and remains alive.
- Bot mode must be `PAUSE` before executor launch.
- Existing boot policy may launch the executor runtime automatically in PAUSE using canonical task config, matching current startup behavior.
- Broker must never enable AUTO during boot.
- If boot-time guards fail, broker remains alive in `IDLE` or `BLOCKED` and records the reason instead of exiting permanently.

A user Web `STOP` keeps the broker alive and stops the executor tree. A later Web `START` launches it again without an Administrator action.

## 10. Safety gates

The API continues to perform the existing lifecycle preflight before submitting a request. The SYSTEM broker also performs independent no-bypass validation before privileged mutation.

### Common START gates
- request valid and fresh
- canonical account-mode state valid
- bot mode is `PAUSE`
- MT5 bridge reachable
- broker account mode matches configured account mode
- bridge trading enabled
- terminal trading allowed
- expert/algo trading allowed
- XAUUSD open positions = 0
- Telegram configuration exists
- canonical executor task configuration valid and armed

### STOP gates
- bot mode is forced/confirmed `PAUSE`
- XAUUSD open positions = 0

If there is an open XAUUSD position, STOP is rejected so managed positions are not orphaned.

### RESTART gates
RESTART uses STOP gates plus START gates. It is the action used when lot settings require a restart.

### LIVE-specific gates
For LIVE START or RESTART, preserve all existing LIVE authorization boundaries. The broker must not create or repair authorization itself.

At minimum it must require canonical LIVE configuration to be valid and must revalidate the current LIVE authorization/ARM state required by the project for the current broker/bridge session. Failure remains fail-closed in PAUSE.

DEMO remains `ARM NOT_REQUIRED`.

## 11. Applying lot settings correctly

This is a core requirement of the redesign.

The SYSTEM runner must not cache effective lot values outside the per-launch path.

Before every START and every RESTART launch it must re-read:
1. `.runtime/phase7c-executor-task-config.json`
2. current account-mode state
3. `.runtime/phase7c-lot-settings.json` when present
4. canonical account env configuration

Then it validates the effective risk profile and passes those freshly resolved values to `run-phase7c-executors-local.ps1`.

After launch, API lifecycle readiness continues to compare configured vs active lot profile. `restartRequired` only becomes false when the active runtime status confirms the new profile.

## 12. START behavior

1. API sets/keeps bot mode `PAUSE`.
2. API performs current Web preflight.
3. API writes atomic `START` request and waits for matching result/status.
4. Broker validates privileged gates.
5. If supervisor tree is already healthy and active lot/account profile matches canonical config, return `NOOP_ALREADY_RUNNING`.
6. Otherwise launch supervisor tree as SYSTEM with freshly loaded config.
7. Broker records supervisor PID and state `RUNNING` after process launch.
8. API waits for existing lifecycle readiness: supervisor + Trend + Sideway + Telegram + regime notifier + active lot profile + account guard.
9. On success Web shows RUNNING / READY / PAUSE.
10. AUTO still requires a separate user click and existing AUTO safety gates.

## 13. STOP behavior

1. API sets bot mode `PAUSE`.
2. API verifies zero XAUUSD positions.
3. API writes `STOP` request.
4. Broker independently confirms PAUSE and zero XAUUSD positions.
5. Broker stops the supervisor/executor tree as SYSTEM using canonical stopper logic.
6. Broker does not exit.
7. Broker enters `IDLE`, desired executor state `STOPPED`.
8. API verifies executors are no longer running.

Expected stable state:

```text
Scheduled Task: Running
Lifecycle Broker: IDLE
Executors: STOPPED
Bot mode: PAUSE
```

## 14. RESTART behavior

1. API sets bot mode `PAUSE`.
2. API verifies zero XAUUSD positions and other existing lifecycle guards.
3. API writes `RESTART` request.
4. Broker revalidates the same safety gates.
5. Broker stops the SYSTEM executor tree.
6. Broker re-reads canonical task/account/lot configuration.
7. Broker launches a fresh SYSTEM supervisor tree.
8. API waits for READY and confirms the active lot profile now matches configured settings.
9. Bot remains `PAUSE`.
10. User may then explicitly enable AUTO from Web.

This replaces the current API-side `/End` + local stopper path for Web lifecycle control.

## 15. Crash and recovery behavior

### Executor/supervisor crash while desired state is RUNNING
Preserve current watchdog behavior: broker detects supervisor exit, records `ERROR_RETRYING`, waits bounded restart delay, re-reads canonical configuration, then starts a new supervisor. It remains PAUSE unless the existing mode state says otherwise; the new design must not introduce automatic AUTO mutation.

### Executor exit while desired state is STOPPED
Do not restart. Remain `IDLE`.

### Broker process/task crash
Task Scheduler remains responsible for starting the broker at system startup. If a separate task restart-on-failure policy exists or is added, it may restart the broker itself, but the broker must always come up fail-safe and enforce PAUSE before execution startup.

### API crash after request submission
The broker still completes or rejects the request based on `requestId`; result is persisted. After API recovers it can read status/result and reconcile without reissuing a duplicate mutation.

### Duplicate request
Same `requestId` is idempotent and must never execute twice.

### Malformed request
Reject and preserve the current executor desired state.

## 16. API/service changes

`apps/api/src/services/phase7c-lifecycle.service.ts` should stop owning privileged process mutation.

Replace API-side:
- `schtasks.exe /End`
- direct execution of `stop-phase7c-executors-local.ps1`
- user-token `launchSelectedSupervisor()`
- user-token `taskkill` of executor lifecycle processes

with a lifecycle broker client that:
- atomically writes a bounded request
- polls broker heartbeat/status/result by matching `requestId`
- surfaces canonical failure reason to Web
- preserves current preflight and final readiness verification

Suggested new focused module:

```text
apps/api/src/services/phase7c-lifecycle-broker.service.ts
```

It is a file-protocol client only; it has no elevated behavior.

## 17. SYSTEM runner changes

Evolve `scripts/run-phase7c-executor-task-runner-local.ps1` from an unconditional supervisor restart loop into the persistent lifecycle broker.

Responsibilities:
- retain startup runner single-instance lock
- publish heartbeat/status
- process bounded request files
- maintain desired executor state
- re-read canonical configuration on every launch
- launch supervisor as SYSTEM
- stop supervisor tree as SYSTEM
- auto-recover supervisor only while desired state is RUNNING
- persist request results
- remain alive in IDLE/BLOCKED states

Prefer extracting request parsing/state helpers to a PowerShell library if the runner becomes difficult to test as one file. Avoid unrelated refactoring.

## 18. Scheduled Task changes

Keep one canonical task:

```text
XAUUSD-Phase7C-Executors
Run As: SYSTEM
RunLevel: Highest
Trigger: At system startup
Action: run-phase7c-executor-task-runner-local.ps1
```

Do not add a Web-user lifecycle task and do not grant direct task-control rights to the interactive user.

The installer/registration script should verify:
- SYSTEM principal
- Highest run level
- expected runner path
- startup trigger
- broker runtime directory can be used by API for request creation while privileged outputs remain writable by SYSTEM

## 19. UI behavior

No new large UI section is required.

Control Center remains the single ARM/lifecycle surface.

Lifecycle display should distinguish:
- `BROKER READY · EXECUTORS IDLE`
- `STARTING`
- `RUNNING · PAUSE`
- `RESTARTING`
- `BLOCKED: <reason>`

When configured lot differs from active lot:
- display `Cần khởi động lại để áp dụng cấu hình lot`
- `KHÔI PHỤC BOT` or equivalent Web start action results in broker `RESTART`, not direct SYSTEM process control

AUTO remains blocked until lifecycle `ready=true`.

## 20. Observability and audit

Do not swallow privileged lifecycle errors.

Record:
- request ID/action/source/reason
- accepted/rejected timestamp
- safety rejection reason code
- stop/start phase transition
- supervisor PID
- account mode
- effective lot profile applied at launch
- timeout/error

Never log Telegram token, chat ID secrets, bridge passwords, or account env secret values.

## 21. Timeout policy

Recommended bounded timeouts:
- request pickup: 5 seconds
- graceful/forced SYSTEM executor stop: reuse existing stopper budget, with a hard upper bound
- supervisor launch acknowledgement: 10 seconds
- full lifecycle READY: retain approximately current 50-second readiness window unless tests show the broker transition requires a small extension

On timeout:
- bot remains `PAUSE`
- API reports canonical timeout reason
- broker stays alive
- no AUTO mutation
- no ARM mutation

## 22. Testing strategy

Implementation must use TDD.

### RED contract tests first
Add tests that fail against the current architecture and require:
1. API lifecycle service no longer calls `schtasks /End` for Web lifecycle.
2. API lifecycle service no longer directly launches/stops the privileged executor tree.
3. broker request accepts only START/STOP/RESTART and rejects arbitrary fields/commands.
4. STOP with XAUUSD position > 0 is rejected.
5. RESTART with bot not PAUSE is rejected.
6. DEMO START requires no ARM but preserves account/bridge guards.
7. LIVE START/RESTART cannot bypass canonical LIVE authorization/ARM.
8. broker remains alive after STOP and reports IDLE.
9. START from IDLE launches executor runtime.
10. RESTART re-reads changed lot settings and launches with the new values.
11. duplicate requestId executes at most once.
12. malformed/stale request is rejected without changing executor state.
13. supervisor crash auto-restarts only when desired state is RUNNING.
14. supervisor crash does not restart when desired state is STOPPED.
15. boot/start always preserves PAUSE and never activates AUTO.

### Windows PowerShell compatibility
All PowerShell source/contract tests must run on both:
- PowerShell 7
- Windows PowerShell 5.1

Avoid UTF-8-without-BOM source-test patterns that break Windows PowerShell 5.1 parsing.

### Build/regression
Require at least:
- API build
- Web build
- Phase7C Web lifecycle/source CI
- Sideway Regime regression suite
- existing unarmed/LIVE safety contracts
- notifier regression if any shared lifecycle source affects notifier startup

No LIVE MT5 order is required for validation.

## 23. Deployment plan

1. Merge only after RED-to-GREEN evidence and all required CI passes.
2. On Windows, require clean working tree before sync.
3. Verify current account mode, bot mode, XAUUSD positions, bridge health, and task principal before mutation.
4. Deploy source/build.
5. Re-register/update `XAUUSD-Phase7C-Executors` once if installer/task action changes.
6. First migration restart must be performed only while bot is PAUSE and XAUUSD positions = 0.
7. Verify broker heartbeat and status.
8. Verify `STOP` leaves broker alive and executors IDLE.
9. Verify `START` reaches READY and remains PAUSE.
10. Change a safe DEMO lot setting, verify `restartRequired=true`, issue Web restart, then verify active lot equals configured lot and `restartRequired=false`.
11. Only after readiness verification allow the user to click AUTO manually.

No LIVE order should be generated during deployment validation.

## 24. Migration compatibility

During migration, the existing SYSTEM task may already be running the old runner. Updating the source file alone does not transform the in-memory runner. Therefore deployment must explicitly perform one controlled task/runner transition under Administrator/SYSTEM after verifying PAUSE and zero XAUUSD positions.

After that one-time migration, normal lifecycle control is entirely Web request-driven and requires no repeated Administrator command.

Existing runtime PID/status files may remain for lifecycle compatibility, but the new broker status becomes the canonical authority for broker state. Existing lifecycle readiness continues to verify actual process liveness rather than trusting broker state alone.

## 25. Acceptance criteria

The design is complete when all of the following are true:

- API token remains non-elevated.
- Scheduled Task remains SYSTEM + Highest.
- Web can START, STOP, and RESTART executors without direct SYSTEM task/process control.
- STOP leaves lifecycle broker alive.
- START after STOP works without Administrator interaction.
- lot-setting changes can be applied by Web RESTART and active lot reflects the new values.
- Web lifecycle cannot stop/restart while an XAUUSD position is open.
- LIVE cannot bypass existing authorization/ARM rules.
- all lifecycle transitions preserve PAUSE; AUTO remains explicit.
- broker request schema cannot execute arbitrary commands.
- request/result/status are auditable and idempotent.
- existing Trend/Sideway/Telegram trading contracts are unchanged.
