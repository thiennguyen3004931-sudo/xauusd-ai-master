param(
  [string]$TaskName = "XAUUSD-Phase7B-Bridge",
  [ValidateRange(15, 180)] [int]$WaitSeconds = 90
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BridgeEnv = Join-Path $ProjectRoot "packages\mt5-broker\bridge\.env.phase7b-demo"

if (-not (Test-Path $BridgeEnv)) {
  throw "Phase 7B DEMO bridge env not found: $BridgeEnv"
}

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
$terminalPath = [string]$cfg["MT5_TERMINAL_PATH"]
$allowReal = [string]$cfg["MT5_ALLOW_REAL_ACCOUNT"]
$allowedLogins = @(([string]$cfg["MT5_ALLOWED_LOGINS"] -split ',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$bridgeBase = "http://${hostName}:${port}"

Write-Host "PHASE7B_BRIDGE_REPAIR=SAFE_DEMO_ONLY"
Write-Host "PHASE7B_BRIDGE_REPAIR_BOT_START=False"
Write-Host "PHASE7B_BRIDGE_REPAIR_ORDER_SEND=False"
Write-Host "PHASE7B_BRIDGE_REPAIR_ENV=$BridgeEnv"
Write-Host "PHASE7B_BRIDGE_REPAIR_BASE=$bridgeBase"

if ($allowReal -match '^(?i:true|1|yes|on)$') {
  throw "Refusing repair because MT5_ALLOW_REAL_ACCOUNT=true."
}
if ([string]::IsNullOrWhiteSpace($apiKey) -or $apiKey.Length -lt 16) {
  throw "MT5_API_KEY is missing/invalid in .env.phase7b-demo."
}
if ([string]::IsNullOrWhiteSpace($terminalPath)) {
  throw "MT5_TERMINAL_PATH is empty in .env.phase7b-demo."
}
if (-not (Test-Path $terminalPath)) {
  throw "MT5 terminal does not exist: $terminalPath"
}

Write-Host "PHASE7B_BRIDGE_REPAIR_TERMINAL=$terminalPath"
Write-Host "PHASE7B_BRIDGE_REPAIR_REAL_ACCOUNT_ALLOWED=false"

# Ensure the pinned DBG Markets terminal is running before starting the bridge.
$terminalProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -ieq "terminal64.exe" -and $_.ExecutablePath -ieq $terminalPath })

if ($terminalProcesses.Count -eq 0) {
  Write-Host "PHASE7B_BRIDGE_REPAIR_TERMINAL_ACTION=START"
  Start-Process -FilePath $terminalPath | Out-Null
  $deadline = (Get-Date).AddSeconds(20)
  do {
    Start-Sleep -Seconds 1
    $terminalProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -ieq "terminal64.exe" -and $_.ExecutablePath -ieq $terminalPath })
  } while ($terminalProcesses.Count -eq 0 -and (Get-Date) -lt $deadline)
  if ($terminalProcesses.Count -eq 0) {
    throw "DBG Markets MT5 did not start within 20 seconds."
  }
} else {
  Write-Host "PHASE7B_BRIDGE_REPAIR_TERMINAL_ACTION=ALREADY_RUNNING"
}

Write-Host "PHASE7B_BRIDGE_REPAIR_TERMINAL_PID=$($terminalProcesses[0].ProcessId)"
Start-Sleep -Seconds 3

# Stop only a recognized stale Phase7B uvicorn listener. Never kill an unknown process on the port.
$listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
foreach ($listener in $listeners) {
  $pidValue = [int]$listener.OwningProcess
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$pidValue" -ErrorAction SilentlyContinue
  $cmd = if ($null -ne $proc) { [string]$proc.CommandLine } else { "" }
  $name = if ($null -ne $proc) { [string]$proc.Name } else { "UNKNOWN" }
  Write-Host "PHASE7B_BRIDGE_REPAIR_EXISTING_LISTENER=PID:$pidValue|PROCESS:$name"
  if ($name -match '^(?i:python|python.exe)$' -and $cmd -match 'mt5_bridge\.app:app') {
    Write-Host "PHASE7B_BRIDGE_REPAIR_STALE_LISTENER_ACTION=STOP"
    Stop-Process -Id $pidValue -Force -ErrorAction Stop
  } else {
    throw "Port $port is occupied by an unrecognized process (PID $pidValue, $name). Refusing to kill it automatically."
  }
}

