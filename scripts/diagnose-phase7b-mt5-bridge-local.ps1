param(
  [string]$BridgeEnv = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($BridgeEnv)) {
  $BridgeEnv = Join-Path $ProjectRoot "packages\mt5-broker\bridge\.env.phase7b-demo"
}
if (-not (Test-Path $BridgeEnv)) { throw "Phase 7B bridge env not found: $BridgeEnv" }
$BridgeEnv = (Resolve-Path $BridgeEnv).Path

function Read-EnvMap([string]$Path) {
  $map = @{}
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
    $parts = $line -split "=", 2
    $name = $parts[0].Trim().TrimStart([char]0xFEFF)
    $value = $parts[1].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $map[$name] = $value
  }
  return $map
}

$cfg = Read-EnvMap $BridgeEnv
$apiKey = [string]$cfg["MT5_API_KEY"]
$hostName = if ([string]::IsNullOrWhiteSpace([string]$cfg["MT5_BRIDGE_HOST"])) { "127.0.0.1" } else { [string]$cfg["MT5_BRIDGE_HOST"] }
$port = if ([string]::IsNullOrWhiteSpace([string]$cfg["MT5_BRIDGE_PORT"])) { 8765 } else { [int]$cfg["MT5_BRIDGE_PORT"] }
$bridgeBase = "http://${hostName}:${port}"
$terminalPath = [string]$cfg["MT5_TERMINAL_PATH"]
$allowedLogins = [string]$cfg["MT5_ALLOWED_LOGINS"]
$bridgeTaskName = "XAUUSD-Phase7B-Bridge"

Write-Host "PHASE7B_BRIDGE_DIAG=READ_ONLY"
Write-Host "PHASE7B_BRIDGE_DIAG_ENV=$BridgeEnv"
Write-Host "PHASE7B_BRIDGE_DIAG_BASE=$bridgeBase"
Write-Host "PHASE7B_BRIDGE_DIAG_API_KEY_CONFIGURED=$(if (-not [string]::IsNullOrWhiteSpace($apiKey) -and $apiKey.Length -ge 16) { 'YES' } else { 'NO' })"
Write-Host "PHASE7B_BRIDGE_DIAG_REAL_ACCOUNT_ALLOWED=$([string]$cfg['MT5_ALLOW_REAL_ACCOUNT'])"
Write-Host "PHASE7B_BRIDGE_DIAG_TRADING_ENABLED=$([string]$cfg['MT5_TRADING_ENABLED'])"
Write-Host "PHASE7B_BRIDGE_DIAG_ALLOWED_LOGINS_CONFIGURED=$(if ([string]::IsNullOrWhiteSpace($allowedLogins)) { 'NO' } else { 'YES' })"
Write-Host "PHASE7B_BRIDGE_DIAG_TERMINAL_PATH=$(if ([string]::IsNullOrWhiteSpace($terminalPath)) { 'AUTO' } else { $terminalPath })"
Write-Host "PHASE7B_BRIDGE_DIAG_TERMINAL_PATH_EXISTS=$(if ([string]::IsNullOrWhiteSpace($terminalPath)) { 'AUTO' } elseif (Test-Path $terminalPath) { 'YES' } else { 'NO' })"

$task = Get-ScheduledTask -TaskName $bridgeTaskName -ErrorAction SilentlyContinue
if ($null -eq $task) {
  Write-Host "PHASE7B_BRIDGE_DIAG_TASK=MISSING"
} else {
  Write-Host "PHASE7B_BRIDGE_DIAG_TASK=FOUND"
  Write-Host "PHASE7B_BRIDGE_DIAG_TASK_STATE=$($task.State)"
  try {
    $taskInfo = Get-ScheduledTaskInfo -TaskName $bridgeTaskName -ErrorAction Stop
    Write-Host "PHASE7B_BRIDGE_DIAG_TASK_LAST_RUN=$($taskInfo.LastRunTime)"
    Write-Host "PHASE7B_BRIDGE_DIAG_TASK_LAST_RESULT=$($taskInfo.LastTaskResult)"
  } catch {}
}

$terminalProcesses = @(Get-CimInstance Win32_Process -Filter "Name='terminal64.exe'" -ErrorAction SilentlyContinue)
Write-Host "PHASE7B_BRIDGE_DIAG_TERMINAL_PROCESS_COUNT=$($terminalProcesses.Count)"
foreach ($proc in $terminalProcesses) {
  Write-Host "PHASE7B_BRIDGE_DIAG_TERMINAL_PROCESS=PID:$($proc.ProcessId)|PATH:$($proc.ExecutablePath)"
}

$listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
Write-Host "PHASE7B_BRIDGE_DIAG_PORT_LISTENER_COUNT=$($listeners.Count)"
foreach ($listener in $listeners) {
  $owner = $listener.OwningProcess
  $ownerProc = Get-Process -Id $owner -ErrorAction SilentlyContinue
  Write-Host "PHASE7B_BRIDGE_DIAG_LISTENER=PID:$owner|PROCESS:$($ownerProc.ProcessName)"
}

if ([string]::IsNullOrWhiteSpace($apiKey) -or $apiKey.Length -lt 16) {
  Write-Host "PHASE7B_BRIDGE_DIAG_HEALTH=SKIPPED_INVALID_API_KEY"
  exit 2
}

try {
  $health = Invoke-RestMethod -Uri "$bridgeBase/health" -Headers @{ "x-mt5-api-key" = $apiKey } -Method Get -TimeoutSec 8
} catch {
  Write-Host "PHASE7B_BRIDGE_DIAG_HEALTH=HTTP_UNAVAILABLE"
  Write-Host "PHASE7B_BRIDGE_DIAG_HTTP_ERROR=$($_.Exception.Message)"
  Write-Host "PHASE7B_BRIDGE_DIAG_CLASSIFICATION=BRIDGE_HTTP_NOT_RUNNING"
  exit 3
}

Write-Host "PHASE7B_BRIDGE_DIAG_HEALTH=RESPONDED"
Write-Host "PHASE7B_BRIDGE_DIAG_STATUS=$($health.status)"
Write-Host "PHASE7B_BRIDGE_DIAG_CONNECTED=$($health.connected)"
Write-Host "PHASE7B_BRIDGE_DIAG_ACCOUNT_LOGIN=$(if ($null -eq $health.accountLogin) { 'UNKNOWN' } else { $health.accountLogin })"
Write-Host "PHASE7B_BRIDGE_DIAG_ACCOUNT_MODE=$(if ($null -eq $health.accountMode) { 'UNKNOWN' } else { $health.accountMode })"
Write-Host "PHASE7B_BRIDGE_DIAG_SERVER=$(if ($null -eq $health.server) { 'UNKNOWN' } else { $health.server })"
Write-Host "PHASE7B_BRIDGE_DIAG_TERMINAL_VERSION=$(if ($null -eq $health.terminalVersion) { 'UNKNOWN' } else { $health.terminalVersion })"
Write-Host "PHASE7B_BRIDGE_DIAG_LAST_ERROR=$(if ([string]::IsNullOrWhiteSpace([string]$health.lastError)) { 'NONE' } else { [string]$health.lastError })"
Write-Host "PHASE7B_BRIDGE_DIAG_TERMINAL_TRADE_ALLOWED=$($health.terminalTradeAllowed)"
Write-Host "PHASE7B_BRIDGE_DIAG_EXPERT_TRADE_ALLOWED=$($health.expertTradeAllowed)"
Write-Host "PHASE7B_BRIDGE_DIAG_BRIDGE_TRADING_ENABLED=$($health.tradingEnabled)"

if (-not $health.connected -or $health.status -ne "ok") {
  if ($terminalProcesses.Count -eq 0) {
    Write-Host "PHASE7B_BRIDGE_DIAG_CLASSIFICATION=MT5_TERMINAL_NOT_RUNNING"
  } elseif (-not [string]::IsNullOrWhiteSpace($terminalPath) -and -not (Test-Path $terminalPath)) {
    Write-Host "PHASE7B_BRIDGE_DIAG_CLASSIFICATION=MT5_TERMINAL_PATH_INVALID"
  } elseif (-not [string]::IsNullOrWhiteSpace([string]$health.lastError)) {
    Write-Host "PHASE7B_BRIDGE_DIAG_CLASSIFICATION=MT5_INITIALIZE_OR_SESSION_ERROR"
  } else {
    Write-Host "PHASE7B_BRIDGE_DIAG_CLASSIFICATION=MT5_SESSION_NOT_CONNECTED"
  }
  exit 4
}

if ($health.accountMode -ne "demo") {
  Write-Host "PHASE7B_BRIDGE_DIAG_CLASSIFICATION=NON_DEMO_ACCOUNT_BLOCKED"
  exit 5
}

Write-Host "PHASE7B_BRIDGE_DIAG_CLASSIFICATION=HEALTHY_DEMO"
Write-Host "PHASE7B_BRIDGE_DIAG_RESULT=PASS"
exit 0
