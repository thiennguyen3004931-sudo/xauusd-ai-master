param(
  [Parameter(Mandatory = $true)] [string]$WorkDir,
  [string]$TaskName = "XAUUSD-Phase7C-Forward-Dashboard",
  [string]$ExecutionTaskName = "XAUUSD-Phase7B-Bot",
  [string]$ControlApiUrl = "http://127.0.0.1:3711",
  [string]$EnvFile = "packages/mt5-broker/bridge/.env.phase7b-demo",
  [string]$HostAddress = "127.0.0.1",
  [int]$Port = 5727,
  [int]$RefreshSeconds = 15,
  [int]$ReportRefreshSeconds = 300,
  [int]$ReportLookbackDays = 7,
  [switch]$StartTask
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Launcher = Join-Path $PSScriptRoot "run-phase7c-forward-dashboard-local.ps1"

if (-not (Test-Path $Launcher)) { throw "Phase 7C forward dashboard launcher not found: $Launcher" }
if ($HostAddress -notin @("127.0.0.1", "localhost", "::1")) { throw "Dashboard task must remain loopback-only. Refused HostAddress=$HostAddress" }
if ($Port -lt 1 -or $Port -gt 65535) { throw "Port must be between 1 and 65535." }
if ($RefreshSeconds -lt 5 -or $RefreshSeconds -gt 300) { throw "RefreshSeconds must be between 5 and 300." }
if ($ReportRefreshSeconds -lt 60 -or $ReportRefreshSeconds -gt 3600) { throw "ReportRefreshSeconds must be between 60 and 3600." }
if ($ReportLookbackDays -lt 1 -or $ReportLookbackDays -gt 90) { throw "ReportLookbackDays must be between 1 and 90." }

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$adminPrincipal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $adminPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run PowerShell as Administrator to install the Phase 7C forward dashboard scheduled task."
}

if (-not [System.IO.Path]::IsPathRooted($WorkDir)) { $WorkDir = Join-Path $ProjectRoot $WorkDir }
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
$WorkDir = (Resolve-Path $WorkDir).Path

if (-not [System.IO.Path]::IsPathRooted($EnvFile)) { $EnvFile = Join-Path $ProjectRoot $EnvFile }
if (-not (Test-Path $EnvFile)) { throw "Environment file not found: $EnvFile" }
$EnvFile = (Resolve-Path $EnvFile).Path

$executionTask = Get-ScheduledTask -TaskName $ExecutionTaskName -ErrorAction Stop
$executionActionsBefore = @($executionTask.Actions)
if ($executionActionsBefore.Count -ne 1) { throw "Execution task $ExecutionTaskName must have exactly one action before its principal can be reused safely." }
$executionFingerprintBefore = "$([string]$executionActionsBefore[0].Execute)|$([string]$executionActionsBefore[0].Arguments)|$([string]$executionActionsBefore[0].WorkingDirectory)|$([string]$executionTask.Principal.UserId)|$([string]$executionTask.Principal.LogonType)|$([string]$executionTask.Principal.RunLevel)"

$arguments = @(
  "-NoProfile",
  "-ExecutionPolicy Bypass",
  ('-File "{0}"' -f $Launcher),
  ('-WorkDir "{0}"' -f $WorkDir),
  ('-ControlApiUrl "{0}"' -f $ControlApiUrl),
  ('-EnvFile "{0}"' -f $EnvFile),
  ('-HostAddress "{0}"' -f $HostAddress),
  ('-Port {0}' -f $Port),
  ('-RefreshSeconds {0}' -f $RefreshSeconds),
  ('-ReportRefreshSeconds {0}' -f $ReportRefreshSeconds),
  ('-ReportLookbackDays {0}' -f $ReportLookbackDays)
) -join " "

