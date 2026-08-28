param(
  [Parameter(Mandatory = $true)] [string]$WorkDir,
  [string]$ControlApiUrl = "http://127.0.0.1:3711",
  [string]$EnvFile = "packages/mt5-broker/bridge/.env.phase7b-demo",
  [string]$TelegramEnvFile = ".env.phase7b-telegram",
  [ValidateSet("DEMO", "LIVE")] [string]$AccountMode = "DEMO",
  [switch]$LiveExecutionEnabled,
  [double]$TrendFixedVolume = 0.03,
  [double]$SidewayRiskPercent = 0.25,
  [double]$SidewayMaxLot = 0.03,
  [int]$DependencyWaitSeconds = 120,
  [switch]$DisableTelegram,
  [switch]$Armed,
  [switch]$Once
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$TrendLauncher = Join-Path $PSScriptRoot "run-phase7c-trend-controller-local.ps1"
$SidewayLauncher = Join-Path $PSScriptRoot "run-phase7c-sideway-controller-local.ps1"
$TelegramModeLauncher = Join-Path $PSScriptRoot "run-phase7c-telegram-mode-controller-local.ps1"
$RegimeNotifierLauncher = Join-Path $PSScriptRoot "run-phase7c-regime-notifier-local.ps1"
$TradeNotifierLauncher = Join-Path $PSScriptRoot "run-phase7b-telegram-notifier-local.ps1"
$AccountLibrary = Join-Path $PSScriptRoot "lib\phase7c-account-mode.ps1"

foreach ($required in @($TrendLauncher, $SidewayLauncher, $TelegramModeLauncher, $RegimeNotifierLauncher, $TradeNotifierLauncher, $AccountLibrary)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "Required Phase7C runtime file not found: $required" }
}
. $AccountLibrary
$AccountMode = ConvertTo-Phase7CAccountMode $AccountMode
if ($AccountMode -eq "LIVE" -and -not $LiveExecutionEnabled) {
  throw "LIVE executor supervisor requires -LiveExecutionEnabled."
}
if ($DependencyWaitSeconds -lt 10) { throw "DependencyWaitSeconds must be >= 10." }
if ($TrendFixedVolume -lt 0.03 -or $TrendFixedVolume -gt 0.06) { throw "TrendFixedVolume must be between 0.03 and 0.06." }
if ($SidewayRiskPercent -lt 0.01 -or $SidewayRiskPercent -gt 1) { throw "SidewayRiskPercent must be between 0.01 and 1.00." }
if ($SidewayMaxLot -lt 0.03 -or $SidewayMaxLot -gt 0.04) { throw "SidewayMaxLot must be between 0.03 and 0.04." }
foreach ($managedLot in @($TrendFixedVolume, $SidewayMaxLot)) {
  $units = $managedLot / 0.03
  if ([math]::Abs($units - [math]::Round($units)) -gt 1e-8) { throw "Managed lot values must use 0.03 increments." }
}

if (-not [System.IO.Path]::IsPathRooted($WorkDir)) { $WorkDir = Join-Path $ProjectRoot $WorkDir }
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
$WorkDir = (Resolve-Path $WorkDir).Path
$LotSettingsPath = Join-Path $WorkDir "phase7c-lot-settings.json"
if (Test-Path $LotSettingsPath) {
  try {
    $lotSettings = Get-Content -LiteralPath $LotSettingsPath -Raw | ConvertFrom-Json
    [void](Assert-Phase7CRiskProfile $lotSettings "Active Phase7C lot settings")
    $TrendFixedVolume = [double]$lotSettings.trendFixedLot
    $SidewayRiskPercent = [double]$lotSettings.sidewayRiskPercent
    $SidewayMaxLot = [double]$lotSettings.sidewayMaxLot
  } catch {
    throw "Phase 7C lot settings are invalid at $LotSettingsPath. $($_.Exception.Message)"
  }
}

if (-not [System.IO.Path]::IsPathRooted($EnvFile)) { $EnvFile = Join-Path $ProjectRoot $EnvFile }
$envInfo = Assert-Phase7CAccountEnv -EnvFile $EnvFile -AccountMode $AccountMode -RequireTrading:$Armed
$EnvFile = $envInfo.envFile

