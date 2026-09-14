$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RecoveryPath = Join-Path $PSScriptRoot "recover-phase7c-runtime-ready-stable-deploy-local.ps1"
if (-not (Test-Path -LiteralPath $RecoveryPath -PathType Leaf)) {
  throw "Required recovery source not found: $RecoveryPath"
}

function Assert-PowerShellSyntax([string]$Path) {
  $tokens = $null
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors)
  if ($errors.Count -ne 0) {
    throw "PowerShell syntax error in ${Path}: $($errors[0].Message)"
  }
}

function Assert-True([bool]$Value, [string]$Message) {
  if (-not $Value) { throw $Message }
}

Assert-PowerShellSyntax $RecoveryPath
$recovery = (Get-Content -LiteralPath $RecoveryPath -Raw).Replace("`r`n", "`n").Replace("`r", "`n")

# Production reproduction 2026-09-14:
# - source generation reload REQUIRED from deployment/source attestation mismatch
# - lifecycle still RUNNING+READY in PAUSE on LIVE
# - canonical Scheduled Task already repaired to the accepted runner definition
# - stale broker remains alive/fresh with startup-runner lock HELD
# The recovery must quiesce the lifecycle before strict Web/API deploy, then reuse the
# stopped-lifecycle canonical generation reload. The stale broker's launcher SHA is
# intentionally NOT required to equal the newly accepted runner SHA because the task
# definition may have been repaired after that broker started.
$required = @(
  '$preWebRunningHeldLockObserved',
  '$preWebRunningHeldLockCandidate',
  '$preWebRunningHeldLockReloadEligible',
  'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_RUNNING_HELD_LOCK=ELIGIBLE_QUIESCE_REQUIRED',
  '[string]$preWebRuntimeGeneration.startupRunnerLockState -eq ''HELD''',
  '[string]$preWebTask.State -eq ''Running''',
  '[string]$preWebRuntimeGeneration.statusReadState -eq ''OK''',
  '[string]$preWebRuntimeGeneration.heartbeatReadState -eq ''OK''',
  '[bool]$preWebRuntimeGeneration.brokerStatusPidMatch',
  '[bool]$preWebRuntimeGeneration.brokerProcessAlive',
  '[bool]$preWebRuntimeGeneration.brokerHeartbeatFresh',
  '$preWebRunningHeldCanonicalProcessIds.Count -eq 1',
  '$preWebRunningHeldInstanceCount -eq 1',
  '[int]$preWebRunningHeldCanonicalProcessIds[0] -eq [int]$preWebRuntimeGeneration.statusBrokerPid',
  '[string]$preWebRunningHeldBrokerAttestation.component -eq ''lifecycle-broker''',
  '[int]$preWebRunningHeldBrokerAttestation.pid -eq [int]$preWebRuntimeGeneration.statusBrokerPid',
  '[bool]$preWebRunningHeldOwnership.owned',
  '[bool]$preWebRunningHeldOwnership.canonical',
  '-not [bool]$preWebRunningHeldOwnership.repairRequired',
  '$preWebRunningHeldDrift.Count -eq 0',
  'Assert-PauseDisarmed -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK"',
  'Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK"',
  'Assert-FlatBroker -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK"',
  'RUNNING+READY HELD-lock canonical broker tuple changed during safety recheck; lifecycle stop blocked.',
  '[void](Invoke-ApiPost "/api/v1/phase7c/lifecycle/stop" @{})',
  'Wait-LifecycleStopped',
  'Assert-LifecycleExecutorsStopped -Stage "GENERATION_PRE_WEB_RUNNING_HELD_LOCK_POST_STOP"',
  'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_RUNNING_HELD_LOCK_LIFECYCLE_STOP=PASS'
)
foreach ($literal in $required) {
  Assert-True ($recovery.Contains($literal)) "RED: RUNNING+READY HELD-lock pre-Web generation contract missing: $literal"
}

