$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Helper = Join-Path $PSScriptRoot 'recover-phase7c-runtime-ready-stable-deploy-local.ps1'

function Assert-True([bool]$Value, [string]$Message) {
  if (-not $Value) { throw $Message }
}

function Assert-PowerShellSyntax([string]$Path) {
  $tokens = $null
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors)
  if ($errors.Count -ne 0) {
    throw "PowerShell syntax error in ${Path}: $($errors[0].Message)"
  }
}

Assert-True (Test-Path -LiteralPath $Helper -PathType Leaf) "Missing recovery helper: $Helper"
Assert-PowerShellSyntax $Helper

$text = (Get-Content -LiteralPath $Helper -Raw).Replace("`r`n", "`n").Replace("`r", "`n")
$deployIndex = $text.IndexOf('& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WebApiDeploy', [System.StringComparison]::Ordinal)

# Production incident contract: source generation can already be exact while the
# lifecycle broker is dead, heartbeat evidence is missing, the task is Ready, the
# singleton lock is released, and orphan executor wrappers still exist. Strict Web
# deploy must never be attempted before bounded broker recovery in this tuple.
Assert-True ($text.Contains('$deadBrokerPreWebRecoveryRequired')) "RED: recovery must classify dead-broker availability independently from source-generation mismatch"
Assert-True ($text.Contains('PHASE7C_RUNTIME_READY_STABLE_RECOVERY_DEAD_BROKER_PRE_WEB=ELIGIBLE')) "RED: recovery must expose a dead-broker pre-Web eligibility marker"
Assert-True ($text.Contains("[string]$deadBrokerTask.State -eq 'Ready'")) "RED: dead-broker recovery must require Scheduled Task Ready"
Assert-True ($text.Contains('$deadBrokerCanonicalProcessCount -eq 0')) "RED: dead-broker recovery must require zero canonical task processes"
Assert-True ($text.Contains('$deadBrokerRunningInstanceCount -eq 0')) "RED: dead-broker recovery must require zero Scheduler running instances"
Assert-True ($text.Contains("[string]$deadBrokerGeneration.statusReadState -eq 'OK'")) "RED: dead-broker recovery must retain readable broker status evidence"
Assert-True ($text.Contains("[string]$deadBrokerGeneration.heartbeatReadState -in @('MISSING', 'OK')")) "RED: dead-broker recovery must explicitly support missing heartbeat evidence"
Assert-True ($text.Contains('-not [bool]$deadBrokerGeneration.brokerProcessAlive')) "RED: dead-broker recovery must prove broker process dead"
Assert-True ($text.Contains('-not [bool]$deadBrokerGeneration.brokerHeartbeatFresh')) "RED: dead-broker recovery must prove heartbeat not fresh"
Assert-True ($text.Contains("[string]$deadBrokerGeneration.startupRunnerLockState -in @('MISSING', 'RELEASED')")) "RED: dead-broker recovery must require released/missing singleton lock"
Assert-True ($text.Contains('Assert-PauseDisarmed -Stage "DEAD_BROKER_PRE_WEB"')) "RED: dead-broker recovery must re-prove PAUSE + DISARMED"
Assert-True ($text.Contains('Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "DEAD_BROKER_PRE_WEB"')) "RED: dead-broker recovery must pin Bridge session"
Assert-True ($text.Contains('Assert-FlatBroker -Stage "DEAD_BROKER_PRE_WEB"')) "RED: dead-broker recovery must require flat XAUUSD"
Assert-True ($text.Contains('PHASE7C_RUNTIME_READY_STABLE_RECOVERY_DEAD_BROKER_PRE_WEB_TASK_RESTART=PASS')) "RED: dead-broker recovery must restart only the existing canonical Scheduled Task"
Assert-True ($text.Contains('PHASE7C_RUNTIME_READY_STABLE_RECOVERY_DEAD_BROKER_PRE_WEB_STARTUP_RUNNER_LOCK=HELD')) "RED: restarted broker must restore the singleton lock"
Assert-True ($text.Contains('PHASE7C_RUNTIME_READY_STABLE_RECOVERY_DEAD_BROKER_PRE_WEB_LIFECYCLE_READY=PASS')) "RED: lifecycle must be stable READY before strict Web deploy"

$eligibleIndex = $text.IndexOf('PHASE7C_RUNTIME_READY_STABLE_RECOVERY_DEAD_BROKER_PRE_WEB=ELIGIBLE', [System.StringComparison]::Ordinal)
$restartIndex = $text.IndexOf('PHASE7C_RUNTIME_READY_STABLE_RECOVERY_DEAD_BROKER_PRE_WEB_TASK_RESTART=PASS', [System.StringComparison]::Ordinal)
$readyIndex = $text.IndexOf('PHASE7C_RUNTIME_READY_STABLE_RECOVERY_DEAD_BROKER_PRE_WEB_LIFECYCLE_READY=PASS', [System.StringComparison]::Ordinal)
Assert-True ($eligibleIndex -ge 0 -and $restartIndex -gt $eligibleIndex) "RED: task restart must follow bounded dead-broker eligibility"
Assert-True ($readyIndex -gt $restartIndex) "RED: lifecycle readiness must follow broker restart"
Assert-True ($deployIndex -gt $readyIndex) "RED: strict Web/API deploy must occur only after dead-broker recovery"

# Reuse canonical broker START orphan reconciliation from PR #348. The recovery
# helper must not directly kill wrapper processes or weaken the strict Web verifier.
Assert-True (-not $text.Contains('Stop-Process -Id $deadBroker')) "dead-broker recovery must not directly kill arbitrary processes"
Assert-True (-not $text.Contains('Stop-OrphanPowerShellProcess')) "dead-broker recovery must leave orphan cleanup to the canonical broker START path"

Write-Host 'PHASE7C_DEAD_BROKER_PREWEB_RECOVERY_SOURCE_TEST=PASS'
