$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RecoveryPath = Join-Path $PSScriptRoot "recover-phase7c-runtime-ready-stable-deploy-local.ps1"
if (-not (Test-Path -LiteralPath $RecoveryPath -PathType Leaf)) {
  throw "Recovery helper source not found: $RecoveryPath"
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

# Production reproduction, 2026-09-05:
# - canonical SYSTEM task remained Queued after Start-ScheduledTask
# - battery/idle/network restrictions were not active
# - Task Scheduler service was Running
# - COM running instance count was zero
# - no powershell process matched the canonical encoded task action
# - startup-runner lock was RELEASED
# - old broker PID was dead and heartbeat stale
# The recovery path must classify that exact orphan queue shape before it can
# cancel the queued request and retry the same canonical task exactly once.
$required = @(
  'function Get-Phase7CCanonicalTaskProcessCount',
  'function Get-Phase7CRunningTaskInstanceCount',
  'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_ORPHAN_QUEUED=ELIGIBLE',
  'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_ORPHAN_QUEUED_CLEAR=PASS',
  'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_ORPHAN_QUEUED_RESTART_RETRY=ONCE',
  '[string]$orphanQueuedTask.State -eq ''Queued''',
  '$orphanCanonicalProcessCount -eq 0',
  '$orphanRunningInstanceCount -eq 0',
  '-not [bool]$orphanRuntimeGeneration.brokerProcessAlive',
  '-not [bool]$orphanRuntimeGeneration.brokerHeartbeatFresh',
  '[string]$orphanRuntimeGeneration.startupRunnerLockState -in @(''MISSING'', ''RELEASED'')',
  'Assert-PauseDisarmed -Stage "GENERATION_PRE_WEB_ORPHAN_QUEUED"',
  'Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "GENERATION_PRE_WEB_ORPHAN_QUEUED"',
  'Assert-FlatBroker -Stage "GENERATION_PRE_WEB_ORPHAN_QUEUED"'
)
foreach ($literal in $required) {
  Assert-True ($recovery.Contains($literal)) "RED: orphan-queued generation recovery contract missing: $literal"
}

$eligible = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_ORPHAN_QUEUED=ELIGIBLE'
$clear = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_ORPHAN_QUEUED_CLEAR=PASS'
$retry = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_ORPHAN_QUEUED_RESTART_RETRY=ONCE'
$normalFailure = 'Canonical pre-Web source generation task restart did not produce a fresh new lifecycle broker.'

$eligibleIndex = $recovery.IndexOf($eligible, [System.StringComparison]::Ordinal)
$clearIndex = $recovery.IndexOf($clear, [System.StringComparison]::Ordinal)
$retryIndex = $recovery.IndexOf($retry, [System.StringComparison]::Ordinal)
$failureIndex = $recovery.IndexOf($normalFailure, [System.StringComparison]::Ordinal)

Assert-True ($eligibleIndex -ge 0) 'Orphan queue recovery must expose an explicit eligibility marker.'
Assert-True ($clearIndex -gt $eligibleIndex) 'Queued task cancellation must occur only after exact orphan eligibility.'
Assert-True ($retryIndex -gt $clearIndex) 'The single task restart retry must occur only after the orphan queue is proven cleared.'
Assert-True ($failureIndex -gt $retryIndex) 'Normal fail-closed broker restart failure must remain after the one bounded retry.'

$orphanSection = $recovery.Substring($eligibleIndex, $failureIndex - $eligibleIndex)
Assert-True ($orphanSection.Contains('Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop')) `
  'Orphan queue recovery must clear the queued request through the same canonical Scheduled Task.'
Assert-True ($orphanSection.Contains('Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop')) `
  'Orphan queue recovery must retry the same canonical Scheduled Task after clear proof.'
Assert-True (-not $orphanSection.Contains('Register-ScheduledTask')) `
  'Orphan queue recovery must not re-register the Scheduled Task.'
Assert-True (-not $orphanSection.Contains('Restart-Service')) `
  'Orphan queue recovery must not restart the Task Scheduler service.'

Write-Host "PHASE7C_ORPHAN_QUEUED_GENERATION_RESTART_SOURCE_TEST=PASS"
