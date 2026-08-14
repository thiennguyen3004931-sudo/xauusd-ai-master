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

if (-not $SendTest -and -not $Once) {
  try {
    $existing = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -like '*run-phase7b-telegram-notifier.mjs*' } |
      Select-Object -First 1
    if ($null -ne $existing) {
      Write-Host "PHASE7B_TELEGRAM_NOTIFIER=ALREADY_RUNNING"
      Write-Host "PHASE7B_TELEGRAM_EXISTING_PID=$($existing.ProcessId)"
      exit 0
    }
  } catch {}
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

$demoDir = if ((Split-Path -Leaf $WorkDir) -eq "phase7b-demo-forward") {
  $WorkDir
} else {
  Join-Path $WorkDir "phase7b-demo-forward"
}
New-Item -ItemType Directory -Path $demoDir -Force | Out-Null

$journal = Join-Path $demoDir "phase7b-demo-events.jsonl"
$state = Join-Path $demoDir "phase7b-telegram-state.json"
if (-not (Test-Path $journal)) {
  New-Item -ItemType File -Path $journal -Force | Out-Null
}

$env:ZIQ_TELEGRAM_JOURNAL_PATH = $journal
$env:ZIQ_TELEGRAM_STATE_PATH = $state
$env:ZIQ_TELEGRAM_INTERVAL_MS = [string]([math]::Max(1, $IntervalSeconds) * 1000)
$env:ZIQ_TELEGRAM_SEND_TEST = if ($SendTest) { "true" } else { "false" }
$env:ZIQ_TELEGRAM_ONCE = if ($Once) { "true" } else { "false" }

Write-Host "PHASE7B_TELEGRAM_ENV=$EnvFile"
Write-Host "PHASE7B_TELEGRAM_JOURNAL=$journal"
Write-Host "PHASE7B_TELEGRAM_STATE=$state"
Write-Host "PHASE7B_TELEGRAM_INTERVAL_SECONDS=$IntervalSeconds"
Write-Host "PHASE7B_TELEGRAM_SEND_TEST=$($SendTest.IsPresent)"
Write-Host "PHASE7B_TELEGRAM_ORDER_PERMISSION=NONE_READ_ONLY_JOURNAL"

Push-Location $ProjectRoot
try {
  & node $Notifier
  if ($LASTEXITCODE -ne 0) {
    throw "Phase 7B Telegram notifier exited with code $LASTEXITCODE"
  }
}
finally {
  Pop-Location
}
