param(
  [string]$WorkDir = '.runtime',
  [int]$ApiPort = 3711
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AccountLibrary = Join-Path $PSScriptRoot 'lib\phase7c-account-mode.ps1'
$ExecutorConfigPath = Join-Path $ProjectRoot '.runtime\phase7c-executor-task-config.json'

foreach ($required in @($AccountLibrary, $ExecutorConfigPath)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Stopped-lifecycle safety snapshot required file is missing: $required"
  }
}
. $AccountLibrary

if ($ApiPort -lt 1024 -or $ApiPort -gt 65535) { throw 'ApiPort is invalid.' }

function Read-JsonFile([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "$Label is missing: $Path" }
  try { return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json }
  catch { throw "$Label is invalid JSON: $Path. $($_.Exception.Message)" }
}

function Resolve-ProjectPath([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { throw 'Path value is required.' }
  if ([System.IO.Path]::IsPathRooted($Value)) { return [System.IO.Path]::GetFullPath($Value) }
  return [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot $Value))
}

function Invoke-ControlGet([string]$Path) {
  return Invoke-RestMethod -Uri "$ControlApiUrl$Path" -Method Get -TimeoutSec 8
}

function Invoke-BridgeGet([string]$Path) {
  return Invoke-RestMethod -Uri "$BridgeBase$Path" -Headers $BridgeHeaders -Method Get -TimeoutSec 8
}

function Read-BridgeArray([string]$Path) {
  $response = Invoke-WebRequest -Uri "$BridgeBase$Path" -Headers $BridgeHeaders -Method Get -UseBasicParsing -TimeoutSec 8
  $raw = ([string]$response.Content).Trim()
  if ([string]::IsNullOrWhiteSpace($raw) -or $raw -eq '[]') { return @() }
  return @($raw | ConvertFrom-Json | Where-Object { $null -ne $_ })
}

function Assert-LifecycleStopped($State) {
  if ($null -eq $State) { throw 'Lifecycle state is missing.' }
  if ([bool]$State.running) { throw 'Safety snapshot requires LIFECYCLE_RUNNING=false.' }
  if ([bool]$State.ready) { throw 'Safety snapshot requires LIFECYCLE_READY=false.' }
  if ($null -eq $State.processes) { throw 'Lifecycle process status is unavailable.' }

  $alive = @()
  foreach ($property in @($State.processes.PSObject.Properties)) {
    if ($null -ne $property.Value -and [bool]$property.Value.alive) { $alive += [string]$property.Name }
  }
  if ($alive.Count -ne 0) {
    throw "Safety snapshot requires zero alive lifecycle processes. alive=$($alive -join ',')"
  }
}

function Get-SingleBridgeListenerPid([int]$Port) {
  $listeners = @(
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Where-Object { [string]$_.LocalAddress -in @('127.0.0.1','::1','0.0.0.0','::') }
  )
  if ($listeners.Count -ne 1) { throw "Safety snapshot requires exactly one Bridge listener on port $Port. current=$($listeners.Count)" }
  return [int]$listeners[0].OwningProcess
}

$executorConfig = Read-JsonFile -Path $ExecutorConfigPath -Label 'Executor task config'
if ([int]$executorConfig.version -ne 2) { throw 'Executor task config version 2 is required.' }
$resolvedWorkDir = Resolve-ProjectPath $WorkDir
$configuredWorkDir = Resolve-ProjectPath ([string]$executorConfig.workDir)
if ($resolvedWorkDir -ne $configuredWorkDir) {
  throw "WorkDir must match canonical runtime root. requested=$resolvedWorkDir configured=$configuredWorkDir"
}
$ControlApiUrl = ([string]$executorConfig.controlApiUrl).TrimEnd('/')
if ($ControlApiUrl -ne "http://127.0.0.1:$ApiPort") {
  throw "Control API URL/ApiPort mismatch. configured=$ControlApiUrl expected=http://127.0.0.1:$ApiPort"
}

