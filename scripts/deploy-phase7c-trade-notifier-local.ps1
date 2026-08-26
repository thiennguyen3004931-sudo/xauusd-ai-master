param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("DEMO", "LIVE")]
  [string]$AccountMode,
  [string]$TaskName = "XAUUSD-Phase7C-Executors",
  [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ConfigPath = Join-Path $ProjectRoot ".runtime\phase7c-executor-task-config.json"
$AccountLibrary = Join-Path $PSScriptRoot "lib\phase7c-account-mode.ps1"
$TaskOwnershipLibrary = Join-Path $PSScriptRoot "lib\phase7c-scheduled-task-ownership.ps1"
$Verifier = Join-Path $PSScriptRoot "verify-phase7c-executors-local.ps1"

foreach ($required in @($ConfigPath, $AccountLibrary, $TaskOwnershipLibrary, $Verifier)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Phase 7C trade notifier deploy required file not found: $required"
  }
}
if ($TimeoutSeconds -lt 30 -or $TimeoutSeconds -gt 600) {
  throw "TimeoutSeconds must be between 30 and 600."
}

. $AccountLibrary
. $TaskOwnershipLibrary
$AccountMode = ConvertTo-Phase7CAccountMode $AccountMode

function Assert-Phase7CDeployAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "PHASE7C_TRADE_NOTIFIER_DEPLOY_ADMIN=REQUIRED"
    throw "Run deploy-phase7c-trade-notifier-local.ps1 from PowerShell Administrator."
  }
  Write-Host "PHASE7C_TRADE_NOTIFIER_DEPLOY_ADMIN=PASS"
}

function Resolve-Phase7CConfigPath([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
  if ([System.IO.Path]::IsPathRooted($Value)) { return [System.IO.Path]::GetFullPath($Value) }
  return [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot $Value))
}

function Get-LiveProcess([int]$ProcessId) {
  if ($ProcessId -le 0) { return $null }
  return Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
}

Assert-Phase7CDeployAdministrator
Import-Module ScheduledTasks -ErrorAction Stop

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$configVersion = [int]$config.version
if ($configVersion -notin @(1, 2)) {
  throw "Unsupported executor task config version: $configVersion"
}
if (-not [bool]$config.armed) {
  throw "Trade notifier deploy requires executor task config armed=true."
}

$configAccountMode = "DEMO"
if ($configVersion -eq 1) {
  if (-not [bool]$config.demoOnly) { throw "Legacy v1 executor task config must remain demoOnly=true." }
} else {
  $configAccountMode = ConvertTo-Phase7CAccountMode ([string]$config.accountMode)
  if ($configAccountMode -eq "LIVE") {
    if ($null -eq $config.PSObject.Properties["liveExecutionEnabled"] -or -not [bool]$config.liveExecutionEnabled) {
      throw "LIVE executor task config requires liveExecutionEnabled=true."
    }
    if ($null -ne $config.PSObject.Properties["demoOnly"] -and [bool]$config.demoOnly) {
      throw "LIVE executor task config must set demoOnly=false."
    }
  }
}
if ($configAccountMode -ne $AccountMode) {
  throw "Deploy account mode does not match executor task config. requested=$AccountMode config=$configAccountMode"
}

$WorkDir = Resolve-Phase7CConfigPath ([string]$config.workDir)
$EnvFile = Resolve-Phase7CConfigPath ([string]$config.envFile)
$TelegramEnvFile = Resolve-Phase7CConfigPath ([string]$config.telegramEnvFile)
$ControlApiUrl = ([string]$config.controlApiUrl).TrimEnd('/')
if ([string]::IsNullOrWhiteSpace($ControlApiUrl)) { throw "Executor task controlApiUrl is missing." }
foreach ($requiredPath in @($WorkDir, $EnvFile, $TelegramEnvFile)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) { throw "Configured deploy path not found: $requiredPath" }
}

