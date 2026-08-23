param(
  [string]$TaskName = "XAUUSD-Phase7C-Bridge"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Runner = Join-Path $PSScriptRoot "run-phase7c-account-bridge-task-runner-local.ps1"
if (-not (Test-Path -LiteralPath $Runner)) { throw "Phase7C account bridge runner not found: $Runner" }

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Registering the Phase7C account bridge task requires PowerShell Administrator."
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument ("-NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f $Runner) `
  -WorkingDirectory $ProjectRoot

$userId = if ($env:USERDOMAIN) { "$env:USERDOMAIN\$env:USERNAME" } else { $env:USERNAME }
$principal = New-ScheduledTaskPrincipal `
  -UserId $userId `
  -LogonType Interactive `
  -RunLevel Highest
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Force | Out-Null

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
$actionText = "$($task.Actions[0].Execute) $($task.Actions[0].Arguments)"
if ($task.Actions.Count -ne 1 -or $actionText -notlike "*run-phase7c-account-bridge-task-runner-local.ps1*") {
  throw "Registered bridge task action verification failed."
}

Write-Host "PHASE7C_ACCOUNT_BRIDGE_TASK=$TaskName"
Write-Host "PHASE7C_ACCOUNT_BRIDGE_TASK_STATE=$($task.State)"
Write-Host "PHASE7C_ACCOUNT_BRIDGE_TASK_ACTION=PASS"
Write-Host "PHASE7C_ACCOUNT_BRIDGE_TASK_STATUS=PASS"