$accountStatePath = Join-Path $resolvedWorkDir 'phase7c-account-mode.json'
$accountState = Read-JsonFile -Path $accountStatePath -Label 'Canonical account-mode state'
if ([int]$accountState.version -ne 1 -or (ConvertTo-Phase7CAccountMode ([string]$accountState.accountMode)) -ne 'LIVE' -or -not [bool]$accountState.liveExecutionEnabled) {
  throw 'Safety snapshot requires canonical LIVE account-mode state.'
}
$envFile = Resolve-ProjectPath ([string]$accountState.envFile)
$envInfo = Assert-Phase7CAccountEnv -EnvFile $envFile -AccountMode 'LIVE' -RequireTrading
$BridgePort = [int]$envInfo.bridgePort
$BridgeBase = "http://$($envInfo.bridgeHost):$BridgePort"
$BridgeHeaders = @{ 'x-mt5-api-key' = $envInfo.apiKey }

$mode = Invoke-ControlGet '/api/v1/phase7c/bot-mode'
if ([string]$mode.state.mode -ne 'PAUSE') { throw "Safety snapshot requires BOT_MODE=PAUSE. actual=$($mode.state.mode)" }

$arm = Invoke-ControlGet '/api/v1/phase7c-live-arm-control/capability'
if ([string]$arm.accountMode -ne 'LIVE' -or [string]$arm.liveArmStatus -ne 'DISARMED' -or [bool]$arm.liveExecutionArmed) {
  throw 'Safety snapshot requires ARM=DISARMED with liveExecutionArmed=false.'
}

$lifecycle = Invoke-ControlGet '/api/v1/phase7c/lifecycle'
Assert-LifecycleStopped -State $lifecycle

$positions = @(Read-BridgeArray '/v1/positions?symbol=XAUUSD')
$orders = @(Read-BridgeArray '/v1/orders?symbol=XAUUSD')
if ($positions.Count -ne 0) { throw "Safety snapshot requires POSITIONS=0. current=$($positions.Count)" }
if ($orders.Count -ne 0) { throw "Safety snapshot requires PENDING_ORDERS=0. current=$($orders.Count)" }

$health = Invoke-BridgeGet '/health'
if (-not [bool]$health.connected -or [string]$health.status -ne 'ok') { throw 'Safety snapshot requires Bridge connected/ok.' }
if ([string]$health.configuredAccountMode -ne 'LIVE' -or [string]$health.accountMode -ne 'real') { throw 'Safety snapshot requires Bridge LIVE/real.' }
$bridgeSessionId = [string]$health.bridgeSessionId
if ([string]::IsNullOrWhiteSpace($bridgeSessionId)) { throw 'Safety snapshot requires bridgeSessionId.' }
$bridgePid = Get-SingleBridgeListenerPid -Port $BridgePort

Write-Host 'PHASE7C_STOPPED_WEB_SAFETY_BOT_MODE=PAUSE'
Write-Host 'PHASE7C_STOPPED_WEB_SAFETY_ARM=DISARMED'
Write-Host 'PHASE7C_STOPPED_WEB_SAFETY_LIFECYCLE_RUNNING=false'
Write-Host 'PHASE7C_STOPPED_WEB_SAFETY_LIFECYCLE_READY=false'
Write-Host 'PHASE7C_STOPPED_WEB_SAFETY_POSITIONS=0'
Write-Host 'PHASE7C_STOPPED_WEB_SAFETY_PENDING_ORDERS=0'
Write-Host "PHASE7C_STOPPED_WEB_SAFETY_BRIDGE_SESSION_ID=$bridgeSessionId"
Write-Host "PHASE7C_STOPPED_WEB_SAFETY_BRIDGE_PID=$bridgePid"
Write-Host 'PHASE7C_STOPPED_WEB_SAFETY_SNAPSHOT=PASS'

[pscustomobject]@{
  mode = 'PAUSE'
  arm = 'DISARMED'
  lifecycleRunning = $false
  lifecycleReady = $false
  positionCount = 0
  pendingOrderCount = 0
  bridgeSessionId = $bridgeSessionId
  bridgePid = $bridgePid
}
