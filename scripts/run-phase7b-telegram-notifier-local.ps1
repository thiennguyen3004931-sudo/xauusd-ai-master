param(
  [Parameter(Mandatory = $true)] [string]$WorkDir,
  [string]$EnvFile = ".env.phase7b-telegram",
  [int]$IntervalSeconds = 2,
  [switch]$SendTest,
  [switch]$Once
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WorkDir = (Resolve-Path $WorkDir).Path
$Notifier = Join-Path $PSScriptRoot "run-phase7b-telegram-notifier.mjs"

if (-not [System.IO.Path]::IsPathRooted($EnvFile)) {
  $EnvFile = Join-Path $ProjectRoot $EnvFile
}
if (-not (Test-Path $EnvFile)) {
  throw "Telegram env file not found: $EnvFile"
}
if (-not (Test-Path $Notifier)) {
  throw "Telegram notifier not found: $Notifier"
}

$demoDir = if ((Split-Path -Leaf $WorkDir) -eq "phase7b-demo-forward") {
  $WorkDir
} else {
  Join-Path $WorkDir "phase7b-demo-forward"
}
New-Item -ItemType Directory -Path $demoDir -Force | Out-Null

$journal = Join-Path $demoDir "phase7b-demo-events.jsonl"
$runtimeRoot = Split-Path -Parent $demoDir
$sidewayDir = Join-Path $runtimeRoot "phase7c-sideway-forward"
$sidewayJournal = Join-Path $sidewayDir "phase7c-sideway-events.jsonl"
$state = Join-Path $demoDir "phase7b-telegram-state.json"
$runtime = Join-Path $demoDir "phase7b-telegram-runtime.json"
if (-not (Test-Path $journal)) {
  New-Item -ItemType File -Path $journal -Force | Out-Null
}

function Read-TelegramRuntime {
  if (-not (Test-Path $runtime)) { return $null }
  try { return Get-Content $runtime -Raw | ConvertFrom-Json } catch { return $null }
}

function Test-TelegramRuntimeAlive {
  param($Snapshot)
  if ($null -eq $Snapshot -or $Snapshot.status -ne "RUNNING" -or $null -eq $Snapshot.pid) { return $false }
  try {
    $heartbeatAge = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - [int64]$Snapshot.heartbeatAt
    if ($heartbeatAge -gt 10000) { return $false }
    Get-Process -Id ([int]$Snapshot.pid) -ErrorAction Stop | Out-Null
    return $true
  } catch { return $false }
}

function Write-TelegramRuntime {
  param(
    [Parameter(Mandatory = $true)] [string]$Status,
    [int]$NodePid = 0,
    [int]$ExitCode = 0,
    [string]$StartedAt = ""
  )
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $payload = [ordered]@{
    version = 1
    status = $Status
    pid = if ($NodePid -gt 0) { $NodePid } else { $null }
    wrapperPid = $PID
    startedAt = if ($StartedAt) { $StartedAt } else { $null }
    heartbeatAt = $now
    heartbeatAgeMs = 0
    intervalSeconds = [Math]::Max(1, $IntervalSeconds)
    sendTest = $SendTest.IsPresent
    once = $Once.IsPresent
    exitCode = if ($Status -eq "STOPPED") { $ExitCode } else { $null }
  }
  $temp = "$runtime.tmp"
  $payload | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 $temp
  Move-Item -Force $temp $runtime
}

if (-not $SendTest -and -not $Once) {
  $existingRuntime = Read-TelegramRuntime
  if (Test-TelegramRuntimeAlive $existingRuntime) {
    Write-Host "PHASE7B_TELEGRAM_NOTIFIER=ALREADY_RUNNING"
    Write-Host "PHASE7B_TELEGRAM_EXISTING_PID=$($existingRuntime.pid)"
    return
  }
}

foreach ($raw in Get-Content $EnvFile) {
  $line = $raw.Trim()
  if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { continue }
  $index = $line.IndexOf("=")
  $name = $line.Substring(0, $index).Trim().TrimStart([char]0xFEFF)
  $value = $line.Substring($index + 1).Trim().Trim('"').Trim("'")
  [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
}

if ([string]::IsNullOrWhiteSpace($env:ZIQ_TELEGRAM_BOT_TOKEN)) {
  throw "ZIQ_TELEGRAM_BOT_TOKEN is missing in $EnvFile"
}
if ([string]::IsNullOrWhiteSpace($env:ZIQ_TELEGRAM_CHAT_ID)) {
  throw "ZIQ_TELEGRAM_CHAT_ID is missing in $EnvFile"
}

$env:ZIQ_TELEGRAM_JOURNAL_PATH = $journal

if (Test-Path -LiteralPath $sidewayJournal) {
  $env:ZIQ_TELEGRAM_SIDEWAY_JOURNAL_PATH = $sidewayJournal
} else {
  Remove-Item Env:ZIQ_TELEGRAM_SIDEWAY_JOURNAL_PATH -ErrorAction SilentlyContinue
}

$env:ZIQ_TELEGRAM_STATE_PATH = $state
$env:ZIQ_TELEGRAM_INTERVAL_MS = [string]([math]::Max(1, $IntervalSeconds) * 1000)
$env:ZIQ_TELEGRAM_SEND_TEST = if ($SendTest) { "true" } else { "false" }
$env:ZIQ_TELEGRAM_ONCE = if ($Once) { "true" } else { "false" }

Write-Host "PHASE7B_TELEGRAM_ENV=$EnvFile"
Write-Host "PHASE7B_TELEGRAM_JOURNAL=$journal"
Write-Host "PHASE7B_TELEGRAM_SIDEWAY_JOURNAL=$sidewayJournal"
Write-Host "PHASE7B_TELEGRAM_SIDEWAY_JOURNAL_EXISTS=$(Test-Path -LiteralPath $sidewayJournal)"
Write-Host "PHASE7B_TELEGRAM_STATE=$state"
Write-Host "PHASE7B_TELEGRAM_RUNTIME=$runtime"
Write-Host "PHASE7B_TELEGRAM_INTERVAL_SECONDS=$IntervalSeconds"
Write-Host "PHASE7B_TELEGRAM_SEND_TEST=$($SendTest.IsPresent)"
Write-Host "PHASE7B_TELEGRAM_ORDER_PERMISSION=NONE_READ_ONLY_JOURNAL"

$nodeCommand = Get-Command node -ErrorAction Stop
$nodeExe = $nodeCommand.Source
$startedAt = [DateTimeOffset]::UtcNow.ToString("o")

Push-Location $ProjectRoot
try {
  # One-shot/test mode intentionally runs Node synchronously. On Windows
  # PowerShell 5.1, Start-Process -PassThru can report HasExited while the
  # ExitCode property remains unavailable even after WaitForExit(). Native
  # invocation gives us the reliable process exit status through LASTEXITCODE.
  if ($SendTest -or $Once) {
    Write-Host "PHASE7B_TELEGRAM_NOTIFIER=RUNNING_ONESHOT"
    & $nodeExe $Notifier
    $nativeExitCode = $LASTEXITCODE
    if ($null -eq $nativeExitCode) { $nativeExitCode = 0 }
    $nativeExitCode = [int]$nativeExitCode
    Write-TelegramRuntime -Status "STOPPED" -NodePid 0 -ExitCode $nativeExitCode -StartedAt $startedAt
    if ($nativeExitCode -ne 0) {
      throw "Phase 7B Telegram notifier one-shot exited with code $nativeExitCode"
    }
    Write-Host "PHASE7B_TELEGRAM_WRAPPER_TEST_EXIT=PASS"
    return
  }

  $nodeProcess = Start-Process -FilePath $nodeExe -ArgumentList @($Notifier) -NoNewWindow -PassThru
  Write-TelegramRuntime -Status "RUNNING" -NodePid $nodeProcess.Id -StartedAt $startedAt
  Write-Host "PHASE7B_TELEGRAM_NOTIFIER=RUNNING"
  Write-Host "PHASE7B_TELEGRAM_PID=$($nodeProcess.Id)"

  while (-not $nodeProcess.HasExited) {
    Start-Sleep -Seconds ([Math]::Max(1, $IntervalSeconds))
    $nodeProcess.Refresh()
    if (-not $nodeProcess.HasExited) {
      Write-TelegramRuntime -Status "RUNNING" -NodePid $nodeProcess.Id -StartedAt $startedAt
    }
  }

  # Persistent notifier should not normally exit. We do not depend on the
  # flaky Windows PowerShell ExitCode property here; any unexpected exit is
  # reported as a stopped notifier and the wrapper returns a clear failure.
  Write-TelegramRuntime -Status "STOPPED" -NodePid $nodeProcess.Id -ExitCode 1 -StartedAt $startedAt
  throw "Phase 7B persistent Telegram notifier stopped unexpectedly."
}
finally {
  Pop-Location
}