$RuntimeDir = Join-Path $WorkDir "phase7c-executors"
$SupervisorPidPath = Join-Path $RuntimeDir "supervisor.pid"
$StartupRunnerStatusPath = Join-Path $RuntimeDir "startup-runner-status.json"
$StartupRunnerLockPath = Join-Path $RuntimeDir "startup-runner.lock"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
$expectedRunnerPath = Get-Phase7CExecutorTaskRunnerPath -ProjectRoot $ProjectRoot
$ownership = Test-Phase7CExecutorTaskActionOwnership -Actions $task.Actions -ExpectedRunnerPath $expectedRunnerPath
Write-Host "PHASE7C_TRADE_NOTIFIER_DEPLOY_TASK_OWNERSHIP=$($ownership.reason)"
if (-not $ownership.owned) {
  throw "Scheduled Task ownership cannot be proven. reason=$($ownership.reason)"
}
$taskDrift = @(Get-Phase7CExecutorTaskDrift -Task $task)
if ($taskDrift.Count -ne 0) {
  throw "Scheduled Task has canonical drift: $($taskDrift -join ',')"
}
if ([string]$task.State -ne "Running") {
  throw "Scheduled Task must already be Running; direct Start/Stop-ScheduledTask mutation is intentionally not used. state=$($task.State)"
}

if (-not (Test-Path -LiteralPath $StartupRunnerStatusPath -PathType Leaf)) {
  throw "startup-runner-status.json is missing: $StartupRunnerStatusPath"
}
$runnerStatus = Get-Content -LiteralPath $StartupRunnerStatusPath -Raw | ConvertFrom-Json
$runnerPid = [int]$runnerStatus.runnerPid
if ($runnerPid -le 0 -or $null -eq (Get-LiveProcess $runnerPid)) {
  throw "Startup runner status does not identify a live runner process. pid=$runnerPid"
}
if ([string]$runnerStatus.accountMode -ne $AccountMode) {
  throw "Startup runner account mode mismatch. requested=$AccountMode actual=$($runnerStatus.accountMode)"
}
$runnerLockState = Get-Phase7CStartupRunnerLockState -LockPath $StartupRunnerLockPath
if ($runnerLockState -ne "HELD") {
  throw "Startup runner singleton lock is not held. state=$runnerLockState"
}
Write-Host "PHASE7C_TRADE_NOTIFIER_DEPLOY_RUNNER_PID=$runnerPid"
Write-Host "PHASE7C_TRADE_NOTIFIER_DEPLOY_RUNNER_LOCK=$runnerLockState"

$pauseBody = @{
  mode = "PAUSE"
  source = "trade-notifier-deploy"
} | ConvertTo-Json -Compress
$pauseResult = Invoke-RestMethod -Uri "$ControlApiUrl/api/v1/phase7c/bot-mode" -Method Post -ContentType "application/json" -Body $pauseBody -TimeoutSec 5
if ([string]$pauseResult.state.mode -ne "PAUSE") {
  throw "Failed to persist PAUSE before notifier deploy. actual=$($pauseResult.state.mode)"
}
Write-Host "PHASE7C_TRADE_NOTIFIER_DEPLOY_MODE=PAUSE"

$envInfo = Assert-Phase7CAccountEnv -EnvFile $EnvFile -AccountMode $AccountMode -RequireTrading
$bridgeBase = "http://$($envInfo.bridgeHost):$($envInfo.bridgePort)"
$headers = @{ "x-mt5-api-key" = $envInfo.apiKey }
$health = Invoke-RestMethod -Uri "$bridgeBase/health" -Headers $headers -Method Get -TimeoutSec 5
$expectedBridgeMode = if ($AccountMode -eq "LIVE") { "real" } else { "demo" }
if (-not [bool]$health.connected -or [string]$health.status -ne "ok" -or [string]$health.accountMode -ne $expectedBridgeMode) {
  throw "MT5 bridge is not healthy for $AccountMode deploy. connected=$($health.connected) status=$($health.status) mode=$($health.accountMode) expected=$expectedBridgeMode"
}
$positionsResponse = Invoke-RestMethod -Uri "$bridgeBase/v1/positions?symbol=XAUUSD" -Headers $headers -Method Get -TimeoutSec 5
$positions = @($positionsResponse)
if ($positions.Count -ne 0) {
  throw "Trade notifier deploy restart requires zero XAUUSD positions. current=$($positions.Count)"
}
Write-Host "PHASE7C_TRADE_NOTIFIER_DEPLOY_XAUUSD_POSITIONS=0"
Write-Host "PHASE7C_TRADE_NOTIFIER_DEPLOY_ORDER_ACTION=NONE"
Write-Host "PHASE7C_TRADE_NOTIFIER_DEPLOY_TELEGRAM_TEST=NONE"

