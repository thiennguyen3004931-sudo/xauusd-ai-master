param(
  [Parameter(Mandatory = $true)] [string]$WorkDir,
  [switch]$SkipBuild,
  [switch]$ArmExecutors,
  [double]$SidewayRiskPercent = 0.25,
  [double]$SidewayMaxLot = 0.03,
  [int]$ApiPort = 3711,
  [int]$WebPort = 5717,
  [int]$BridgePort = 8765
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WorkDir = (Resolve-Path $WorkDir).Path
$DemoDir = Join-Path $WorkDir "phase7b-demo-forward"
$BridgeEnv = Join-Path $ProjectRoot "packages\mt5-broker\bridge\.env.phase7b-demo"
$LegacyBotTask = "XAUUSD-Phase7B-Bot"
$BridgeTask = "XAUUSD-Phase7B-Bridge"
$WebTask = "XAUUSD-Phase7B-Web"
$ExecutorSupervisor = Join-Path $PSScriptRoot "run-phase7c-executors-local.ps1"
$ExecutorStopper = Join-Path $PSScriptRoot "stop-phase7c-executors-local.ps1"
$ExecutorRuntime = Join-Path $WorkDir "phase7c-executors"

if (-not (Test-Path $BridgeEnv)) { throw "Bridge env not found: $BridgeEnv" }
if (-not (Test-Path $ExecutorSupervisor)) { throw "Phase 7C executor supervisor not found: $ExecutorSupervisor" }
if (-not (Test-Path $ExecutorStopper)) { throw "Phase 7C executor stopper not found: $ExecutorStopper" }
if ($SidewayRiskPercent -le 0 -or $SidewayRiskPercent -gt 5) { throw "SidewayRiskPercent must be > 0 and <= 5." }
if ($SidewayMaxLot -le 0) { throw "SidewayMaxLot must be positive." }

function Stop-TaskSafe([string]$Name) {
  try { Stop-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue } catch {}
}

function Start-TaskSafe([string]$Name) {
  if ($null -eq (Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue)) {
    throw "Scheduled Task is missing: $Name"
  }
  Start-ScheduledTask -TaskName $Name
}

function Stop-PortOwner([int]$Port) {
  $owners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($owner in $owners) {
    Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
  }
}

function Stop-BotProcess {
  $runtimePath = Join-Path $DemoDir "phase7b-demo-runtime.json"
  if (-not (Test-Path $runtimePath)) { return }
  try {
    $runtime = Get-Content $runtimePath -Raw | ConvertFrom-Json
    if ($null -ne $runtime.pid -and [int]$runtime.pid -gt 0) {
      Stop-Process -Id ([int]$runtime.pid -Force -ErrorAction SilentlyContinue)
    }
  } catch {}
}

function Read-EnvValue([string]$Name) {
  $line = Get-Content $BridgeEnv | Where-Object { $_ -match ('^' + [regex]::Escape($Name) + '=') } | Select-Object -First 1
  if ($null -eq $line) { return "" }
  $value = ($line -split '=', 2)[1].Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  return $value
}

function Start-Phase7CExecutors {
  $commonArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", ('"{0}"' -f $ExecutorSupervisor),
    "-WorkDir", ('"{0}"' -f $WorkDir),
    "-ControlApiUrl", ('"{0}"' -f $apiUrl),
    "-EnvFile", ('"{0}"' -f $BridgeEnv),
    "-SidewayRiskPercent", $SidewayRiskPercent.ToString([System.Globalization.CultureInfo]::InvariantCulture),
    "-SidewayMaxLot", $SidewayMaxLot.ToString([System.Globalization.CultureInfo]::InvariantCulture)
  )

  if (-not $ArmExecutors) {
    Write-Host "PHASE7C_EXECUTORS=SHADOW_PREFLIGHT"
    & powershell.exe @commonArgs
    if ($LASTEXITCODE -ne 0) { throw "Phase 7C executor shadow/preflight failed with exit code $LASTEXITCODE" }
    Write-Host "PHASE7C_EXECUTORS_SHADOW=PASS"
    return
  }

  $commonArgs += "-Armed"
  New-Item -ItemType Directory -Force -Path $ExecutorRuntime | Out-Null
  $supervisorOut = Join-Path $ExecutorRuntime "supervisor.out.log"
  $supervisorErr = Join-Path $ExecutorRuntime "supervisor.err.log"
  $process = Start-Process -FilePath "powershell.exe" -ArgumentList $commonArgs -WorkingDirectory $ProjectRoot -RedirectStandardOutput $supervisorOut -RedirectStandardError $supervisorErr -PassThru
  Start-Sleep -Seconds 5
  $process.Refresh()
  if ($process.HasExited) {
    throw "Phase 7C executor supervisor exited during startup with code $($process.ExitCode). Check $supervisorErr"
  }
  Write-Host "PHASE7C_EXECUTOR_SUPERVISOR_PID=$($process.Id)"
  Write-Host "PHASE7C_EXECUTORS_ARMED=YES"
}

