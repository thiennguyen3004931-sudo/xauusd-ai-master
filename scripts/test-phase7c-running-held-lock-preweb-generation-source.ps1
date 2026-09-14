$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RecoveryPath = Join-Path $PSScriptRoot "recover-phase7c-runtime-ready-stable-deploy-local.ps1"
if (-not (Test-Path -LiteralPath $RecoveryPath -PathType Leaf)) {
  throw "Required recovery helper not found: $RecoveryPath"
}

function Assert-True([bool]$Value, [string]$Message) {
  if (-not $Value) { throw $Message }
}

$tokens = $null
$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($RecoveryPath, [ref]$tokens, [ref]$errors)
if ($errors.Count -ne 0) {
  throw "PowerShell syntax error in ${RecoveryPath}: $($errors[0].Message)"
}

$recovery = (Get-Content -LiteralPath $RecoveryPath -Raw).Replace("`r`n", "`n").Replace("`r", "`n")

# Production reproduction 2026-09-14: a new deployment/source generation can be
# required while lifecycle remains RUNNING+READY, the exact canonical SYSTEM task and
# broker tuple are alive/fresh/PID-matched, and the singleton startup lock is HELD.
# The strict Web/API deploy must not see that stale generation. Recovery must first
# quiesce lifecycle through the canonical API, then reuse the existing stopped-lifecycle
# generation reload so a new broker PID and exact attestation are established before Web.
$required = @(
  '$preWebRunningHeldLockObserved',
  '$preWebRunningHeldLockCandidate',
  '$preWebRunningHeldLockReloadEligible',
  'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_RUNNING_HELD_LOCK=ELIGIBLE_QUIESCE_REQUIRED',
  '[string]$preWebRuntimeGeneration.startupRunnerLockState -eq ''HELD''',
  '$preWebRunningHeldCanonicalProcessIds.Count -eq 1',
  '$preWebRunningHeldInstanceCount -eq 1',
  '[int]$preWebRunningHeldCanonicalProcessIds[0] -eq [int]$preWebRuntimeGeneration.statusBrokerPid',
  '[string]$preWebRunningHeldBrokerAttestation.component -eq ''lifecycle-broker''',
  '[int]$preWebRunningHeldBrokerAttestation.pid -eq [int]$preWebRuntimeGeneration.statusBrokerPid',
  '$preWebRunningHeldAttestedLauncherSha256 -eq $preWebExpectedLauncherSha256',
  'Assert-PauseDisarmed -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK"',
  'Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK"',
  'Assert-FlatBroker -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK"',
  '[void](Invoke-ApiPost "/api/v1/phase7c/lifecycle/stop" @{})',
  'Wait-LifecycleStopped',
  'Assert-LifecycleExecutorsStopped -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK_POST_STOP"',
  'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_RUNNING_HELD_LOCK_LIFECYCLE_STOP=PASS'
)
foreach ($literal in $required) {
  Assert-True ($recovery.Contains($literal)) "RED: RUNNING+READY held-lock pre-Web generation contract missing: $literal"
}

$eligible = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_RUNNING_HELD_LOCK=ELIGIBLE_QUIESCE_REQUIRED'
$stopped = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_RUNNING_HELD_LOCK_LIFECYCLE_STOP=PASS'
$generationEligible = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB=ELIGIBLE'
$taskStop = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_TASK_STOP=PASS'
$taskRestart = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_TASK_RESTART=PASS'
$lockHeld = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_STARTUP_RUNNER_LOCK=HELD'
$ready = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_LIFECYCLE_READY=PASS'
$reloadSatisfied = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_SOURCE_GENERATION_RELOAD=SATISFIED_PRE_WEB'
$webDeploy = '& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WebApiDeploy'

$eligibleIndex = $recovery.IndexOf($eligible, [System.StringComparison]::Ordinal)
$stoppedIndex = $recovery.IndexOf($stopped, [System.StringComparison]::Ordinal)
$generationEligibleIndex = $recovery.IndexOf($generationEligible, [System.StringComparison]::Ordinal)
$taskStopIndex = $recovery.IndexOf($taskStop, [System.StringComparison]::Ordinal)
$taskRestartIndex = $recovery.IndexOf($taskRestart, [System.StringComparison]::Ordinal)
$lockHeldIndex = $recovery.IndexOf($lockHeld, [System.StringComparison]::Ordinal)
$readyIndex = $recovery.IndexOf($ready, [System.StringComparison]::Ordinal)
$reloadSatisfiedIndex = $recovery.IndexOf($reloadSatisfied, [System.StringComparison]::Ordinal)
$webDeployIndex = $recovery.IndexOf($webDeploy, [System.StringComparison]::Ordinal)

Assert-True ($eligibleIndex -ge 0) 'RUNNING+READY held-lock reload must expose exact quiesce eligibility.'
Assert-True ($stoppedIndex -gt $eligibleIndex) 'Held-lock lifecycle STOP proof must occur after exact eligibility.'
Assert-True ($generationEligibleIndex -gt $stoppedIndex) 'Existing stopped-lifecycle generation path must be entered after held-lock quiesce.'
Assert-True ($taskStopIndex -gt $generationEligibleIndex) 'Canonical task stop must occur after stopped-lifecycle eligibility.'
Assert-True ($taskRestartIndex -gt $taskStopIndex) 'Canonical task restart must occur after task stop.'
Assert-True ($lockHeldIndex -gt $taskRestartIndex) 'Fresh generation must prove startup lock HELD after task restart.'
Assert-True ($readyIndex -gt $lockHeldIndex) 'Fresh generation must become READY only after HELD lock proof.'
Assert-True ($reloadSatisfiedIndex -gt $readyIndex) 'Generation reload may be satisfied only after fresh READY proof.'
Assert-True ($webDeployIndex -gt $reloadSatisfiedIndex) 'Strict Web/API deploy must occur only after held-lock stale generation reload is satisfied.'

$heldSection = $recovery.Substring($eligibleIndex, $stoppedIndex - $eligibleIndex)
Assert-True (-not $heldSection.Contains('Stop-Process')) 'Held-lock quiesce must never kill a process directly.'
Assert-True (-not $heldSection.Contains('Stop-ScheduledTask')) 'Held-lock RUNNING+READY quiesce must stop lifecycle before touching Scheduled Task.'
Assert-True (-not $heldSection.Contains('startup-runner.lock') -or -not $heldSection.Contains('Remove-Item')) 'Held-lock path must never mutate the singleton lock by hand.'

Write-Host "PHASE7C_RUNNING_HELD_LOCK_PREWEB_GENERATION_SOURCE_TEST=PASS"
