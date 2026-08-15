param(
  [Parameter(Mandatory = $true)] [string]$WorkDir,
  [string]$TaskName = "XAUUSD-Phase7B-Bot",
  [string]$ControlApiUrl = "http://127.0.0.1:3711",
  [string]$EnvFile = "packages/mt5-broker/bridge/.env.phase7b-demo",
  [switch]$RequireMigratedTask
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not [System.IO.Path]::IsPathRooted($WorkDir)) { $WorkDir = Join-Path $ProjectRoot $WorkDir }
if (-not (Test-Path $WorkDir)) { throw "WorkDir not found: $WorkDir" }
$WorkDir = (Resolve-Path $WorkDir).Path
if (-not [System.IO.Path]::IsPathRooted($EnvFile)) { $EnvFile = Join-Path $ProjectRoot $EnvFile }
if (-not (Test-Path $EnvFile)) { throw "EnvFile not found: $EnvFile" }
$EnvFile = (Resolve-Path $EnvFile).Path
$RuntimeDir = Join-Path $WorkDir "phase7c-executors"

function Read-EnvValue([string]$Name) {
  foreach ($raw in Get-Content -LiteralPath $EnvFile) {
    $line = $raw.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { continue }
    $index = $line.IndexOf("=")
    $key = $line.Substring(0, $index).Trim().TrimStart([char]0xFEFF)
    if ($key -ne $Name) { continue }
    $value = $line.Substring($index + 1).Trim().Trim('"').Trim("'")
    return $value
  }
  return ""
}

function Read-PidStatus([string]$Name) {
  $path = Join-Path $RuntimeDir "$Name.pid"
  if (-not (Test-Path $path)) {
    return [pscustomobject]@{ name = $Name; pid = $null; alive = $false; pidFile = $false }
  }
  try {
    $pidValue = [int](Get-Content -LiteralPath $path -Raw).Trim()
    $alive = $null -ne (Get-Process -Id $pidValue -ErrorAction SilentlyContinue)
    return [pscustomobject]@{ name = $Name; pid = $pidValue; alive = $alive; pidFile = $true }
  } catch {
    return [pscustomobject]@{ name = $Name; pid = $null; alive = $false; pidFile = $true }
  }
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -eq $task) {
  Write-Host "PHASE7C_VERIFY_TASK=NOT_FOUND"
  if ($RequireMigratedTask) { throw "Required executor task not found: $TaskName" }
} else {
  $actions = @($task.Actions)
  $actionText = if ($actions.Count -eq 1) { "$($actions[0].Execute) $($actions[0].Arguments)" } else { "MULTIPLE_ACTIONS" }
  $migrated = $actions.Count -eq 1 -and $actionText -like "*run-phase7c-executors-local.ps1*" -and $actionText -like "*-Armed*"
  Write-Host "PHASE7C_VERIFY_TASK_STATE=$($task.State)"
  Write-Host "PHASE7C_VERIFY_TASK_MIGRATED=$migrated"
  if ($RequireMigratedTask -and -not $migrated) { throw "Scheduled task $TaskName is not migrated to Phase 7C executor supervisor." }
  if (-not $migrated -and $task.State -eq "Running") { throw "Raw/unverified legacy bot task is running. Stop it before Phase 7C execution." }
}

foreach ($name in @("supervisor", "trend", "sideway")) {
  $status = Read-PidStatus $name
  Write-Host "PHASE7C_VERIFY_$($name.ToUpper())_PID=$($status.pid)"
  Write-Host "PHASE7C_VERIFY_$($name.ToUpper())_ALIVE=$($status.alive)"
}

$apiBase = $ControlApiUrl.TrimEnd('/')
$mode = Invoke-RestMethod -Uri "$apiBase/api/v1/phase7c/bot-mode" -Method Get -TimeoutSec 5
$regime = Invoke-RestMethod -Uri "$apiBase/api/v1/phase7c/live-regime?symbol=XAUUSD&count=320" -Method Get -TimeoutSec 10
Write-Host "PHASE7C_VERIFY_ACTIVE_MODE=$($mode.state.mode)"
Write-Host "PHASE7C_VERIFY_REGIME=$($regime.regime)"
Write-Host "PHASE7C_VERIFY_RECOMMENDED_MODE=$($regime.recommendedMode)"
Write-Host "PHASE7C_VERIFY_REGIME_CONFIDENCE=$($regime.confidence)"
Write-Host "PHASE7C_VERIFY_HAS_SUPPLY_DEMAND_RANGE=$($null -ne $regime.supplyDemandRange)"

$apiKey = Read-EnvValue "MT5_API_KEY"
$bridgeHost = Read-EnvValue "MT5_BRIDGE_HOST"
$bridgePort = Read-EnvValue "MT5_BRIDGE_PORT"
if ([string]::IsNullOrWhiteSpace($apiKey)) { throw "MT5_API_KEY is missing from EnvFile." }
if ([string]::IsNullOrWhiteSpace($bridgeHost)) { $bridgeHost = "127.0.0.1" }
if ([string]::IsNullOrWhiteSpace($bridgePort)) { $bridgePort = "8765" }
$bridgeBase = "http://${bridgeHost}:${bridgePort}"
$headers = @{ "x-mt5-api-key" = $apiKey }
$health = Invoke-RestMethod -Uri "$bridgeBase/health" -Headers $headers -Method Get -TimeoutSec 5
if (-not $health.connected -or $health.status -ne "ok") { throw "MT5 bridge is not healthy/connected." }
if ($health.accountMode -ne "demo") { throw "Phase 7C verifier requires DEMO; current accountMode=$($health.accountMode)." }
$positions = @(Invoke-RestMethod -Uri "$bridgeBase/v1/positions?symbol=XAUUSD" -Headers $headers -Method Get -TimeoutSec 5)
Write-Host "PHASE7C_VERIFY_ACCOUNT_LOGIN=$($health.accountLogin)"
Write-Host "PHASE7C_VERIFY_ACCOUNT_MODE=$($health.accountMode)"
Write-Host "PHASE7C_VERIFY_TRADING_ENABLED=$($health.tradingEnabled)"
Write-Host "PHASE7C_VERIFY_XAUUSD_POSITIONS=$($positions.Count)"

$lockPath = Join-Path $RuntimeDir "phase7c-execution.lock"
Write-Host "PHASE7C_VERIFY_EXECUTION_LOCK_PRESENT=$(Test-Path $lockPath)"
Write-Host "PHASE7C_VERIFY_STATUS=PASS"