if ($arguments -match "(?i)(MT5_(?:API|BRIDGE_API)_KEY\s*=|ZIQ_TELEGRAM_BOT_TOKEN\s*=|x-phase7c-token)") {
  throw "Refusing to register dashboard task because a secret-like value appears in task arguments."
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -ne $existing) {
  $existingActions = @($existing.Actions)
  if ($existingActions.Count -ne 1) { throw "Existing dashboard task $TaskName has $($existingActions.Count) actions; refusing automatic replacement." }
  $existingText = "$([string]$existingActions[0].Execute) $([string]$existingActions[0].Arguments)"
  if ($existingText -notlike "*run-phase7c-forward-dashboard-local.ps1*") {
    throw "Task $TaskName already exists but does not belong to the Phase 7C forward dashboard. Refusing replacement."
  }
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $executionTask.Principal `
  -Description "XAUUSD Phase7C Forward DEMO dashboard + read-only report refresh. Independent from trade execution." `
  -Force | Out-Null

$registered = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
$registeredActions = @($registered.Actions)
if ($registeredActions.Count -ne 1) { throw "Dashboard task registration verification failed: expected exactly one action." }
$registeredText = "$([string]$registeredActions[0].Execute) $([string]$registeredActions[0].Arguments)"
if ([string]$registeredActions[0].Execute -notmatch "powershell" -or $registeredText -notlike "*run-phase7c-forward-dashboard-local.ps1*" -or $registeredText -notlike "*-Port $Port*") {
  throw "Dashboard task registration verification failed: action does not match the read-only dashboard launcher."
}
if ($registeredText -match "(?i)(MT5_(?:API|BRIDGE_API)_KEY\s*=|ZIQ_TELEGRAM_BOT_TOKEN\s*=|x-phase7c-token)") {
  throw "Dashboard task registration verification failed: secret-like value found in task arguments."
}
$bootTrigger = @($registered.Triggers | Where-Object { $_.CimClass.CimClassName -eq "MSFT_TaskBootTrigger" })
if ($bootTrigger.Count -lt 1) { throw "Dashboard task registration verification failed: startup trigger missing." }

$executionTaskAfter = Get-ScheduledTask -TaskName $ExecutionTaskName -ErrorAction Stop
$executionActionsAfter = @($executionTaskAfter.Actions)
if ($executionActionsAfter.Count -ne 1) { throw "Execution task changed unexpectedly while dashboard task was installed." }
$executionFingerprintAfter = "$([string]$executionActionsAfter[0].Execute)|$([string]$executionActionsAfter[0].Arguments)|$([string]$executionActionsAfter[0].WorkingDirectory)|$([string]$executionTaskAfter.Principal.UserId)|$([string]$executionTaskAfter.Principal.LogonType)|$([string]$executionTaskAfter.Principal.RunLevel)"
if ($executionFingerprintAfter -ne $executionFingerprintBefore) { throw "Execution task action/principal changed unexpectedly. Dashboard task installation refuses this state." }

Write-Host "PHASE7C_DASHBOARD_TASK_INSTALL=PASS"
Write-Host "PHASE7C_DASHBOARD_TASK_NAME=$TaskName"
Write-Host "PHASE7C_DASHBOARD_TASK_TRIGGER=AT_STARTUP"
Write-Host "PHASE7C_DASHBOARD_TASK_PRINCIPAL_SOURCE=$ExecutionTaskName"
Write-Host "PHASE7C_DASHBOARD_TASK_PRINCIPAL_USER=$($registered.Principal.UserId)"
Write-Host "PHASE7C_DASHBOARD_TASK_ACTION=FORWARD_DASHBOARD_READ_ONLY"
Write-Host "PHASE7C_DASHBOARD_TASK_URL=http://${HostAddress}:${Port}/"
Write-Host "PHASE7C_DASHBOARD_TASK_REPORT_REFRESH_SECONDS=$ReportRefreshSeconds"
Write-Host "PHASE7C_DASHBOARD_TASK_REPORT_LOOKBACK_DAYS=$ReportLookbackDays"
Write-Host "PHASE7C_DASHBOARD_TASK_SECRETS_IN_ARGUMENTS=False"
Write-Host "PHASE7C_DASHBOARD_TASK_MT5_MUTATION=False"
Write-Host "PHASE7C_DASHBOARD_TASK_EXECUTION_TASK_UNCHANGED=True"

if ($StartTask) {
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -ne $listener) {
    throw "Port $Port is already listening (PID=$($listener.OwningProcess)). Stop the manually launched dashboard before using -StartTask."
  }
  Start-ScheduledTask -TaskName $TaskName
  Start-Sleep -Seconds 3
  $afterStart = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
  Write-Host "PHASE7C_DASHBOARD_TASK_START=REQUESTED"
  Write-Host "PHASE7C_DASHBOARD_TASK_STATE=$($afterStart.State)"
} else {
  Write-Host "PHASE7C_DASHBOARD_TASK_START=SKIPPED"
}
