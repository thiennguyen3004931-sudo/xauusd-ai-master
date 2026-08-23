$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$GuardLibrary = Join-Path $PSScriptRoot "lib\phase7c-startup-runner-guard.ps1"
$Runner = Join-Path $PSScriptRoot "run-phase7c-executor-task-runner-local.ps1"

if (-not (Test-Path -LiteralPath $GuardLibrary)) { throw "Missing startup runner guard: $GuardLibrary" }
if (-not (Test-Path -LiteralPath $Runner)) { throw "Missing startup runner: $Runner" }
. $GuardLibrary

function Assert-True([bool]$Value, [string]$Message) {
  if (-not $Value) { throw "ASSERT_TRUE failed: $Message" }
}

function Assert-Equal($Actual, $Expected, [string]$Message) {
  if ($Actual -ne $Expected) {
    throw "ASSERT_EQUAL failed: $Message. Expected=$Expected Actual=$Actual"
  }
}

function Assert-PowerShellSyntax([string]$Path) {
  $tokens = $null
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile(
    $Path,
    [ref]$tokens,
    [ref]$errors
  )
  if (@($errors).Count -gt 0) {
    $messages = @($errors | ForEach-Object { $_.Message }) -join " | "
    throw "PowerShell syntax errors in ${Path}: $messages"
  }
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("phase7c-runner-guard-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

$firstLock = $null
$thirdLock = $null
try {
  $lockPath = Join-Path $tempRoot "startup-runner.lock"
  $firstLock = Open-Phase7CStartupRunnerLock -Path $lockPath
  Assert-True ($null -ne $firstLock) "first startup runner must acquire the exclusive lock"

  $duplicateBlocked = $false
  try {
    $unexpectedLock = Open-Phase7CStartupRunnerLock -Path $lockPath
    if ($null -ne $unexpectedLock) { $unexpectedLock.Dispose() }
  } catch {
    $duplicateBlocked = $_.Exception.Message -like "*already owns the exclusive lock*"
  }
  Assert-True $duplicateBlocked "a second startup runner must fail closed while the lock is held"

  $firstLock.Dispose()
  $firstLock = $null

  $thirdLock = Open-Phase7CStartupRunnerLock -Path $lockPath
  Assert-True ($null -ne $thirdLock) "lock must be reusable after the owning runner exits"
  $thirdLock.Dispose()
  $thirdLock = $null

  $jsonPath = Join-Path $tempRoot "startup-runner-status.json"
  Write-Phase7CJsonAtomic -Path $jsonPath -Value ([pscustomobject]@{ version = 1; status = "FIRST"; runnerPid = 111 }) -Depth 4
  $firstJson = Get-Content -LiteralPath $jsonPath -Raw | ConvertFrom-Json
  Assert-Equal ([string]$firstJson.status) "FIRST" "first atomic status write must remain parseable"

  Write-Phase7CJsonAtomic -Path $jsonPath -Value ([pscustomobject]@{ version = 1; status = "SECOND"; runnerPid = 222 }) -Depth 4
  $secondJson = Get-Content -LiteralPath $jsonPath -Raw | ConvertFrom-Json
  Assert-Equal ([string]$secondJson.status) "SECOND" "replacement atomic status write must remain parseable"
  Assert-Equal ([int]$secondJson.runnerPid) 222 "replacement atomic status must contain the new payload"

  $leftoverTemps = @(Get-ChildItem -LiteralPath $tempRoot -Filter "*.tmp" -File -ErrorAction SilentlyContinue)
  Assert-Equal $leftoverTemps.Count 0 "atomic status writes must not leave temp files behind"

  Assert-PowerShellSyntax $GuardLibrary
  Assert-PowerShellSyntax $Runner

  $runnerText = Get-Content -LiteralPath $Runner -Raw
  Assert-True ($runnerText -match 'phase7c-startup-runner-guard\.ps1') "runner must load the singleton guard library"
  Assert-True ($runnerText -match 'Open-Phase7CStartupRunnerLock') "runner must acquire an exclusive lock before launching supervisor"
  Assert-True ($runnerText -match 'Write-Phase7CJsonAtomic') "runner status writes must use atomic replacement"
  Assert-True ($runnerText -match 'PHASE7C_EXECUTOR_TASK_RUNNER_LOCK=BLOCKED') "duplicate runner attempts must be observable"
  Assert-True ($runnerText -match '\$runnerLock\.Dispose\(\)') "runner must release its lock on graceful exit"

  Write-Host "PHASE7C_STARTUP_RUNNER_GUARD_TEST=PASS"
} finally {
  if ($null -ne $firstLock) { $firstLock.Dispose() }
  if ($null -ne $thirdLock) { $thirdLock.Dispose() }
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
