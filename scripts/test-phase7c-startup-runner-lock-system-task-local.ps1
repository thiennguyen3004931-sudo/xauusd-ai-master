$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$GuardLibrary = Join-Path $PSScriptRoot 'lib\phase7c-startup-runner-guard.ps1'
$OwnershipLibrary = Join-Path $PSScriptRoot 'lib\phase7c-scheduled-task-ownership.ps1'
$RuntimeOwnershipLibrary = Join-Path $PSScriptRoot 'lib\phase7c-runtime-ownership-probe.ps1'
foreach ($required in @($GuardLibrary, $OwnershipLibrary, $RuntimeOwnershipLibrary)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Required production source missing: $required"
  }
}
. $OwnershipLibrary
. $RuntimeOwnershipLibrary

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'SYSTEM Scheduled Task lock test requires Administrator on the CI host.'
}

Import-Module ScheduledTasks -ErrorAction Stop
$taskName = "Phase7C-CI-Lock-$([Guid]::NewGuid().ToString('N'))"
$tempRoot = Join-Path $env:ProgramData ("phase7c-lock-system-task-{0}" -f [Guid]::NewGuid().ToString('N'))
$runtimeDir = Join-Path $tempRoot 'phase7c-executors'
$brokerStateDir = Join-Path $tempRoot 'phase7c-lifecycle-broker\state'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
New-Item -ItemType Directory -Force -Path $brokerStateDir | Out-Null
$lockPath = Join-Path $runtimeDir 'startup-runner.lock'
$readyPath = Join-Path $tempRoot 'ready.txt'
$childScript = Join-Path $tempRoot 'system-task-owner.ps1'
$statusPath = Join-Path $brokerStateDir 'status.json'
$heartbeatPath = Join-Path $brokerStateDir 'heartbeat.json'
$powerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

