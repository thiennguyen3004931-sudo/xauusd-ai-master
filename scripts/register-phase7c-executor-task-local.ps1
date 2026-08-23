param(
  [string]$TaskName = 'XAUUSD-Phase7C-Executors',
  [string]$ProjectRoot = '',
  [switch]$Repair,
  [switch]$Create,
  [string]$PrincipalUserId = '',
  [ValidateSet('', 'Interactive', 'S4U', 'ServiceAccount')]
  [string]$PrincipalLogonType = ''
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $PSScriptRoot
}
if (-not (Test-Path -LiteralPath $ProjectRoot)) { throw "ProjectRoot not found: $ProjectRoot" }
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path

$helperPath = Join-Path $PSScriptRoot 'lib\phase7c-scheduled-task-ownership.ps1'
if (-not (Test-Path -LiteralPath $helperPath)) { throw "Scheduled task ownership helper not found: $helperPath" }
. $helperPath

function Assert-Phase7CAdministrator {
  try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
      Write-Host 'PHASE7C_TASK_ADMIN=REQUIRED'
      throw 'Run this script from PowerShell Administrator.'
    }
  } catch {
    if ($_.Exception.Message -eq 'Run this script from PowerShell Administrator.') { throw }
    Write-Host 'PHASE7C_TASK_ADMIN=UNAVAILABLE'
    throw "Cannot verify Administrator context. $($_.Exception.Message)"
  }
  Write-Host 'PHASE7C_TASK_ADMIN=PASS'
}

function New-Phase7CCanonicalAction([string]$RunnerPath) {
  $arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $RunnerPath
  return New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
}

function New-Phase7CCanonicalTrigger {
  return New-ScheduledTaskTrigger -AtStartup
}

function New-Phase7CCanonicalSettings {
  return New-ScheduledTaskSettingsSet `
    -AllowDemandStart `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit ([TimeSpan]::Zero)
}

Assert-Phase7CAdministrator
Import-Module ScheduledTasks -ErrorAction Stop

$runnerPath = Get-Phase7CExecutorTaskRunnerPath -ProjectRoot $ProjectRoot
if (-not (Test-Path -LiteralPath $runnerPath)) { throw "Executor task runner not found: $runnerPath" }
Write-Host "PHASE7C_TASK_EXPECTED_RUNNER=$runnerPath"

$task = $null
try {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
} catch {
  $classification = Get-Phase7CScheduledTaskErrorClassification -Exception $_.Exception
  Write-Host "PHASE7C_TASK_PROVIDER=$classification"
  if ($classification -ne 'NOT_FOUND') {
    throw "Cannot inspect Scheduled Task '$TaskName'; mutation blocked. classification=$classification"
  }
}