if (-not (Test-Path -LiteralPath $SupervisorPidPath -PathType Leaf)) {
  throw "Supervisor PID file is missing: $SupervisorPidPath"
}
$oldSupervisorPid = [int](Get-Content -LiteralPath $SupervisorPidPath -Raw).Trim()
if ($oldSupervisorPid -le 0 -or $null -eq (Get-LiveProcess $oldSupervisorPid)) {
  throw "Supervisor PID is not alive before deploy. pid=$oldSupervisorPid"
}
if ($oldSupervisorPid -eq $runnerPid) {
  throw "Refusing to terminate startup runner; supervisor PID unexpectedly equals runner PID."
}
Write-Host "PHASE7C_TRADE_NOTIFIER_DEPLOY_OLD_SUPERVISOR_PID=$oldSupervisorPid"

$taskkillExe = Join-Path $env:SystemRoot "System32\taskkill.exe"
if (-not (Test-Path -LiteralPath $taskkillExe -PathType Leaf)) { throw "taskkill.exe not found: $taskkillExe" }
& $taskkillExe /PID $oldSupervisorPid /T /F | Out-Host
$taskkillExit = $LASTEXITCODE
if ($null -eq $taskkillExit) { $taskkillExit = 0 }
if ([int]$taskkillExit -ne 0) {
  throw "Failed to terminate Phase 7C supervisor process tree. exitCode=$taskkillExit"
}
Write-Host "PHASE7C_TRADE_NOTIFIER_DEPLOY_SUPERVISOR_TREE_STOP=PASS"

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$newSupervisorPid = 0
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 2
  $candidatePid = 0
  if (Test-Path -LiteralPath $SupervisorPidPath -PathType Leaf) {
    try { $candidatePid = [int](Get-Content -LiteralPath $SupervisorPidPath -Raw).Trim() } catch { $candidatePid = 0 }
  }
  if ($candidatePid -gt 0 -and $candidatePid -ne $oldSupervisorPid -and $null -ne (Get-LiveProcess $candidatePid)) {
    $newSupervisorPid = $candidatePid
    break
  }
}
if ($newSupervisorPid -le 0) {
  throw "Startup runner did not establish a new supervisor before timeout. oldPid=$oldSupervisorPid timeoutSeconds=$TimeoutSeconds"
}
Write-Host "PHASE7C_TRADE_NOTIFIER_DEPLOY_NEW_SUPERVISOR_PID=$newSupervisorPid"

$lastVerificationError = "not attempted"
while ((Get-Date) -lt $deadline) {
  try {
    $verificationOutput = & $Verifier `
      -WorkDir $WorkDir `
      -TaskName $TaskName `
      -ControlApiUrl $ControlApiUrl `
      -EnvFile $EnvFile `
      -TelegramEnvFile $TelegramEnvFile `
      -AccountMode $AccountMode `
      -DeploymentGate `
      -RequireMigratedTask `
      -RequireTelegram *>&1
    $verificationText = $verificationOutput | Out-String
    if ($verificationText -notmatch 'PHASE7C_VERIFY_DEPLOYMENT_GATE=PASS') {
      throw "Deployment verifier returned without PASS marker.`n$verificationText"
    }
    $verificationOutput | ForEach-Object { Write-Host ([string]$_) }
    Write-Host "PHASE7C_TRADE_NOTIFIER_DEPLOY=PASS"
    Write-Host "PHASE7C_TRADE_NOTIFIER_DEPLOY_ACCOUNT_MODE=$AccountMode"
    Write-Host "PHASE7C_TRADE_NOTIFIER_DEPLOY_FINAL_MODE=PAUSE"
    Write-Host "PHASE7C_TRADE_NOTIFIER_DEPLOY_ORDER_PERMISSION=NONE"
    exit 0
  } catch {
    $lastVerificationError = $_.Exception.Message
    Start-Sleep -Seconds 2
  }
}

throw "New supervisor is alive but deployment gate did not pass before timeout. lastError=$lastVerificationError"