$childSource = @'
param(
  [Parameter(Mandatory = $true)] [string]$GuardLibrary,
  [Parameter(Mandatory = $true)] [string]$LockPath,
  [Parameter(Mandatory = $true)] [string]$ReadyPath,
  [Parameter(Mandatory = $true)] [string]$StatusPath,
  [Parameter(Mandatory = $true)] [string]$HeartbeatPath
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. $GuardLibrary

$runnerLock = $null
try {
  $runnerLock = Open-Phase7CStartupRunnerLock -Path $LockPath
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  [System.IO.File]::WriteAllText($ReadyPath, "$PID|$($identity.Name)")

  while ($true) {
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    [System.IO.File]::WriteAllText($StatusPath, (@{ version = 1; brokerPid = $PID; state = 'RUNNING'; updatedAt = $now } | ConvertTo-Json -Compress))
    [System.IO.File]::WriteAllText($HeartbeatPath, (@{ version = 1; brokerPid = $PID; updatedAt = $now } | ConvertTo-Json -Compress))
    $pressure = New-Object byte[] 262144
    $pressure[0] = 1
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
    Start-Sleep -Milliseconds 25
  }
} finally {
  if ($null -ne $runnerLock) { $runnerLock.Dispose() }
}
'@
[System.IO.File]::WriteAllText($childScript, $childSource, [System.Text.UTF8Encoding]::new($false))

$registered = $false
try {
  $arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -GuardLibrary "{1}" -LockPath "{2}" -ReadyPath "{3}" -StatusPath "{4}" -HeartbeatPath "{5}"' -f $childScript, $GuardLibrary, $lockPath, $readyPath, $statusPath, $heartbeatPath
  $action = New-ScheduledTaskAction -Execute $powerShellExe -Argument $arguments
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
  $taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $taskPrincipal -ErrorAction Stop | Out-Null
  $registered = $true
  Start-ScheduledTask -TaskName $taskName -ErrorAction Stop

  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  while (-not (Test-Path -LiteralPath $readyPath)) {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
    if ([string]$task.State -eq 'Ready') {
      $info = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction Stop
      if ([int]$info.LastTaskResult -ne 267009 -and [int]$info.LastTaskResult -ne 0) {
        throw "SYSTEM task returned before readiness. LastTaskResult=$($info.LastTaskResult)"
      }
    }
    if ([DateTime]::UtcNow -ge $deadline) {
      throw 'Timed out waiting for SYSTEM lock-owner readiness.'
    }
    Start-Sleep -Milliseconds 50
  }

  $ready = ([string](Get-Content -LiteralPath $readyPath -Raw)).Trim()
  $parts = @($ready -split '\|', 2)
  if ($parts.Count -ne 2) { throw "Invalid SYSTEM task readiness marker: $ready" }
  $ownerPid = [int]$parts[0]
  $ownerName = [string]$parts[1]
  if ($ownerPid -le 0 -or $null -eq (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue)) {
    throw "SYSTEM task owner PID is not alive. PID=$ownerPid"
  }
  if ($ownerName -notin @('NT AUTHORITY\SYSTEM', 'SYSTEM')) {
    throw "Scheduled Task child did not run as SYSTEM. owner=$ownerName"
  }

  $samples = 0
  for ($i = 0; $i -lt 100; $i++) {
    if ($null -eq (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue)) {
      throw "SYSTEM lock-owner exited unexpectedly. sample=$i PID=$ownerPid"
    }
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
    if ([string]$task.State -ne 'Running') {
      throw "SYSTEM Scheduled Task stopped while lock lifetime was under observation. sample=$i state=$($task.State)"
    }
    $state = Get-Phase7CStartupRunnerLockState -LockPath $lockPath
    if ($state -ne 'HELD') {
      throw "SYSTEM Scheduled Task persistent owner lost exclusive startup-runner lock. sample=$i ownerPid=$ownerPid state=$state"
    }
    $samples++
    Start-Sleep -Milliseconds 25
  }

  # RED regression: remove inherited observer visibility from the executor runtime
  # while keeping SYSTEM ownership intact. Broker state remains readable so the
  # ownership snapshot must not silently classify the held lock as MISSING.
  $acl = New-Object System.Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  $inherit = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  $propagation = [System.Security.AccessControl.PropagationFlags]::None
  $allow = [System.Security.AccessControl.AccessControlType]::Allow
  $systemSid = New-Object System.Security.Principal.SecurityIdentifier([System.Security.Principal.WellKnownSidType]::LocalSystemSid, $null)
  $systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule($systemSid, [System.Security.AccessControl.FileSystemRights]::FullControl, $inherit, $propagation, $allow)
  [void]$acl.AddAccessRule($systemRule)
  Set-Acl -LiteralPath $runtimeDir -AclObject $acl

  $snapshotDeadline = [DateTime]::UtcNow.AddSeconds(5)
  do {
    $snapshot = Get-Phase7CRuntimeGenerationSnapshot -WorkDir $tempRoot -HeartbeatMaxAgeMs 5000
    if ($snapshot.brokerProcessAlive -and $snapshot.brokerHeartbeatFresh -and $snapshot.brokerStatusPidMatch) { break }
    Start-Sleep -Milliseconds 50
  } while ([DateTime]::UtcNow -lt $snapshotDeadline)

  if (-not $snapshot.brokerProcessAlive) { throw 'RED setup failed: broker process is not alive.' }
  if (-not $snapshot.brokerHeartbeatFresh) { throw 'RED setup failed: broker heartbeat is not fresh.' }
  if (-not $snapshot.brokerStatusPidMatch) { throw 'RED setup failed: broker status PID does not match heartbeat PID.' }
  if ($snapshot.startupRunnerLockState -eq 'MISSING') {
    throw "RED reproduced: held SYSTEM startup lock was classified MISSING under observer ACL restriction. exactGate=$($snapshot.exactGenerationMismatchGate)"
  }

  Write-Host 'PHASE7C_STARTUP_RUNNER_LOCK_SYSTEM_TASK_TEST=PASS'
  Write-Host "SYSTEM_OWNER_PID=$ownerPid"
  Write-Host "SYSTEM_OWNER_NAME=$ownerName"
  Write-Host "HELD_SAMPLES=$samples"
  Write-Host "SYSTEM_TASK_LOCK_STATE=$($snapshot.startupRunnerLockState)"
} finally {
  # Restore inherited administrator access before cleanup.
  try {
    $acl = Get-Acl -LiteralPath $runtimeDir -ErrorAction SilentlyContinue
    if ($null -ne $acl) {
      $acl.SetAccessRuleProtection($false, $true)
      Set-Acl -LiteralPath $runtimeDir -AclObject $acl -ErrorAction SilentlyContinue
    }
  } catch { }
  if ($registered) {
    try { Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue } catch { }
    $deadline = [DateTime]::UtcNow.AddSeconds(8)
    while ((Get-Phase7CStartupRunnerLockState -LockPath $lockPath) -eq 'HELD' -and [DateTime]::UtcNow -lt $deadline) {
      Start-Sleep -Milliseconds 100
    }
    try { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue } catch { }
  }
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