Start-Sleep -Seconds 2

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -eq $task) {
  throw "Scheduled Task is missing: $TaskName"
}

try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}
if ($task.State -eq "Disabled") {
  Write-Host "PHASE7B_BRIDGE_REPAIR_TASK_ACTION=ENABLE_AND_START"
  Enable-ScheduledTask -TaskName $TaskName | Out-Null
} else {
  Write-Host "PHASE7B_BRIDGE_REPAIR_TASK_ACTION=RESTART"
}
Start-ScheduledTask -TaskName $TaskName

$deadline = (Get-Date).AddSeconds($WaitSeconds)
$health = $null
$lastHealthError = $null
while ((Get-Date) -lt $deadline) {
  try {
    $probe = Invoke-RestMethod -Uri "$bridgeBase/health" -Headers @{ "x-mt5-api-key" = $apiKey } -Method Get -TimeoutSec 5
    $health = $probe
    if ($probe.connected -and $probe.status -eq "ok") { break }
  } catch {
    $lastHealthError = $_.Exception.Message
  }
  Start-Sleep -Seconds 3
}

$taskNow = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
Write-Host "PHASE7B_BRIDGE_REPAIR_TASK_STATE=$($taskNow.State)"
if ($null -ne $taskInfo) {
  Write-Host "PHASE7B_BRIDGE_REPAIR_TASK_LAST_RESULT=$($taskInfo.LastTaskResult)"
}

if ($null -eq $health) {
  Write-Host "PHASE7B_BRIDGE_REPAIR_HEALTH=NO_RESPONSE"
  Write-Host "PHASE7B_BRIDGE_REPAIR_HEALTH_ERROR=$(if ($lastHealthError) { $lastHealthError } else { 'UNKNOWN' })"
  throw "Phase 7B bridge did not return /health within $WaitSeconds seconds."
}

Write-Host "PHASE7B_BRIDGE_REPAIR_STATUS=$($health.status)"
Write-Host "PHASE7B_BRIDGE_REPAIR_CONNECTED=$($health.connected)"
Write-Host "PHASE7B_BRIDGE_REPAIR_ACCOUNT_LOGIN=$(if ($null -ne $health.accountLogin) { $health.accountLogin } else { 'UNKNOWN' })"
Write-Host "PHASE7B_BRIDGE_REPAIR_ACCOUNT_MODE=$(if ($health.accountMode) { $health.accountMode } else { 'UNKNOWN' })"
Write-Host "PHASE7B_BRIDGE_REPAIR_SERVER=$(if ($health.server) { $health.server } else { 'UNKNOWN' })"
Write-Host "PHASE7B_BRIDGE_REPAIR_LAST_ERROR=$(if ($health.lastError) { $health.lastError } else { 'NONE' })"
Write-Host "PHASE7B_BRIDGE_REPAIR_TERMINAL_TRADE_ALLOWED=$($health.terminalTradeAllowed)"
Write-Host "PHASE7B_BRIDGE_REPAIR_EXPERT_TRADE_ALLOWED=$($health.expertTradeAllowed)"

if (-not $health.connected -or $health.status -ne "ok") {
  throw "MT5 is running but bridge is still degraded. Check that DBG Markets MT5 is logged in and connected to the broker server."
}
if ($health.accountMode -ne "demo") {
  try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}
  throw "Connected account is not DEMO (accountMode=$($health.accountMode)). Bridge task was stopped."
}
if ($allowedLogins.Count -gt 0 -and -not ($allowedLogins -contains [string]$health.accountLogin)) {
  try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue } catch {}
  throw "Connected DEMO login $($health.accountLogin) is not in MT5_ALLOWED_LOGINS. Bridge task was stopped."
}

Write-Host "PHASE7B_BRIDGE_REPAIR_RESULT=HEALTHY_DEMO"
Write-Host "PHASE7B_BRIDGE_REPAIR_SHADOW_READY=YES"
Write-Host "PHASE7B_BRIDGE_REPAIR_BOT_START=False"
Write-Host "PHASE7B_BRIDGE_REPAIR_ORDER_SEND=False"