$eligible = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_RUNNING_HELD_LOCK=ELIGIBLE_QUIESCE_REQUIRED'
$stopped = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_RUNNING_HELD_LOCK_LIFECYCLE_STOP=PASS'
$stoppedGenerationEligible = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB=ELIGIBLE'
$taskStop = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_TASK_STOP=PASS'
$brokerStop = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_BROKER_PROCESS_STOP=PASS'
$taskRestart = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_TASK_RESTART=PASS'
$lockHeld = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_STARTUP_RUNNER_LOCK=HELD'
$ready = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_LIFECYCLE_READY=PASS'
$reloadSatisfied = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_SOURCE_GENERATION_RELOAD=SATISFIED_PRE_WEB'
$webDeploy = '& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WebApiDeploy'

$eligibleIndex = $recovery.IndexOf($eligible, [System.StringComparison]::Ordinal)
$stoppedIndex = $recovery.IndexOf($stopped, [System.StringComparison]::Ordinal)
$stoppedGenerationEligibleIndex = $recovery.IndexOf($stoppedGenerationEligible, [System.StringComparison]::Ordinal)
$taskStopIndex = $recovery.IndexOf($taskStop, [System.StringComparison]::Ordinal)
$brokerStopIndex = $recovery.IndexOf($brokerStop, [System.StringComparison]::Ordinal)
$taskRestartIndex = $recovery.IndexOf($taskRestart, [System.StringComparison]::Ordinal)
$lockHeldIndex = $recovery.IndexOf($lockHeld, [System.StringComparison]::Ordinal)
$readyIndex = $recovery.IndexOf($ready, [System.StringComparison]::Ordinal)
$reloadSatisfiedIndex = $recovery.IndexOf($reloadSatisfied, [System.StringComparison]::Ordinal)
$webDeployIndex = $recovery.IndexOf($webDeploy, [System.StringComparison]::Ordinal)

Assert-True ($eligibleIndex -ge 0) 'RUNNING+READY HELD-lock recovery must expose exact quiesce eligibility.'
Assert-True ($stoppedIndex -gt $eligibleIndex) 'Lifecycle STOP proof must follow HELD-lock eligibility.'
Assert-True ($stoppedGenerationEligibleIndex -gt $stoppedIndex) 'Stopped-lifecycle generation reload must be re-authorized only after lifecycle STOP.'
Assert-True ($taskStopIndex -gt $stoppedGenerationEligibleIndex) 'Canonical task stop must follow stopped-lifecycle generation eligibility.'
Assert-True ($brokerStopIndex -gt $taskStopIndex) 'Old broker exit proof must follow canonical task stop.'
Assert-True ($taskRestartIndex -gt $brokerStopIndex) 'Canonical task restart must wait for old broker exit.'
Assert-True ($lockHeldIndex -gt $taskRestartIndex) 'Fresh generation must prove startup lock HELD after task restart.'
Assert-True ($readyIndex -gt $lockHeldIndex) 'Lifecycle READY must follow fresh generation lock proof.'
Assert-True ($reloadSatisfiedIndex -gt $readyIndex) 'Generation reload may be satisfied only after READY is stable.'
Assert-True ($webDeployIndex -gt $reloadSatisfiedIndex) 'Strict Web/API deploy must occur only after the generation reload is satisfied.'

$heldSection = $recovery.Substring($eligibleIndex, $stoppedGenerationEligibleIndex - $eligibleIndex)
Assert-True (-not $heldSection.Contains('Stop-Process')) `
  'RUNNING+READY HELD-lock recovery must never kill a process directly.'
Assert-True (-not $heldSection.Contains('Start-ScheduledTask')) `
  'RUNNING+READY HELD-lock quiesce must not restart task before lifecycle STOP is proven.'
Assert-True (-not $heldSection.Contains('$preWebRunningHeldAttestedLauncherSha256 -eq $preWebExpectedLauncherSha256')) `
  'Stale broker must not be rejected merely because its launcher SHA predates the repaired canonical task definition.'
Assert-True (-not $heldSection.Contains('Set-Content')) `
  'RUNNING+READY HELD-lock recovery must never mutate singleton lock evidence by hand.'
Assert-True (-not $heldSection.Contains('Remove-Item')) `
  'RUNNING+READY HELD-lock recovery must never delete singleton lock evidence by hand.'

Write-Host "PHASE7C_RUNNING_READY_HELD_LOCK_PREWEB_GENERATION_SOURCE_CONTRACT=PASS"