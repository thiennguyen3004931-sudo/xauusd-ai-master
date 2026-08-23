param(
  [Parameter(Mandatory = $true)] [string]$WorkDir,
  [Parameter(Mandatory = $true)] [ValidateSet("DEMO", "LIVE")] [string]$ExpectedAccountMode,
  [string]$TaskName = "XAUUSD-Phase7C-Executors",
  [string]$ControlApiUrl = "http://127.0.0.1:3711",
  [string]$EnvFile = "",
  [string]$TelegramEnvFile = ".env.phase7b-telegram",
  [switch]$RequireTelegram
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AccountLibrary = Join-Path $PSScriptRoot "lib\phase7c-account-mode.ps1"
if (-not (Test-Path -LiteralPath $AccountLibrary)) { throw "Phase7C account-mode library not found: $AccountLibrary" }
. $AccountLibrary
$ExpectedAccountMode = ConvertTo-Phase7CAccountMode $ExpectedAccountMode
$ExpectedBrokerMode = if ($ExpectedAccountMode -eq "LIVE") { "real" } else { "demo" }

if (-not [System.IO.Path]::IsPathRooted($WorkDir)) { $WorkDir = Join-Path $ProjectRoot $WorkDir }
if (-not (Test-Path $WorkDir)) { throw "WorkDir not found: $WorkDir" }
$WorkDir = (Resolve-Path $WorkDir).Path
$RuntimeDir = Join-Path $WorkDir "phase7c-executors"
$AccountStatePath = Join-Path $ProjectRoot ".runtime\phase7c-account-mode.json"
$TaskConfigPath = Join-Path $ProjectRoot ".runtime\phase7c-executor-task-config.json"
$RunnerStatusPath = Join-Path $RuntimeDir "startup-runner-status.json"
$RunnerLockPath = Join-Path $RuntimeDir "startup-runner.lock"

if (-not (Test-Path $AccountStatePath)) { throw "Account-mode state not found: $AccountStatePath" }
$accountState = Get-Content -LiteralPath $AccountStatePath -Raw | ConvertFrom-Json
if ([int]$accountState.version -ne 1) { throw "Account-mode state version must be 1." }
$stateMode = ConvertTo-Phase7CAccountMode ([string]$accountState.accountMode)
if ($stateMode -ne $ExpectedAccountMode) { throw "Account-mode state mismatch. Expected=$ExpectedAccountMode Actual=$stateMode" }
$liveEnabled = [bool]$accountState.liveExecutionEnabled
if ($ExpectedAccountMode -eq "DEMO" -and $liveEnabled) { throw "DEMO state cannot have liveExecutionEnabled=true." }
if ($ExpectedAccountMode -eq "LIVE" -and -not $liveEnabled) { throw "LIVE state requires liveExecutionEnabled=true." }

if ([string]::IsNullOrWhiteSpace($EnvFile)) { $EnvFile = [string]$accountState.envFile }
if (-not [System.IO.Path]::IsPathRooted($EnvFile)) { $EnvFile = Join-Path $ProjectRoot $EnvFile }
$envInfo = Assert-Phase7CAccountEnv -EnvFile $EnvFile -AccountMode $ExpectedAccountMode -RequireTrading
$EnvFile = $envInfo.envFile
Write-Host "PHASE7C_ACCOUNT_VERIFY_EXPECTED_MODE=$ExpectedAccountMode"
Write-Host "PHASE7C_ACCOUNT_VERIFY_STATE=PASS"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
$actions = @($task.Actions)
$actionText = if ($actions.Count -eq 1) { "$($actions[0].Execute) $($actions[0].Arguments)" } else { "MULTIPLE_ACTIONS" }
$startupRunner = $actions.Count -eq 1 -and $actionText -like "*run-phase7c-executor-task-runner-local.ps1*"
Write-Host "PHASE7C_ACCOUNT_VERIFY_TASK_STATE=$($task.State)"
Write-Host "PHASE7C_ACCOUNT_VERIFY_TASK_STARTUP_RUNNER=$startupRunner"
if (-not $startupRunner) { throw "Executor Scheduled Task is not using the verified startup runner." }
if ($task.State -ne "Running") { throw "Executor Scheduled Task must be Running. Actual=$($task.State)" }

if (-not (Test-Path $TaskConfigPath)) { throw "Executor task config not found: $TaskConfigPath" }
$taskConfig = Get-Content -LiteralPath $TaskConfigPath -Raw | ConvertFrom-Json
if ([int]$taskConfig.version -ne 2) { throw "Dual-account runtime requires executor task config version 2." }
if ((ConvertTo-Phase7CAccountMode ([string]$taskConfig.accountMode)) -ne $ExpectedAccountMode) { throw "Executor task config accountMode mismatch." }
if ([bool]$taskConfig.armed -ne $true) { throw "Executor task config must remain armed=true." }
if ($ExpectedAccountMode -eq "LIVE" -and -not [bool]$taskConfig.liveExecutionEnabled) { throw "LIVE executor task config is not explicitly enabled." }
if ($ExpectedAccountMode -eq "DEMO" -and [bool]$taskConfig.liveExecutionEnabled) { throw "DEMO executor task config cannot have LIVE enabled." }

function Read-PidStatus([string]$Name) {
  $path = Join-Path $RuntimeDir "$Name.pid"
  if (-not (Test-Path $path)) { return [pscustomobject]@{ pid = $null; alive = $false } }
  try {
    $pidValue = [int](Get-Content -LiteralPath $path -Raw).Trim()
    return [pscustomobject]@{ pid = $pidValue; alive = $null -ne (Get-Process -Id $pidValue -ErrorAction SilentlyContinue) }
  } catch { return [pscustomobject]@{ pid = $null; alive = $false } }
}
$pidStatuses = @{}
foreach ($name in @("supervisor", "trend", "sideway", "telegram-mode", "regime-notifier")) {
  $status = Read-PidStatus $name
  $pidStatuses[$name] = $status
  $label = $name.ToUpper().Replace("-", "_")
  Write-Host "PHASE7C_ACCOUNT_VERIFY_${label}_PID=$($status.pid)"
  Write-Host "PHASE7C_ACCOUNT_VERIFY_${label}_ALIVE=$($status.alive)"
}
foreach ($required in @("supervisor", "trend", "sideway")) {
  if (-not $pidStatuses[$required].alive) { throw "Required Phase7C process is not alive: $required" }
}

if (-not (Test-Path $RunnerStatusPath)) { throw "Startup runner status not found." }
$runnerStatus = Get-Content -LiteralPath $RunnerStatusPath -Raw | ConvertFrom-Json
if ((ConvertTo-Phase7CAccountMode ([string]$runnerStatus.accountMode)) -ne $ExpectedAccountMode) { throw "Startup runner accountMode mismatch." }
$runnerPid = [int]$runnerStatus.runnerPid
if ($null -eq (Get-Process -Id $runnerPid -ErrorAction SilentlyContinue)) { throw "Startup runner status PID is not alive." }
$runnerAgeMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - [long]$runnerStatus.updatedAt
if ($runnerAgeMs -lt -10000 -or $runnerAgeMs -gt 60000) { throw "Startup runner status is stale. ageMs=$runnerAgeMs" }

$probe = $null
$lockHeld = $false
try {
  $probe = [System.IO.File]::Open($RunnerLockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
} catch [System.IO.IOException] { $lockHeld = $true }
finally { if ($null -ne $probe) { $probe.Dispose() } }
Write-Host "PHASE7C_ACCOUNT_VERIFY_STARTUP_RUNNER_LOCK_HELD=$lockHeld"
if (-not $lockHeld) { throw "Startup runner singleton lock is not held." }

$telegramConfigured = $false
if (-not [System.IO.Path]::IsPathRooted($TelegramEnvFile)) { $TelegramEnvFile = Join-Path $ProjectRoot $TelegramEnvFile }
if (Test-Path $TelegramEnvFile) {
  $token = Get-Phase7CEnvValue $TelegramEnvFile "ZIQ_TELEGRAM_BOT_TOKEN"
  $chat = Get-Phase7CEnvValue $TelegramEnvFile "ZIQ_TELEGRAM_CHAT_ID"
  $telegramConfigured = -not [string]::IsNullOrWhiteSpace($token) -and -not [string]::IsNullOrWhiteSpace($chat)
}
$telegramReady = $false
$telegramStatusPath = Join-Path $RuntimeDir "telegram-mode-status.json"
if ($telegramConfigured -and (Test-Path $telegramStatusPath)) {
  try {
    $telegramRuntime = Get-Content -LiteralPath $telegramStatusPath -Raw | ConvertFrom-Json
    $age = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - [long]$telegramRuntime.lastTelegramSuccessAt
    $telegramReady = [bool]$telegramRuntime.ready -and $age -ge -10000 -and $age -le 60000
    Write-Host "PHASE7C_ACCOUNT_VERIFY_TELEGRAM_RUNTIME_STATUS=$($telegramRuntime.status)"
    Write-Host "PHASE7C_ACCOUNT_VERIFY_TELEGRAM_HEARTBEAT_AGE_MS=$age"
  } catch { $telegramReady = $false }
}
Write-Host "PHASE7C_ACCOUNT_VERIFY_TELEGRAM_CONFIGURED=$telegramConfigured"
Write-Host "PHASE7C_ACCOUNT_VERIFY_TELEGRAM_READY=$telegramReady"
if ($RequireTelegram -and (-not $telegramConfigured -or -not $pidStatuses["telegram-mode"].alive -or -not $pidStatuses["regime-notifier"].alive -or -not $telegramReady)) {
  throw "Telegram verification failed or is not ready/fresh."
}

$apiBase = $ControlApiUrl.TrimEnd('/')
$mode = Invoke-RestMethod -Uri "$apiBase/api/v1/phase7c/bot-mode" -Method Get -TimeoutSec 5
$lotSettings = Invoke-RestMethod -Uri "$apiBase/api/v1/phase7c/lot-settings" -Method Get -TimeoutSec 5
$regime = Invoke-RestMethod -Uri "$apiBase/api/v1/phase7c/live-regime?symbol=XAUUSD&count=320" -Method Get -TimeoutSec 10
$decision = Invoke-RestMethod -Uri "$apiBase/api/v1/phase7c/decision-monitor?symbol=XAUUSD" -Method Get -TimeoutSec 10
$mt5Panel = Invoke-WebRequest -Uri "$apiBase/api/v1/phase7c/decision-monitor/mt5?symbol=XAUUSD" -UseBasicParsing -TimeoutSec 10
$riskPercent = ([double]$lotSettings.state.sidewayRiskPercent).ToString([System.Globalization.CultureInfo]::InvariantCulture)
$maxLot = ([double]$lotSettings.state.sidewayMaxLot).ToString([System.Globalization.CultureInfo]::InvariantCulture)
$autoLot = Invoke-RestMethod -Uri "$apiBase/api/v1/phase7c/auto-lot-preview?stopDistance=5&riskPercent=$riskPercent&maxLot=$maxLot" -Method Get -TimeoutSec 10
Write-Host "PHASE7C_ACCOUNT_VERIFY_ACTIVE_MODE=$($mode.state.mode)"
Write-Host "PHASE7C_ACCOUNT_VERIFY_TREND_FIXED_LOT=$($lotSettings.state.trendFixedLot)"
Write-Host "PHASE7C_ACCOUNT_VERIFY_SIDEWAY_RISK_PERCENT=$($lotSettings.state.sidewayRiskPercent)"
Write-Host "PHASE7C_ACCOUNT_VERIFY_SIDEWAY_MAX_LOT=$($lotSettings.state.sidewayMaxLot)"
Write-Host "PHASE7C_ACCOUNT_VERIFY_REGIME=$($regime.regime)"
Write-Host "PHASE7C_ACCOUNT_VERIFY_DECISION_STRATEGY=$($decision.preTrade.strategy)"
Write-Host "PHASE7C_ACCOUNT_VERIFY_DECISION_STAGE=$($decision.preTrade.stage)"
if ($decision.source -ne "PHASE7C_CANONICAL_DECISION_OBSERVABILITY") { throw "Decision monitor source is invalid." }
if ($decision.safety.mt5PanelOrderPermission -ne "NONE" -or $mt5Panel.Content -notmatch '(?m)^mt5OrderPermission=NONE\r?$') { throw "MT5 decision panel read-only safety marker is missing." }
$expectedDemoOnly = $ExpectedAccountMode -eq "DEMO"
if ([bool]$decision.safety.demoOnly -ne $expectedDemoOnly) { throw "Decision monitor demoOnly marker does not match account mode." }
if ([string]$decision.account.accountMode -ne $ExpectedBrokerMode) { throw "Decision monitor account mode does not match target." }

$headers = @{ "x-mt5-api-key" = $envInfo.apiKey }
$bridgeBase = "http://$($envInfo.bridgeHost):$($envInfo.bridgePort)"
$health = Invoke-RestMethod -Uri "$bridgeBase/health" -Headers $headers -Method Get -TimeoutSec 5
if (-not $health.connected -or $health.status -ne "ok") { throw "MT5 bridge is not healthy/connected." }
if ([string]$health.accountMode -ne $ExpectedBrokerMode) { throw "Broker account mode mismatch. Expected=$ExpectedBrokerMode Actual=$($health.accountMode)" }
if (-not [bool]$health.tradingEnabled) { throw "MT5 bridge trading is disabled." }
$login = [long]$health.accountLogin
if ($envInfo.allowedLogins -notcontains $login) { throw "Connected MT5 login is not in the selected account allowlist." }
$positions = @(Invoke-RestMethod -Uri "$bridgeBase/v1/positions?symbol=XAUUSD" -Headers $headers -Method Get -TimeoutSec 5)
$spec = Invoke-RestMethod -Uri "$bridgeBase/v1/symbols/XAUUSD/spec" -Headers $headers -Method Get -TimeoutSec 5
Write-Host "PHASE7C_ACCOUNT_VERIFY_BROKER_MODE=$($health.accountMode)"
Write-Host "PHASE7C_ACCOUNT_VERIFY_TRADING_ENABLED=$($health.tradingEnabled)"
Write-Host "PHASE7C_ACCOUNT_VERIFY_LOGIN_ALLOWLIST=PASS"
Write-Host "PHASE7C_ACCOUNT_VERIFY_XAUUSD_POSITIONS=$($positions.Count)"
if ($positions.Count -gt 1) { throw "Phase7C requires at most one XAUUSD position." }

if ([string]$autoLot.account.mode -ne $ExpectedBrokerMode) { throw "Auto Lot preview account mode does not match target." }
if ([string]$autoLot.broker.symbol -ne [string]$spec.brokerSymbol) { throw "Auto Lot broker symbol mismatch." }
if ([bool]$autoLot.safety.executionMutation -ne $false) { throw "Auto Lot preview must remain read-only." }
$autoAge = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - [long]$autoLot.generatedAt
if ($autoAge -lt -10000 -or $autoAge -gt 30000) { throw "Auto Lot preview is stale." }
Write-Host "PHASE7C_ACCOUNT_VERIFY_AUTO_LOT_SAFETY=PASS"

if ($ExpectedAccountMode -eq "LIVE") {
  $TrendStatePath = Join-Path $WorkDir "phase7b-live-forward\phase7b-demo-state.json"
  $SidewayStatePath = Join-Path $WorkDir "phase7c-sideway-live-forward\phase7c-sideway-state.json"
} else {
  $TrendStatePath = Join-Path $WorkDir "phase7b-demo-forward\phase7b-demo-state.json"
  $SidewayStatePath = Join-Path $WorkDir "phase7c-sideway-forward\phase7c-sideway-state.json"
}
function Read-State([string]$Path) {
  if (-not (Test-Path $Path)) { return $null }
  return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}
function State-Ticket($State) {
  if ($null -eq $State -or $null -eq $State.managed -or [string]::IsNullOrWhiteSpace([string]$State.managed.ticket)) { return "" }
  return [string]$State.managed.ticket
}
$trendState = Read-State $TrendStatePath
$sidewayState = Read-State $SidewayStatePath
foreach ($item in @([pscustomobject]@{ state = $trendState; label = "Trend" }, [pscustomobject]@{ state = $sidewayState; label = "Sideway" })) {
  if ($null -ne $item.state -and $null -ne $item.state.accountLogin -and [long]$item.state.accountLogin -gt 0 -and [long]$item.state.accountLogin -ne $login) {
    throw "$($item.label) runtime state belongs to another MT5 account."
  }
}
$trendTicket = State-Ticket $trendState
$sidewayTicket = State-Ticket $sidewayState
$sidewayPending = if ($null -ne $sidewayState) { $sidewayState.pendingEntry } else { $null }
Write-Host "PHASE7C_ACCOUNT_VERIFY_TREND_MANAGED_TICKET=$(if ($trendTicket) { $trendTicket } else { 'NONE' })"
Write-Host "PHASE7C_ACCOUNT_VERIFY_SIDEWAY_MANAGED_TICKET=$(if ($sidewayTicket) { $sidewayTicket } else { 'NONE' })"
Write-Host "PHASE7C_ACCOUNT_VERIFY_SIDEWAY_PENDING_ORDER=$(if ($null -ne $sidewayPending) { [string]$sidewayPending.orderId } else { 'NONE' })"
if ($trendTicket -and $sidewayTicket) { throw "Trend and Sideway both claim managed position state." }
if ($trendTicket -and $null -ne $sidewayPending) { throw "Trend managed state conflicts with Sideway pending entry." }

if ($positions.Count -eq 0 -and ($trendTicket -or $sidewayTicket -or $null -ne $sidewayPending)) {
  throw "Runtime state is not flat while broker has zero positions; reconcile before switching/arming."
}
if ($positions.Count -eq 1) {
  $brokerTicket = [string]$positions[0].ticket
  if ($brokerTicket -ne $trendTicket -and $brokerTicket -ne $sidewayTicket) {
    throw "Open XAUUSD position is not safely owned by the selected account runtime state."
  }
}
$executionLock = Test-Path (Join-Path $RuntimeDir "phase7c-execution.lock")
Write-Host "PHASE7C_ACCOUNT_VERIFY_EXECUTION_LOCK_PRESENT=$executionLock"
Write-Host "PHASE7C_ACCOUNT_VERIFY_OWNERSHIP=PASS"
Write-Host "PHASE7C_ACCOUNT_VERIFY_STATUS=PASS"
