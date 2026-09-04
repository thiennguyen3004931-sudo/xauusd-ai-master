$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RecoveryPath = Join-Path $PSScriptRoot "recover-phase7c-runtime-ready-stable-deploy-local.ps1"
$DashboardPath = Join-Path $PSScriptRoot "deploy-phase7c-mt5-dashboard-local.ps1"

foreach ($required in @($RecoveryPath, $DashboardPath)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Required stopped-lifecycle pre-Web generation source not found: $required"
  }
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
Assert-PowerShellSyntax $DashboardPath
$recovery = (Get-Content -LiteralPath $RecoveryPath -Raw).Replace("`r`n", "`n").Replace("`r", "`n")
$dashboard = (Get-Content -LiteralPath $DashboardPath -Raw).Replace("`r`n", "`n").Replace("`r", "`n")

# Production reproduction: dashboard deploy is intentionally strict and requires
# live executor PID files before it will stop/restart the Web/API task. Therefore a
# canonical recovery that begins with lifecycle STOPPED + zero executors cannot call
# Web/API deploy first; it must restore a fresh attested SYSTEM generation and READY
# lifecycle before entering the unchanged strict dashboard path.
Assert-True ($dashboard.Contains('$supervisorPid = Read-AlivePid "supervisor"')) `
  'Dashboard deploy must retain strict live supervisor PID protection.'
Assert-True ($dashboard.Contains('$trendPid = Read-AlivePid "trend"')) `
  'Dashboard deploy must retain strict live trend PID protection.'
Assert-True ($dashboard.Contains('$sidewayPid = Read-AlivePid "sideway"')) `
  'Dashboard deploy must retain strict live sideway PID protection.'
Assert-True ($dashboard.Contains('-RequireTelegram')) `
  'Dashboard deploy must retain strict Telegram verification.'

$eligible = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB=ELIGIBLE'
$stoppedProof = 'Assert-LifecycleExecutorsStopped -Stage "GENERATION_PRE_WEB"'
$taskStop = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_TASK_STOP=PASS'
$brokerStop = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_BROKER_PROCESS_STOP=PASS'
$taskRestart = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_TASK_RESTART=PASS'
$lockHeld = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_STARTUP_RUNNER_LOCK=HELD'
$ready = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_GENERATION_PRE_WEB_LIFECYCLE_READY=PASS'
$reloadSatisfied = 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_SOURCE_GENERATION_RELOAD=SATISFIED_PRE_WEB'
$webDeploy = '& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WebApiDeploy'

foreach ($literal in @($eligible, $stoppedProof, $taskStop, $brokerStop, $taskRestart, $lockHeld, $ready, $reloadSatisfied)) {
  Assert-True ($recovery.Contains($literal)) "RED: stopped-lifecycle generation recovery contract missing: $literal"
}

$eligibleIndex = $recovery.IndexOf($eligible, [System.StringComparison]::Ordinal)
$stoppedIndex = $recovery.IndexOf($stoppedProof, [System.StringComparison]::Ordinal)
$taskStopIndex = $recovery.IndexOf($taskStop, [System.StringComparison]::Ordinal)
$brokerStopIndex = $recovery.IndexOf($brokerStop, [System.StringComparison]::Ordinal)
$taskRestartIndex = $recovery.IndexOf($taskRestart, [System.StringComparison]::Ordinal)
$lockIndex = $recovery.IndexOf($lockHeld, [System.StringComparison]::Ordinal)
$readyIndex = $recovery.IndexOf($ready, [System.StringComparison]::Ordinal)
$reloadSatisfiedIndex = $recovery.IndexOf($reloadSatisfied, [System.StringComparison]::Ordinal)
$webDeployIndex = $recovery.IndexOf($webDeploy, [System.StringComparison]::Ordinal)

Assert-True ($eligibleIndex -ge 0) 'Stopped-lifecycle pre-Web generation path must have an explicit eligibility marker.'
Assert-True ($stoppedIndex -gt $eligibleIndex) 'Pre-Web generation recovery must prove all executors stopped after eligibility.'
Assert-True ($taskStopIndex -gt $stoppedIndex) 'Canonical task stop must occur only after stopped-executor proof.'
Assert-True ($brokerStopIndex -gt $taskStopIndex) 'Task restart must wait for previous broker exit proof.'
Assert-True ($taskRestartIndex -gt $brokerStopIndex) 'Canonical task restart must occur only after previous broker exits.'
Assert-True ($lockIndex -gt $taskRestartIndex) 'New generation must prove startup lock HELD after task restart.'
Assert-True ($readyIndex -gt $lockIndex) 'Lifecycle must become stably READY only after new generation lock proof.'
Assert-True ($reloadSatisfiedIndex -gt $readyIndex) 'Generation requirement must be marked satisfied only after stable READY.'
Assert-True ($webDeployIndex -gt $reloadSatisfiedIndex) 'Strict Web/API dashboard deploy must occur only after stopped-lifecycle generation recovery is complete.'

Assert-True ($recovery.Contains('Assert-PauseDisarmed -Stage "GENERATION_PRE_WEB"')) `
  'Pre-Web generation recovery must remain PAUSE + DISARMED.'
Assert-True ($recovery.Contains('Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "GENERATION_PRE_WEB"')) `
  'Pre-Web generation recovery must preserve Bridge session identity.'
Assert-True ($recovery.Contains('Assert-FlatBroker -Stage "GENERATION_PRE_WEB"')) `
  'Pre-Web generation recovery must require XAUUSD flatness.'
Assert-True ($recovery.Contains('Canonical pre-Web source generation reload requires the Scheduled Task to remain exact canonical.')) `
  'Pre-Web generation recovery must fail closed unless task definition remains canonical.'
Assert-True ($recovery.Contains('Canonical pre-Web source generation reload requires SYSTEM + ServiceAccount + Highest.')) `
  'Pre-Web generation recovery must preserve SYSTEM principal proof.'
Assert-True (-not $recovery.Contains('GENERATION_PRE_WEB_TASK_REPAIR')) `
  'Stopped-lifecycle canonical generation recovery must not repair task definition.'

Write-Host "PHASE7C_STOPPED_LIFECYCLE_PREWEB_GENERATION_SOURCE_TEST=PASS"