if ($null -eq $task) {
  Write-Host 'PHASE7C_TASK_STATE=NOT_FOUND'
  if (-not $Create) {
    Write-Host 'PHASE7C_TASK_MUTATION=BLOCKED'
    throw "Task '$TaskName' does not exist. Re-run with -Create and explicit principal identity/logon semantics after review."
  }
  if ([string]::IsNullOrWhiteSpace($PrincipalUserId)) {
    Write-Host 'PHASE7C_TASK_PRINCIPAL=REQUIRED'
    throw '-Create requires an explicit -PrincipalUserId. No task identity is inferred.'
  }
  if ([string]::IsNullOrWhiteSpace($PrincipalLogonType)) {
    Write-Host 'PHASE7C_TASK_LOGON_TYPE=REQUIRED'
    throw '-Create requires an explicit -PrincipalLogonType (Interactive, S4U, or ServiceAccount). No logon semantics are inferred.'
  }

  $action = New-Phase7CCanonicalAction -RunnerPath $runnerPath
  $trigger = New-Phase7CCanonicalTrigger
  $settings = New-Phase7CCanonicalSettings
  $principal = New-ScheduledTaskPrincipal `
    -UserId $PrincipalUserId `
    -LogonType $PrincipalLogonType `
    -RunLevel Highest

  try {
    Register-ScheduledTask `
      -TaskName $TaskName `
      -Action $action `
      -Trigger $trigger `
      -Settings $settings `
      -Principal $principal `
      -ErrorAction Stop | Out-Null
  } catch {
    $classification = Get-Phase7CScheduledTaskErrorClassification -Exception $_.Exception
    Write-Host "PHASE7C_TASK_CREATE=$classification"
    throw "Scheduled Task creation failed. classification=$classification. $($_.Exception.Message)"
  }

  Write-Host 'PHASE7C_TASK_OWNERSHIP=OWNED'
  Write-Host 'PHASE7C_TASK_CREATE=PASS'
  Write-Host 'PHASE7C_TASK_STATUS=PASS'
  exit 0
}

$ownership = Test-Phase7CExecutorTaskActionOwnership -Actions $task.Actions -ExpectedRunnerPath $runnerPath
Write-Host "PHASE7C_TASK_OWNERSHIP=$($ownership.reason)"
if (-not $ownership.owned) {
  Write-Host 'PHASE7C_TASK_MUTATION=BLOCKED'
  throw "Task '$TaskName' ownership cannot be proven from its exact action. No mutation was attempted. reason=$($ownership.reason)"
}

$drift = @(Get-Phase7CExecutorTaskDrift -Task $task)
Write-Host "PHASE7C_TASK_DRIFT=$(if ($drift.Count -eq 0) { 'NONE' } else { $drift -join ',' })"
Write-Host "PHASE7C_TASK_PRINCIPAL_USER=$($task.Principal.UserId)"
Write-Host "PHASE7C_TASK_PRINCIPAL_RUN_LEVEL=$($task.Principal.RunLevel)"

if ($drift.Count -eq 0) {
  Write-Host 'PHASE7C_TASK_MUTATION=NOT_REQUIRED'
  Write-Host 'PHASE7C_TASK_STATUS=PASS'
  exit 0
}

if ($drift -contains 'PRINCIPAL_RUN_LEVEL') {
  Write-Host 'PHASE7C_TASK_PRINCIPAL_REPAIR=BLOCKED'
  throw 'Task principal is not RunLevel=Highest. Automatic principal replacement is intentionally blocked; review the existing identity/logon semantics first.'
}
if (-not $Repair) {
  Write-Host 'PHASE7C_TASK_MUTATION=REPAIR_REQUIRED'
  throw "Owned task has canonical-definition drift. Re-run with -Repair to repair trigger/settings while preserving the existing principal."
}

$action = New-Phase7CCanonicalAction -RunnerPath $runnerPath
$trigger = New-Phase7CCanonicalTrigger
$settings = New-Phase7CCanonicalSettings
try {
  Set-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $task.Principal `
    -ErrorAction Stop | Out-Null
} catch {
  $classification = Get-Phase7CScheduledTaskErrorClassification -Exception $_.Exception
  Write-Host "PHASE7C_TASK_REPAIR=$classification"
  throw "Scheduled Task repair failed. classification=$classification. $($_.Exception.Message)"
}

$verified = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
$verifiedOwnership = Test-Phase7CExecutorTaskActionOwnership -Actions $verified.Actions -ExpectedRunnerPath $runnerPath
$verifiedDrift = @(Get-Phase7CExecutorTaskDrift -Task $verified)
if (-not $verifiedOwnership.owned -or $verifiedDrift.Count -ne 0) {
  Write-Host 'PHASE7C_TASK_REPAIR=VERIFY_FAILED'
  throw "Scheduled Task repair did not converge to the canonical owned definition. ownership=$($verifiedOwnership.reason) drift=$($verifiedDrift -join ',')"
}

Write-Host 'PHASE7C_TASK_REPAIR=PASS'
Write-Host 'PHASE7C_TASK_STATUS=PASS'