if (-not [System.IO.Path]::IsPathRooted($TelegramEnvFile)) { $TelegramEnvFile = Join-Path $ProjectRoot $TelegramEnvFile }
if (Test-Path $TelegramEnvFile) { $TelegramEnvFile = (Resolve-Path $TelegramEnvFile).Path }

$RuntimeDir = Join-Path $WorkDir "phase7c-executors"
if ($AccountMode -eq "LIVE") {
  $TrendWorkDir = Join-Path $WorkDir "phase7b-live-forward"
  $SidewayWorkDir = Join-Path $WorkDir "phase7c-sideway-live-forward"
} else {
  $TrendWorkDir = Join-Path $WorkDir "phase7b-demo-forward"
  $SidewayWorkDir = Join-Path $WorkDir "phase7c-sideway-forward"
}
$DecisionRuntimeBase = Join-Path $RuntimeDir "decision-observability"
$DecisionRuntimeDir = Join-Path $DecisionRuntimeBase ($AccountMode.ToLowerInvariant())
foreach ($dir in @($RuntimeDir, $TrendWorkDir, $SidewayWorkDir, $DecisionRuntimeBase, $DecisionRuntimeDir)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

$env:ZIQ_PHASE7C_EXECUTION_LOCK = Join-Path $RuntimeDir "phase7c-execution.lock"
$env:ZIQ_PHASE7C_REGIME_STATE_FILE = Join-Path $RuntimeDir "regime-notifier-state.json"
$env:ZIQ_PHASE7C_DECISION_DIR = $DecisionRuntimeDir
$env:ZIQ_PHASE7C_ACCOUNT_MODE = $AccountMode
$env:ZIQ_PHASE7C_LIVE_EXECUTION_ENABLED = if ($AccountMode -eq "LIVE" -and $LiveExecutionEnabled) { "true" } else { "false" }
$SupervisorPidPath = Join-Path $RuntimeDir "supervisor.pid"
$TrendPidPath = Join-Path $RuntimeDir "trend.pid"
$SidewayPidPath = Join-Path $RuntimeDir "sideway.pid"
$TelegramModePidPath = Join-Path $RuntimeDir "telegram-mode.pid"
$RegimeNotifierPidPath = Join-Path $RuntimeDir "regime-notifier.pid"
$TradeNotifierPidPath = Join-Path $RuntimeDir "trade-notifier.pid"
$TradeNotifierRuntimePath = Join-Path $RuntimeDir "trade-notifier-runtime.json"
$TrendOut = Join-Path $RuntimeDir "trend.out.log"
$TrendErr = Join-Path $RuntimeDir "trend.err.log"
$SidewayOut = Join-Path $RuntimeDir "sideway.out.log"
$SidewayErr = Join-Path $RuntimeDir "sideway.err.log"
$TelegramModeOut = Join-Path $RuntimeDir "telegram-mode.out.log"
$TelegramModeErr = Join-Path $RuntimeDir "telegram-mode.err.log"
$RegimeNotifierOut = Join-Path $RuntimeDir "regime-notifier.out.log"
$RegimeNotifierErr = Join-Path $RuntimeDir "regime-notifier.err.log"
$TradeNotifierOut = Join-Path $RuntimeDir "trade-notifier.out.log"
$TradeNotifierErr = Join-Path $RuntimeDir "trade-notifier.err.log"
$ActiveLotSettingsPath = Join-Path $RuntimeDir "active-lot-settings.json"

function Read-EnvValueFromFile([string]$Path, [string]$Name) {
  return Get-Phase7CEnvValue $Path $Name
}
function Read-EnvValue([string]$Name) { return Read-EnvValueFromFile $EnvFile $Name }

function Stop-ProcessTree([int]$ProcessId) {
  if ($ProcessId -le 0) { return }
  try {
    if ($null -eq (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return }
    Write-Host "PHASE7C_STOP_PROCESS_TREE_PID=$ProcessId"
    & "$env:SystemRoot\System32\taskkill.exe" /PID $ProcessId /T /F 2>$null | Out-Null
  } catch {
    Write-Warning "Could not stop process tree PID=$ProcessId : $($_.Exception.Message)"
  }
}

function Stop-Phase7CExecutorOrphans {
  $patterns = @(
    "run-phase7c-trend-controller-local.ps1",
    "run-phase7c-trend-account-mode.mjs",
    "run-phase7c-trend-controller.mjs",
    ".phase7c-trend-legacy-runtime-",
    "run-phase7c-sideway-controller-local.ps1",
    "run-phase7c-sideway-locked.mjs",
    "run-phase7c-sideway-account-mode.mjs",
    ".phase7c-sideway-live-runtime-",
    "run-phase7c-telegram-mode-controller-local.ps1",
    "run-phase7c-telegram-mode-controller.mjs",
    "run-phase7c-regime-notifier-local.ps1",
    "run-phase7c-regime-notifier.mjs",
    "run-phase7b-telegram-notifier-local.ps1",
    "run-phase7b-telegram-notifier.mjs"
  )
  $targets = @(
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object {
        $commandLine = $_.CommandLine
        if ([string]::IsNullOrWhiteSpace($commandLine)) { return $false }
        foreach ($pattern in $patterns) { if ($commandLine -like "*$pattern*") { return $true } }
        return $false
      } |
      Sort-Object ProcessId -Unique
  )
  foreach ($target in ($targets | Sort-Object ProcessId -Descending)) {
    Write-Host "PHASE7C_ORPHAN_CLEANUP_PID=$($target.ProcessId)|NAME=$($target.Name)"
    try { & "$env:SystemRoot\System32\taskkill.exe" /PID $target.ProcessId /T /F 2>$null | Out-Null } catch {}
  }
  Start-Sleep -Milliseconds 500
}

function Stop-PidFile([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  try {
    $pidValue = [int](Get-Content -LiteralPath $Path -Raw).Trim()
    if ($pidValue -gt 0) { Stop-ProcessTree $pidValue }
  } catch {}
  Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
}

function Read-LogTail([string]$Path, [int]$Lines = 30) {
  if (-not (Test-Path $Path)) { return "<log not found: $Path>" }
  try { return ((Get-Content -LiteralPath $Path -Tail $Lines -ErrorAction Stop) -join [Environment]::NewLine) }
  catch { return "<could not read log: $Path>" }
}

function Assert-ShadowProcessSuccess($Process, [string]$Label, [string]$StdOut, [string]$StdErr, [string]$PassMarker) {
  $Process.Refresh()
  $exitCode = $Process.ExitCode
  $exitCodeKnown = $null -ne $exitCode
  $outText = if (Test-Path $StdOut) { Get-Content -LiteralPath $StdOut -Raw -ErrorAction SilentlyContinue } else { "" }
  $markerFound = -not [string]::IsNullOrWhiteSpace($outText) -and $outText.Contains($PassMarker)
  if (($exitCodeKnown -and [int]$exitCode -ne 0) -or -not $markerFound) {
    $exitText = if ($exitCodeKnown) { [string]$exitCode } else { "UNAVAILABLE" }
    throw "$Label shadow/preflight failed. exitCode=$exitText markerFound=$markerFound`nSTDERR:`n$(Read-LogTail $StdErr)`nSTDOUT:`n$(Read-LogTail $StdOut)"
  }
  $safeExitCode = if ($exitCodeKnown) { [string]$exitCode } else { "UNAVAILABLE" }
  Write-Host "PHASE7C_${Label}_SHADOW_EXIT_CODE=$safeExitCode"
  Write-Host "PHASE7C_${Label}_SHADOW_PREFLIGHT=PASS"
}

function Wait-Phase7CDependencies {
  $apiKey = Read-EnvValue "MT5_API_KEY"
  $bridgeHost = Read-EnvValue "MT5_BRIDGE_HOST"
  $bridgePort = Read-EnvValue "MT5_BRIDGE_PORT"
  if ([string]::IsNullOrWhiteSpace($apiKey)) { throw "MT5_API_KEY is missing from $EnvFile" }
  if ([string]::IsNullOrWhiteSpace($bridgeHost)) { $bridgeHost = "127.0.0.1" }
  if ([string]::IsNullOrWhiteSpace($bridgePort)) { $bridgePort = "8765" }
  $bridgeBase = "http://${bridgeHost}:${bridgePort}"
  $expectedBridgeMode = if ($AccountMode -eq "LIVE") { "real" } else { "demo" }
  $deadline = (Get-Date).AddSeconds($DependencyWaitSeconds)
  $lastBridgeError = "not checked"
  $lastApiError = "not checked"
  while ((Get-Date) -lt $deadline) {
    $bridgeReady = $false
    $apiReady = $false
    try {
      $health = Invoke-RestMethod -Uri "$bridgeBase/health" -Headers @{ "x-mt5-api-key" = $apiKey } -Method Get -TimeoutSec 4
      if ($health.connected -and $health.status -eq "ok" -and [string]$health.accountMode -eq $expectedBridgeMode) {
        $bridgeReady = $true
      } else {
        $lastBridgeError = "connected=$($health.connected);status=$($health.status);mode=$($health.accountMode);expected=$expectedBridgeMode"
      }
    } catch { $lastBridgeError = $_.Exception.Message }
    try {
      $mode = Invoke-RestMethod -Uri "$($ControlApiUrl.TrimEnd('/'))/api/v1/phase7c/bot-mode" -Method Get -TimeoutSec 4
      if ($null -ne $mode.state.mode) { $apiReady = $true } else { $lastApiError = "bot-mode response missing state.mode" }
    } catch { $lastApiError = $_.Exception.Message }
    if ($bridgeReady -and $apiReady) {
      Write-Host "PHASE7C_DEPENDENCY_BRIDGE=PASS"
      Write-Host "PHASE7C_DEPENDENCY_CONTROL_API=PASS"
      Write-Host "PHASE7C_DEPENDENCY_ACCOUNT_MODE=$AccountMode"
      return
    }
    Start-Sleep -Seconds 2
  }
  throw "Phase 7C dependencies were not ready within $DependencyWaitSeconds seconds. Bridge=[$lastBridgeError] ControlAPI=[$lastApiError]"
}

function Set-Phase7CStartupPause {
  $body = @{
    mode = "PAUSE"
    source = "startup-scheduled-task"
  } | ConvertTo-Json -Compress
  try {
    $response = Invoke-RestMethod -Uri "$($ControlApiUrl.TrimEnd('/'))/api/v1/phase7c/bot-mode" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 5
  } catch {
    throw "Phase 7C startup safety transition to PAUSE failed. No executor will launch. $($_.Exception.Message)"
  }
  $persistedMode = [string]$response.state.mode
  if ($persistedMode -ne "PAUSE") {
    throw "Phase 7C startup safety transition did not persist PAUSE. No executor will launch. Actual=$persistedMode"
  }
  Write-Host "PHASE7C_STARTUP_BOT_MODE=PAUSE"
  Write-Host "PHASE7C_STARTUP_BOT_MODE_SOURCE=startup-scheduled-task"
}

function Test-TradeNotifierHeartbeat($Process) {
  if ($null -eq $Process) { return $false }
  try {
    $Process.Refresh()
    if ($Process.HasExited -or -not (Test-Path -LiteralPath $TradeNotifierRuntimePath)) { return $false }
    $snapshot = Get-Content -LiteralPath $TradeNotifierRuntimePath -Raw | ConvertFrom-Json
    if ([string]$snapshot.status -ne "RUNNING") { return $false }
    if ([int]$snapshot.wrapperPid -ne [int]$Process.Id) { return $false }
    if ([string]$snapshot.accountMode -ne $AccountMode) { return $false }
    if ([string]$snapshot.orderPermission -ne "NONE") { return $false }
    $heartbeatAt = [int64]$snapshot.heartbeatAt
    $heartbeatAge = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - $heartbeatAt
    if ($heartbeatAt -le 0 -or $heartbeatAge -gt 15000) { return $false }
    if ($null -eq $snapshot.pid) { return $false }
    Get-Process -Id ([int]$snapshot.pid) -ErrorAction Stop | Out-Null
    return $true
  } catch { return $false }
}

$TelegramConfigured = $false
if (-not $DisableTelegram -and (Test-Path $TelegramEnvFile)) {
  $telegramToken = Read-EnvValueFromFile $TelegramEnvFile "ZIQ_TELEGRAM_BOT_TOKEN"
  $telegramChatId = Read-EnvValueFromFile $TelegramEnvFile "ZIQ_TELEGRAM_CHAT_ID"
  if (-not [string]::IsNullOrWhiteSpace($telegramToken) -and -not [string]::IsNullOrWhiteSpace($telegramChatId)) {
    $TelegramConfigured = $true
  } else {
    Write-Warning "Telegram env exists but ZIQ_TELEGRAM_BOT_TOKEN/ZIQ_TELEGRAM_CHAT_ID is incomplete. Telegram services will stay disabled."
  }
}

Stop-PidFile $TrendPidPath
Stop-PidFile $SidewayPidPath
Stop-PidFile $TelegramModePidPath
Stop-PidFile $RegimeNotifierPidPath
Stop-PidFile $TradeNotifierPidPath
Stop-Phase7CExecutorOrphans
Remove-Item -LiteralPath $TradeNotifierRuntimePath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $env:ZIQ_PHASE7C_EXECUTION_LOCK -Force -ErrorAction SilentlyContinue
Set-Content -LiteralPath $SupervisorPidPath -Value $PID -Encoding ascii

$common = @("-NoProfile", "-ExecutionPolicy", "Bypass")
$trendArgs = @(
  "-File", ('"{0}"' -f $TrendLauncher),
  "-ControlApiUrl", ('"{0}"' -f $ControlApiUrl),
  "-EnvFile", ('"{0}"' -f $EnvFile),
  "-WorkDir", ('"{0}"' -f $TrendWorkDir),
  "-AccountMode", $AccountMode,
  "-FixedVolume", $TrendFixedVolume.ToString([System.Globalization.CultureInfo]::InvariantCulture)
)
$sidewayArgs = @(
  "-File", ('"{0}"' -f $SidewayLauncher),
  "-ControlApiUrl", ('"{0}"' -f $ControlApiUrl),
  "-EnvFile", ('"{0}"' -f $EnvFile),
  "-WorkDir", ('"{0}"' -f $SidewayWorkDir),
  "-AccountMode", $AccountMode,
  "-RiskPercent", $SidewayRiskPercent.ToString([System.Globalization.CultureInfo]::InvariantCulture),
  "-MaxLot", $SidewayMaxLot.ToString([System.Globalization.CultureInfo]::InvariantCulture)
)
if ($AccountMode -eq "LIVE" -and $LiveExecutionEnabled) {
  $trendArgs += "-LiveExecutionEnabled"
  $sidewayArgs += "-LiveExecutionEnabled"
}
$telegramModeArgs = @(
  "-File", ('"{0}"' -f $TelegramModeLauncher),
  "-EnvFile", ('"{0}"' -f $TelegramEnvFile),
  "-ControlApiUrl", ('"{0}"' -f $ControlApiUrl)
)
$regimeNotifierArgs = @(
  "-File", ('"{0}"' -f $RegimeNotifierLauncher),
  "-EnvFile", ('"{0}"' -f $TelegramEnvFile),
  "-ControlApiUrl", ('"{0}"' -f $ControlApiUrl),
  "-Symbol", "XAUUSD"
)
$tradeNotifierArgs = @(
  "-File", ('"{0}"' -f $TradeNotifierLauncher),
  "-WorkDir", ('"{0}"' -f $WorkDir),
  "-EnvFile", ('"{0}"' -f $TelegramEnvFile),
  "-AccountMode", $AccountMode,
  "-RuntimeFile", ('"{0}"' -f $TradeNotifierRuntimePath),
  "-IntervalSeconds", "2"
)
if ($Armed) { $trendArgs += "-Armed"; $sidewayArgs += "-Armed" }
if ($Once) { $trendArgs += "-Once"; $sidewayArgs += "-Once" }

Write-Host "PHASE7C_EXECUTOR_SUPERVISOR=STARTING"
Write-Host "PHASE7C_EXECUTOR_WORK_DIR=$WorkDir"
Write-Host "PHASE7C_EXECUTOR_CONTROL_API=$ControlApiUrl"
Write-Host "PHASE7C_EXECUTOR_ARMED=$($Armed.IsPresent)"
Write-Host "PHASE7C_EXECUTOR_ACCOUNT_MODE=$AccountMode"
Write-Host "PHASE7C_EXECUTOR_LIVE_EXECUTION_ENABLED=$($AccountMode -eq 'LIVE' -and $LiveExecutionEnabled)"
Write-Host "PHASE7C_EXECUTION_LOCK=$($env:ZIQ_PHASE7C_EXECUTION_LOCK)"
Write-Host "PHASE7C_TREND_RUNTIME=$TrendWorkDir"
Write-Host "PHASE7C_SIDEWAY_RUNTIME=$SidewayWorkDir"
Write-Host "PHASE7C_DECISION_OBSERVABILITY=$DecisionRuntimeDir"
Write-Host "PHASE7C_DEPENDENCY_WAIT_SECONDS=$DependencyWaitSeconds"
Write-Host "PHASE7C_TELEGRAM_CONFIGURED=$TelegramConfigured"
Write-Host "PHASE7C_TELEGRAM_MT5_ORDER_PERMISSION=NONE"
Write-Host "PHASE7C_TRADE_NOTIFIER_RUNTIME=$TradeNotifierRuntimePath"
Write-Host "PHASE7C_TREND_FIXED_LOT=$TrendFixedVolume"
Write-Host "PHASE7C_SIDEWAY_RISK_PERCENT=$SidewayRiskPercent"
Write-Host "PHASE7C_SIDEWAY_MAX_LOT=$SidewayMaxLot"

function Write-ActiveLotSettings {
  $activeLotSettings = [pscustomobject]@{
    version = 1
    accountMode = $AccountMode
    trendFixedLot = $TrendFixedVolume
    sidewayRiskPercent = $SidewayRiskPercent
    sidewayMaxLot = $SidewayMaxLot
    armed = $Armed.IsPresent
    supervisorPid = $PID
    appliedAt = [DateTimeOffset]::UtcNow.ToString("o")
  }
  $activeLotJson = $activeLotSettings | ConvertTo-Json -Depth 4
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($ActiveLotSettingsPath, "$activeLotJson`n", $utf8NoBom)
  Write-Host "PHASE7C_ACTIVE_LOT_SETTINGS=$ActiveLotSettingsPath"
}

function Start-TelegramModeChild {
  $process = Start-Process -FilePath "powershell.exe" -ArgumentList ($common + $telegramModeArgs) -WorkingDirectory $ProjectRoot -RedirectStandardOutput $TelegramModeOut -RedirectStandardError $TelegramModeErr -PassThru
  Set-Content -LiteralPath $TelegramModePidPath -Value $process.Id -Encoding ascii
  Write-Host "PHASE7C_TELEGRAM_MODE_PID=$($process.Id)"
  return $process
}
function Start-RegimeNotifierChild {
  $process = Start-Process -FilePath "powershell.exe" -ArgumentList ($common + $regimeNotifierArgs) -WorkingDirectory $ProjectRoot -RedirectStandardOutput $RegimeNotifierOut -RedirectStandardError $RegimeNotifierErr -PassThru
  Set-Content -LiteralPath $RegimeNotifierPidPath -Value $process.Id -Encoding ascii
  Write-Host "PHASE7C_REGIME_NOTIFIER_PID=$($process.Id)"
  return $process
}
function Start-TradeNotifierChild {
  Remove-Item -LiteralPath $TradeNotifierRuntimePath -Force -ErrorAction SilentlyContinue
  $process = Start-Process -FilePath "powershell.exe" -ArgumentList ($common + $tradeNotifierArgs) -WorkingDirectory $ProjectRoot -RedirectStandardOutput $TradeNotifierOut -RedirectStandardError $TradeNotifierErr -PassThru
  Set-Content -LiteralPath $TradeNotifierPidPath -Value $process.Id -Encoding ascii
  Write-Host "PHASE7C_TRADE_NOTIFIER_PID=$($process.Id)"
  return $process
}

$trend = $null
$sideway = $null
$telegramMode = $null
$regimeNotifier = $null
$tradeNotifier = $null
try {
  Wait-Phase7CDependencies
  Set-Phase7CStartupPause
  $trend = Start-Process -FilePath "powershell.exe" -ArgumentList ($common + $trendArgs) -WorkingDirectory $ProjectRoot -RedirectStandardOutput $TrendOut -RedirectStandardError $TrendErr -PassThru
  Set-Content -LiteralPath $TrendPidPath -Value $trend.Id -Encoding ascii
  Write-Host "PHASE7C_TREND_PID=$($trend.Id)"
  $sideway = Start-Process -FilePath "powershell.exe" -ArgumentList ($common + $sidewayArgs) -WorkingDirectory $ProjectRoot -RedirectStandardOutput $SidewayOut -RedirectStandardError $SidewayErr -PassThru
  Set-Content -LiteralPath $SidewayPidPath -Value $sideway.Id -Encoding ascii
  Write-Host "PHASE7C_SIDEWAY_PID=$($sideway.Id)"

  if ($Once) {
    $trend.WaitForExit(); $sideway.WaitForExit()
    Assert-ShadowProcessSuccess $trend "TREND" $TrendOut $TrendErr "PHASE7B_DEMO_PREFLIGHT_STATUS=PASS"
    Assert-ShadowProcessSuccess $sideway "SIDEWAY" $SidewayOut $SidewayErr "PHASE7C_SIDEWAY_PREFLIGHT_STATUS=PASS"
    Write-Host "PHASE7C_TELEGRAM_ONCE=SKIPPED"
    Write-Host "PHASE7C_EXECUTOR_SHADOW_STATUS=PASS"
    Write-ActiveLotSettings
    return
  }

  if (-not $Armed) {
    $trend.WaitForExit(); $sideway.WaitForExit()
    Assert-ShadowProcessSuccess $trend "TREND" $TrendOut $TrendErr "PHASE7B_DEMO_PREFLIGHT_STATUS=PASS"
    Assert-ShadowProcessSuccess $sideway "SIDEWAY" $SidewayOut $SidewayErr "PHASE7C_SIDEWAY_PREFLIGHT_STATUS=PASS"
    $trend = $null; $sideway = $null
    Write-Host "PHASE7C_EXECUTOR_SHADOW_STATUS=PASS"
    Write-Host "PHASE7C_EXECUTOR_UNARMED_SUPERVISOR=TELEGRAM_MODE_ONLY"
    Write-Host "PHASE7C_EXECUTOR_UNARMED_TELEGRAM_SERVICES=MODE_PLUS_TRADE_NOTIFIER"
    Write-ActiveLotSettings
  } else {
    Start-Sleep -Seconds 3
    $trend.Refresh(); $sideway.Refresh()
    if ($trend.HasExited) { throw "Trend executor exited during startup with code $($trend.ExitCode). Check $TrendErr" }
    if ($sideway.HasExited) { throw "Sideway executor exited during startup with code $($sideway.ExitCode). Check $SidewayErr" }
    Write-Host "PHASE7C_EXECUTOR_ARMED_STATUS=RUNNING"
    Write-ActiveLotSettings
  }

  if ($TelegramConfigured) {
    $telegramMode = Start-TelegramModeChild
    $tradeNotifier = Start-TradeNotifierChild
    if ($Armed) { $regimeNotifier = Start-RegimeNotifierChild }
    Start-Sleep -Seconds 3
    $telegramMode.Refresh()
    if ($telegramMode.HasExited) {
      Write-Warning "Telegram mode controller exited during startup. Supervisor will retry. Check $TelegramModeErr"
      Remove-Item -LiteralPath $TelegramModePidPath -Force -ErrorAction SilentlyContinue
      $telegramMode = $null
      Write-Host "PHASE7C_TELEGRAM_MODE_STATUS=RESTART_PENDING"
    } else { Write-Host "PHASE7C_TELEGRAM_MODE_STATUS=RUNNING" }

    if (-not (Test-TradeNotifierHeartbeat $tradeNotifier)) {
      Write-Warning "Trade notifier exited or heartbeat is not healthy during startup. Supervisor will retry. Check $TradeNotifierErr"
      if ($null -ne $tradeNotifier -and -not $tradeNotifier.HasExited) { Stop-ProcessTree $tradeNotifier.Id }
      Remove-Item -LiteralPath $TradeNotifierPidPath -Force -ErrorAction SilentlyContinue
      $tradeNotifier = $null
      Write-Host "PHASE7C_TRADE_NOTIFIER_STATUS=RESTART_PENDING"
    } else { Write-Host "PHASE7C_TRADE_NOTIFIER_STATUS=RUNNING" }

    if ($null -ne $regimeNotifier) {
      $regimeNotifier.Refresh()
      if ($regimeNotifier.HasExited) {
        Write-Warning "Regime notifier exited during startup. Supervisor will retry. Check $RegimeNotifierErr"
        Remove-Item -LiteralPath $RegimeNotifierPidPath -Force -ErrorAction SilentlyContinue
        $regimeNotifier = $null
        Write-Host "PHASE7C_REGIME_NOTIFIER_STATUS=RESTART_PENDING"
      } else { Write-Host "PHASE7C_REGIME_NOTIFIER_STATUS=RUNNING" }
    }
  } else { Write-Host "PHASE7C_TELEGRAM_STATUS=NOT_CONFIGURED_OR_DISABLED" }

  while ($true) {
    Start-Sleep -Seconds 2
    if ($null -ne $trend) { $trend.Refresh(); if ($trend.HasExited) { throw "Trend executor stopped unexpectedly with code $($trend.ExitCode)." } }
    if ($null -ne $sideway) { $sideway.Refresh(); if ($sideway.HasExited) { throw "Sideway executor stopped unexpectedly with code $($sideway.ExitCode)." } }
    if ($null -ne $telegramMode) {
      $telegramMode.Refresh()
      if ($telegramMode.HasExited) {
        Write-Warning "Telegram mode controller stopped unexpectedly. Supervisor will restart it. Check $TelegramModeErr"
        Remove-Item -LiteralPath $TelegramModePidPath -Force -ErrorAction SilentlyContinue
        $telegramMode = $null
        Write-Host "PHASE7C_TELEGRAM_MODE_STATUS=RESTART_PENDING"
      }
    } elseif ($TelegramConfigured) {
      try { $telegramMode = Start-TelegramModeChild; Write-Host "PHASE7C_TELEGRAM_MODE_STATUS=RESTARTED" }
      catch { Write-Warning "Telegram mode controller restart failed: $($_.Exception.Message)" }
    }

    if ($null -ne $tradeNotifier) {
      if (-not (Test-TradeNotifierHeartbeat $tradeNotifier)) {
        Write-Warning "Trade notifier stopped or heartbeat became stale. Supervisor will restart it. Check $TradeNotifierErr"
        if (-not $tradeNotifier.HasExited) { Stop-ProcessTree $tradeNotifier.Id }
        Remove-Item -LiteralPath $TradeNotifierPidPath -Force -ErrorAction SilentlyContinue
        $tradeNotifier = $null
        Write-Host "PHASE7C_TRADE_NOTIFIER_STATUS=RESTART_PENDING"
      }
    } elseif ($TelegramConfigured) {
      try { $tradeNotifier = Start-TradeNotifierChild; Write-Host "PHASE7C_TRADE_NOTIFIER_STATUS=RESTARTED" }
      catch { Write-Warning "Trade notifier restart failed: $($_.Exception.Message)" }
    }

    if ($null -ne $regimeNotifier) {
      $regimeNotifier.Refresh()
      if ($regimeNotifier.HasExited) {
        Write-Warning "Regime notifier stopped unexpectedly. Supervisor will restart it. Check $RegimeNotifierErr"
        Remove-Item -LiteralPath $RegimeNotifierPidPath -Force -ErrorAction SilentlyContinue
        $regimeNotifier = $null
        Write-Host "PHASE7C_REGIME_NOTIFIER_STATUS=RESTART_PENDING"
      }
    } elseif ($TelegramConfigured -and $Armed) {
      try { $regimeNotifier = Start-RegimeNotifierChild; Write-Host "PHASE7C_REGIME_NOTIFIER_STATUS=RESTARTED" }
      catch { Write-Warning "Regime notifier restart failed: $($_.Exception.Message)" }
    }
  }
}
finally {
  if ($null -ne $telegramMode -and -not $telegramMode.HasExited) { Stop-ProcessTree $telegramMode.Id }
  if ($null -ne $tradeNotifier -and -not $tradeNotifier.HasExited) { Stop-ProcessTree $tradeNotifier.Id }
  if ($null -ne $regimeNotifier -and -not $regimeNotifier.HasExited) { Stop-ProcessTree $regimeNotifier.Id }
  if ($null -ne $trend -and -not $trend.HasExited) { Stop-ProcessTree $trend.Id }
  if ($null -ne $sideway -and -not $sideway.HasExited) { Stop-ProcessTree $sideway.Id }
  Stop-Phase7CExecutorOrphans
  Remove-Item -LiteralPath $TelegramModePidPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $TradeNotifierPidPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $TradeNotifierRuntimePath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $RegimeNotifierPidPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $TrendPidPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $SidewayPidPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $SupervisorPidPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $env:ZIQ_PHASE7C_EXECUTION_LOCK -Force -ErrorAction SilentlyContinue
}
