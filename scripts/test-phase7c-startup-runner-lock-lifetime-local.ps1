$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$GuardLibrary = Join-Path $PSScriptRoot 'lib\phase7c-startup-runner-guard.ps1'
$OwnershipLibrary = Join-Path $PSScriptRoot 'lib\phase7c-scheduled-task-ownership.ps1'
$RunnerScript = Join-Path $PSScriptRoot 'run-phase7c-executor-task-runner-local.ps1'

foreach ($required in @($GuardLibrary, $OwnershipLibrary, $RunnerScript)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Required production source missing: $required"
  }
}

. $OwnershipLibrary

function Assert-Equal($Actual, $Expected, [string]$Message) {
  if ($Actual -ne $Expected) {
    throw "$Message actual=$Actual expected=$Expected"
  }
}

# The persistent lifecycle-broker owns the FileStream for its full process lifetime.
# An ordinary PowerShell variable is not a sufficient managed-liveness guarantee when
# the stream is otherwise unused for long periods. Require the canonical .NET lifetime
# primitive at the owner call site rather than weakening the external lock verifier.
$runnerSource = Get-Content -LiteralPath $RunnerScript -Raw
if ($runnerSource -notmatch '\[GC\]::KeepAlive\(\$runnerLock\)') {
  throw 'Persistent lifecycle broker must explicitly keep startup-runner lock alive with [GC]::KeepAlive($runnerLock).'
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("phase7c-lock-lifetime-{0}" -f [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
$lockPath = Join-Path $tempRoot 'startup-runner.lock'
$readyPath = Join-Path $tempRoot 'ready.txt'
$childScript = Join-Path $tempRoot 'lock-owner.ps1'

$childSource = @'
param(
  [Parameter(Mandatory = $true)] [string]$GuardLibrary,
  [Parameter(Mandatory = $true)] [string]$LockPath,
  [Parameter(Mandatory = $true)] [string]$ReadyPath
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. $GuardLibrary

$runnerLock = $null
try {
  $runnerLock = Open-Phase7CStartupRunnerLock -Path $LockPath
  [System.IO.File]::WriteAllText($ReadyPath, [string]$PID)

  # Mirror the persistent broker ownership pattern while deliberately stressing GC.
  # KeepAlive is intentionally at the end of each ownership interval.
  for ($i = 0; $i -lt 80; $i++) {
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
    Start-Sleep -Milliseconds 100
    [GC]::KeepAlive($runnerLock)
  }
} finally {
  [GC]::KeepAlive($runnerLock)
  if ($null -ne $runnerLock) { $runnerLock.Dispose() }
}
'@
[System.IO.File]::WriteAllText($childScript, $childSource, [System.Text.UTF8Encoding]::new($false))

$hostExecutable = (Get-Process -Id $PID -ErrorAction Stop).Path
$child = $null
try {
  $arguments = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', ('"{0}"' -f $childScript),
    '-GuardLibrary', ('"{0}"' -f $GuardLibrary),
    '-LockPath', ('"{0}"' -f $lockPath),
    '-ReadyPath', ('"{0}"' -f $readyPath)
  )
  $child = Start-Process -FilePath $hostExecutable -ArgumentList $arguments -PassThru -WindowStyle Hidden

  $readyDeadline = [DateTime]::UtcNow.AddSeconds(10)
  while (-not (Test-Path -LiteralPath $readyPath)) {
    if ($child.HasExited) {
      throw "Lock-owner child exited before acquiring lock. ExitCode=$($child.ExitCode)"
    }
    if ([DateTime]::UtcNow -ge $readyDeadline) {
      throw 'Timed out waiting for lock-owner child readiness.'
    }
    Start-Sleep -Milliseconds 50
    $child.Refresh()
  }

  $ownerPid = [int](Get-Content -LiteralPath $readyPath -Raw)
  Assert-Equal $ownerPid $child.Id 'ready marker must identify the live lock-owner child'

  $samples = 0
  while (-not $child.HasExited) {
    $state = Get-Phase7CStartupRunnerLockState -LockPath $lockPath
    Assert-Equal $state 'HELD' "exclusive startup-runner lock escaped while owner process remained alive; sample=$samples ownerPid=$ownerPid"
    $samples++
    Start-Sleep -Milliseconds 50
    $child.Refresh()
  }

  if ($child.ExitCode -ne 0) {
    throw "Lock-owner child failed. ExitCode=$($child.ExitCode)"
  }
  if ($samples -lt 20) {
    throw "Lock lifetime test did not observe enough live-owner samples. samples=$samples"
  }

  $releasedState = Get-Phase7CStartupRunnerLockState -LockPath $lockPath
  Assert-Equal $releasedState 'RELEASED' 'startup-runner lock must become released only after owner exits'

  Write-Host "PHASE7C_STARTUP_RUNNER_LOCK_LIFETIME_TEST=PASS"
  Write-Host "OWNER_PID=$ownerPid"
  Write-Host "HELD_SAMPLES=$samples"
  Write-Host "POST_EXIT_LOCK_STATE=$releasedState"
} finally {
  if ($null -ne $child -and -not $child.HasExited) {
    try { $child.Kill() } catch { }
    try { $child.WaitForExit(5000) | Out-Null } catch { }
  }
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