$apiUrl = "http://127.0.0.1:$ApiPort"
$webUrl = "http://127.0.0.1:$WebPort"
$bridgeUrl = "http://127.0.0.1:$BridgePort"
$apiKey = Read-EnvValue "MT5_API_KEY"
if ([string]::IsNullOrWhiteSpace($apiKey) -or $apiKey.Length -lt 16) {
  throw "MT5_API_KEY is missing/invalid in $BridgeEnv"
}

Write-Host "PHASE7C_ACTIVATE_PREFLIGHT=START"
try {
  $current = Invoke-RestMethod -Uri "$apiUrl/api/v1/phase7b-demo" -Method Get -TimeoutSec 5
  Write-Host "PHASE7C_ACTIVATE_CURRENT_BOT_STATUS=$($current.botStatus)"
  if ($current.botStatus -ne "WAITING_SIGNAL") {
    throw "Phase 7C activation requires botStatus=WAITING_SIGNAL. Current=$($current.botStatus)"
  }
  if ($null -ne $current.mt5.managedPosition) {
    throw "Managed XAUUSD position is present. Activation is blocked until the trade is closed."
  }
} catch {
  if ($_.Exception.Message -like "*requires botStatus*" -or $_.Exception.Message -like "*Managed XAUUSD*") { throw }
  throw "Could not validate Phase 7B idle state from $apiUrl. $($_.Exception.Message)"
}
Write-Host "PHASE7C_ACTIVATE_PREFLIGHT=PASS"

if (-not $SkipBuild) {
  Push-Location $ProjectRoot
  try {
    Write-Host "PHASE7C_ACTIVATE_API_BUILD=START"
    & pnpm --filter @xauusd/api build
    if ($LASTEXITCODE -ne 0) { throw "API build failed with exit code $LASTEXITCODE" }
    Write-Host "PHASE7C_ACTIVATE_API_BUILD=PASS"

    Write-Host "PHASE7C_ACTIVATE_WEB_BUILD=START"
    & pnpm --filter @xauusd/web build
    if ($LASTEXITCODE -ne 0) { throw "Web build failed with exit code $LASTEXITCODE" }
    Write-Host "PHASE7C_ACTIVATE_WEB_BUILD=PASS"
  } finally {
    Pop-Location
  }
}

Write-Host "PHASE7C_ACTIVATE_RESTART=START"
# Raw Phase 7B executor must never run beside the Phase 7C gated executors.
Stop-TaskSafe $LegacyBotTask
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ExecutorStopper -WorkDir $WorkDir
Stop-TaskSafe $WebTask
Stop-TaskSafe $BridgeTask
Stop-BotProcess
Start-Sleep -Seconds 1
Stop-PortOwner $ApiPort
Stop-PortOwner $WebPort
Stop-PortOwner $BridgePort
Start-Sleep -Seconds 2

Start-TaskSafe $BridgeTask
$bridgeDeadline = (Get-Date).AddSeconds(60)
$health = $null
while ((Get-Date) -lt $bridgeDeadline) {
  try {
    $probe = Invoke-RestMethod -Uri "$bridgeUrl/health" -Headers @{ "x-mt5-api-key" = $apiKey } -Method Get -TimeoutSec 4
    if ($probe.connected -and $probe.status -eq "ok" -and $probe.accountMode -eq "demo") {
      $health = $probe
      break
    }
  } catch {}
  Start-Sleep -Seconds 2
}
if ($null -eq $health) { throw "Bridge did not become healthy within 60 seconds." }
Write-Host "PHASE7C_ACTIVATE_BRIDGE=PASS"
Write-Host "PHASE7C_ACTIVATE_ACCOUNT_LOGIN=$($health.accountLogin)"
Write-Host "PHASE7C_ACTIVATE_SERVER=$($health.server)"

$nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$fromMs = $nowMs - 2 * 60 * 60 * 1000
$history = Invoke-RestMethod -Uri "$bridgeUrl/v1/history/candles/XAUUSD?timeframe=M15&fromMs=$fromMs&toMs=$nowMs" -Headers @{ "x-mt5-api-key" = $apiKey } -Method Get -TimeoutSec 10
if (@($history).Count -lt 2) { throw "Phase 7C historical candle endpoint returned insufficient data." }
Write-Host "PHASE7C_ACTIVATE_HISTORY_ENDPOINT=PASS"
Write-Host "PHASE7C_ACTIVATE_HISTORY_BARS=$(@($history).Count)"

# Web task owns the API/UI surface. Do not restart the raw Phase 7B bot task.
Start-TaskSafe $WebTask

$webDeadline = (Get-Date).AddSeconds(90)
$demo = $null
$risk = $null
$mode = $null
$uiReady = $false
while ((Get-Date) -lt $webDeadline) {
  try {
    $demoProbe = Invoke-RestMethod -Uri "$apiUrl/api/v1/phase7b-demo" -Method Get -TimeoutSec 4
    $riskProbe = Invoke-RestMethod -Uri "$apiUrl/api/v1/phase7c/account-risk?riskPercent=$SidewayRiskPercent&maxLot=$SidewayMaxLot" -Method Get -TimeoutSec 4
    $modeProbe = Invoke-RestMethod -Uri "$apiUrl/api/v1/phase7c/bot-mode" -Method Get -TimeoutSec 4
    $uiProbe = Invoke-WebRequest -Uri "$webUrl/" -Method Get -UseBasicParsing -TimeoutSec 4
    if ($demoProbe -and $riskProbe -and $modeProbe -and $uiProbe.StatusCode -ge 200 -and $uiProbe.StatusCode -lt 400) {
      $demo = $demoProbe
      $risk = $riskProbe
      $mode = $modeProbe
      $uiReady = $true
      break
    }
  } catch {}
  Start-Sleep -Seconds 2
}

if ($null -eq $demo -or $null -eq $risk -or $null -eq $mode -or -not $uiReady) {
  throw "Phase 7C API/UI self-test failed after restart."
}
if ($risk.safety.executionMutation -ne $false -or $risk.safety.phase7bFixedVolumeUnchanged -ne $true) {
  throw "Phase 7C Auto Lot safety assertion failed."
}

Write-Host "PHASE7C_ACTIVATE_LEGACY_BOT_TASK=STOPPED_NOT_RESTARTED"
Write-Host "PHASE7C_ACTIVATE_MODE=$($mode.state.mode)"
Write-Host "PHASE7C_ACTIVATE_AUTO_LOT_MODE=$($risk.safety.mode)"
Write-Host "PHASE7C_ACTIVATE_AUTO_LOT_EXECUTION_MUTATION=$($risk.safety.executionMutation)"
Write-Host "PHASE7C_ACTIVATE_PHASE7B_FIXED_VOLUME_UNCHANGED=$($risk.safety.phase7bFixedVolumeUnchanged)"

Start-Phase7CExecutors

Write-Host "PHASE7C_ACTIVATE_CONTROL_CENTER=$webUrl/"
Write-Host "PHASE7C_ACTIVATE_BACKTEST=$webUrl/phase7c-backtest"
Write-Host "PHASE7C_ACTIVATE_RISK=$webUrl/phase7c-risk"
Write-Host "PHASE7C_ACTIVATE_EXECUTORS=$([string]$(if ($ArmExecutors) { 'ARMED_DEMO_ONLY' } else { 'SHADOW_ONLY' }))"
Write-Host "PHASE7C_ACTIVATE_STATUS=PASS"
