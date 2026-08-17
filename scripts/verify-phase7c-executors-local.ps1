param(
  [Parameter(Mandatory = $true)] [string]$WorkDir,
  [string]$TaskName = "XAUUSD-Phase7B-Bot",
  [string]$ControlApiUrl = "http://127.0.0.1:3711",
  [string]$EnvFile = "packages/mt5-broker/bridge/.env.phase7b-demo",
  [string]$TelegramEnvFile = ".env.phase7b-telegram",
  [switch]$RequireMigratedTask,
  [switch]$RequireTelegram
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not [System.IO.Path]::IsPathRooted($WorkDir)) { $WorkDir = Join-Path $ProjectRoot $WorkDir }
if (-not (Test-Path $WorkDir)) { throw "WorkDir not found: $WorkDir" }
$WorkDir = (Resolve-Path $WorkDir).Path
if (-not [System.IO.Path]::IsPathRooted($EnvFile)) { $EnvFile = Join-Path $ProjectRoot $EnvFile }
if (-not (Test-Path $EnvFile)) { throw "EnvFile not found: $EnvFile" }
$EnvFile = (Resolve-Path $EnvFile).Path
if (-not [System.IO.Path]::IsPathRooted($TelegramEnvFile)) { $TelegramEnvFile = Join-Path $ProjectRoot $TelegramEnvFile }
if (Test-Path $TelegramEnvFile) { $TelegramEnvFile = (Resolve-Path $TelegramEnvFile).Path }
$RuntimeDir = Join-Path $WorkDir "phase7c-executors"
$TrendStatePath = Join-Path $WorkDir "phase7b-demo-forward\phase7b-demo-state.json"
$SidewayStatePath = Join-Path $WorkDir "phase7c-sideway-forward\phase7c-sideway-state.json"
$TelegramModeStatusPath = Join-Path $RuntimeDir "telegram-mode-status.json"

function Read-EnvValueFromFile([string]$Path, [string]$Name) {
  if (-not (Test-Path $Path)) { return "" }
  foreach ($raw in Get-Content -LiteralPath $Path) {
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

function Read-EnvValue([string]$Name) {
  return Read-EnvValueFromFile $EnvFile $Name
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

function Read-StateJson([string]$Path, [string]$Label) {
  if (-not (Test-Path $Path)) { return $null }
  try {
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  } catch {
    throw "Cannot parse $Label state: $Path. $($_.Exception.Message)"
  }
}

function State-Ticket($State) {
  if ($null -eq $State -or $null -eq $State.managed -or [string]::IsNullOrWhiteSpace([string]$State.managed.ticket)) {
    return ""
  }
  return [string]$State.managed.ticket
}

function Assert-StateAccount($State, [string]$Label, [long]$AccountLogin) {
  if ($null -eq $State -or $null -eq $State.accountLogin) { return }
  $stateLogin = [long]$State.accountLogin
  if ($stateLogin -gt 0 -and $stateLogin -ne $AccountLogin) {
    throw "$Label state belongs to account $stateLogin but MT5 is $AccountLogin."
  }
}

function Test-PendingMatchesPosition($Pending, $Position, $Spec) {
  if ($null -eq $Pending -or $null -eq $Position -or $null -eq $Spec) { return $false }
  $expectedSide = if ([string]$Pending.side -eq "BUY") { "LONG" } elseif ([string]$Pending.side -eq "SELL") { "SHORT" } else { "" }
  if (-not $expectedSide -or [string]$Position.side -ne $expectedSide) { return $false }

  $volumeStep = [double]$Spec.volumeStep
  $point = [double]$Spec.point
  if ($volumeStep -le 0 -or $point -le 0) { return $false }
  if ([math]::Abs([double]$Position.volume - [double]$Pending.volume) -gt ($volumeStep / 2.0 + 1e-9)) { return $false }

  $priceTolerance = [math]::Max($point * 2.0, 0.000001)
  if ([math]::Abs([double]$Position.stopLoss - [double]$Pending.stopLoss) -gt $priceTolerance) { return $false }
  if ([math]::Abs([double]$Position.takeProfit - [double]$Pending.tp2) -gt $priceTolerance) { return $false }

  $createdAt = [double]$Pending.createdAt
  $openedAt = [double]$Position.openedAt
  $nowMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  if ($createdAt -le 0 -or $openedAt -le 0) { return $false }
  if ($openedAt -lt ($createdAt - 120000) -or $openedAt -gt ($nowMs + 10000)) { return $false }
  return $true
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -eq $task) {
  Write-Host "PHASE7C_VERIFY_TASK=NOT_FOUND"
  if ($RequireMigratedTask) { throw "Required executor task not found: $TaskName" }
} else {
  $actions = @($task.Actions)
  $actionText = if ($actions.Count -eq 1) { "$($actions[0].Execute) $($actions[0].Arguments)" } else { "MULTIPLE_ACTIONS" }
  $directSupervisor = $actions.Count -eq 1 -and $actionText -like "*run-phase7c-executors-local.ps1*" -and $actionText -like "*-Armed*"
  $startupRunner = $actions.Count -eq 1 -and $actionText -like "*run-phase7c-executor-task-runner-local.ps1*"
  $migrated = $directSupervisor -or $startupRunner
  Write-Host "PHASE7C_VERIFY_TASK_STATE=$($task.State)"
  Write-Host "PHASE7C_VERIFY_TASK_MIGRATED=$migrated"
  Write-Host "PHASE7C_VERIFY_TASK_STARTUP_RUNNER=$startupRunner"
  if ($RequireMigratedTask -and -not $migrated) { throw "Scheduled task $TaskName is not migrated to a verified Phase 7C executor action." }
  if (-not $migrated -and $task.State -eq "Running") { throw "Raw/unverified legacy bot task is running. Stop it before Phase 7C execution." }
}

$telegramToken = Read-EnvValueFromFile $TelegramEnvFile "ZIQ_TELEGRAM_BOT_TOKEN"
$telegramChatId = Read-EnvValueFromFile $TelegramEnvFile "ZIQ_TELEGRAM_CHAT_ID"
$telegramConfigured = (Test-Path $TelegramEnvFile) -and -not [string]::IsNullOrWhiteSpace($telegramToken) -and -not [string]::IsNullOrWhiteSpace($telegramChatId)
Write-Host "PHASE7C_VERIFY_TELEGRAM_CONFIGURED=$telegramConfigured"
if ($RequireTelegram -and -not $telegramConfigured) {
  throw "Telegram verification was required, but $TelegramEnvFile is missing or incomplete."
}

$pidStatuses = @{}
foreach ($name in @("supervisor", "trend", "sideway", "telegram-mode", "regime-notifier")) {
  $status = Read-PidStatus $name
  $pidStatuses[$name] = $status
  $label = $name.ToUpper().Replace("-", "_")
  Write-Host "PHASE7C_VERIFY_${label}_PID=$($status.pid)"
  Write-Host "PHASE7C_VERIFY_${label}_ALIVE=$($status.alive)"
}

$telegramModeReady = $false
$telegramModeStatus = "MISSING"
$telegramModeHeartbeatAgeMs = $null
if (Test-Path $TelegramModeStatusPath) {
  try {
    $telegramRuntime = Get-Content -LiteralPath $TelegramModeStatusPath -Raw | ConvertFrom-Json
    $telegramModeStatus = [string]$telegramRuntime.status
    if ($null -ne $telegramRuntime.lastTelegramSuccessAt) {
      $telegramModeHeartbeatAgeMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - [long]$telegramRuntime.lastTelegramSuccessAt
    }
    $telegramModeReady = [bool]$telegramRuntime.ready -and
      $null -ne $telegramModeHeartbeatAgeMs -and
      $telegramModeHeartbeatAgeMs -ge -10000 -and
      $telegramModeHeartbeatAgeMs -le 60000
  } catch {
    $telegramModeStatus = "INVALID_STATUS_FILE"
  }
}
Write-Host "PHASE7C_VERIFY_TELEGRAM_MODE_READY=$telegramModeReady"
Write-Host "PHASE7C_VERIFY_TELEGRAM_MODE_RUNTIME_STATUS=$telegramModeStatus"
Write-Host "PHASE7C_VERIFY_TELEGRAM_MODE_HEARTBEAT_AGE_MS=$telegramModeHeartbeatAgeMs"

if ($RequireTelegram -and (-not $pidStatuses["telegram-mode"].alive -or -not $pidStatuses["regime-notifier"].alive)) {
  throw "Telegram verification requires both telegram-mode and regime-notifier processes to be alive."
}
if ($RequireTelegram -and -not $telegramModeReady) {
  throw "Telegram mode controller process is alive but not ready/fresh. Check phase7c-executors\telegram-mode.err.log and telegram-mode-status.json."
}

$apiBase = $ControlApiUrl.TrimEnd('/')
$mode = Invoke-RestMethod -Uri "$apiBase/api/v1/phase7c/bot-mode" -Method Get -TimeoutSec 5
$regime = Invoke-RestMethod -Uri "$apiBase/api/v1/phase7c/live-regime?symbol=XAUUSD&count=320" -Method Get -TimeoutSec 10
$autoLot = Invoke-RestMethod -Uri "$apiBase/api/v1/phase7c/auto-lot-preview?stopDistance=5&riskPercent=0.25&maxLot=0.03" -Method Get -TimeoutSec 10
Write-Host "PHASE7C_VERIFY_ACTIVE_MODE=$($mode.state.mode)"
Write-Host "PHASE7C_VERIFY_REGIME=$($regime.regime)"
Write-Host "PHASE7C_VERIFY_RECOMMENDED_MODE=$($regime.recommendedMode)"
Write-Host "PHASE7C_VERIFY_REGIME_CONFIDENCE=$($regime.confidence)"
Write-Host "PHASE7C_VERIFY_HAS_SUPPLY_DEMAND_RANGE=$($null -ne $regime.supplyDemandRange)"
Write-Host "PHASE7C_VERIFY_AUTO_LOT_APPROVED=$($autoLot.preview.approved)"
Write-Host "PHASE7C_VERIFY_AUTO_LOT_RECOMMENDED=$($autoLot.preview.recommendedLot)"

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
$positionsResponse = Invoke-RestMethod -Uri "$bridgeBase/v1/positions?symbol=XAUUSD" -Headers $headers -Method Get -TimeoutSec 5
$positions = @($positionsResponse)
$spec = Invoke-RestMethod -Uri "$bridgeBase/v1/symbols/XAUUSD/spec" -Headers $headers -Method Get -TimeoutSec 5
Write-Host "PHASE7C_VERIFY_ACCOUNT_LOGIN=$($health.accountLogin)"
Write-Host "PHASE7C_VERIFY_ACCOUNT_MODE=$($health.accountMode)"
Write-Host "PHASE7C_VERIFY_TRADING_ENABLED=$($health.tradingEnabled)"
Write-Host "PHASE7C_VERIFY_XAUUSD_POSITIONS=$($positions.Count)"
if ($positions.Count -gt 1) { throw "Phase 7C requires at most one XAUUSD position; broker currently has $($positions.Count)." }

if ($autoLot.safety.executionMutation -ne $false -or $autoLot.safety.phase7bFixedVolumeUnchanged -ne $true) {
  throw "Phase 7C Auto Lot safety assertion failed."
}
if ([string]$autoLot.account.mode -ne "demo") {
  throw "Phase 7C Auto Lot response is not tied to a DEMO account."
}
if ([long]$autoLot.account.login -ne [long]$health.accountLogin) {
  throw "Phase 7C Auto Lot account login $($autoLot.account.login) does not match MT5 $($health.accountLogin)."
}
if ([string]$autoLot.broker.symbol -ne [string]$spec.brokerSymbol) {
  throw "Phase 7C Auto Lot broker symbol $($autoLot.broker.symbol) does not match MT5 spec $($spec.brokerSymbol)."
}
$autoLotAgeMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - [long]$autoLot.generatedAt
if ($autoLotAgeMs -lt -10000 -or $autoLotAgeMs -gt 30000) {
  throw "Phase 7C Auto Lot snapshot is stale/invalid. ageMs=$autoLotAgeMs"
}
Write-Host "PHASE7C_VERIFY_AUTO_LOT_ACCOUNT_LOGIN=$($autoLot.account.login)"
Write-Host "PHASE7C_VERIFY_AUTO_LOT_BROKER_SYMBOL=$($autoLot.broker.symbol)"
Write-Host "PHASE7C_VERIFY_AUTO_LOT_AGE_MS=$autoLotAgeMs"
Write-Host "PHASE7C_VERIFY_AUTO_LOT_SAFETY=PASS"

$trendState = Read-StateJson $TrendStatePath "Trend"
$sidewayState = Read-StateJson $SidewayStatePath "Sideway"
Assert-StateAccount $trendState "Trend" ([long]$health.accountLogin)
Assert-StateAccount $sidewayState "Sideway" ([long]$health.accountLogin)

$trendTicket = State-Ticket $trendState
$sidewayTicket = State-Ticket $sidewayState
$sidewayPending = if ($null -ne $sidewayState) { $sidewayState.pendingEntry } else { $null }
$pendingOrderId = if ($null -ne $sidewayPending) { [string]$sidewayPending.orderId } else { "" }

Write-Host "PHASE7C_VERIFY_TREND_MANAGED_TICKET=$(if ($trendTicket) { $trendTicket } else { 'NONE' })"
Write-Host "PHASE7C_VERIFY_SIDEWAY_MANAGED_TICKET=$(if ($sidewayTicket) { $sidewayTicket } else { 'NONE' })"
Write-Host "PHASE7C_VERIFY_SIDEWAY_PENDING_ORDER=$(if ($pendingOrderId) { $pendingOrderId } else { 'NONE' })"

if ($trendTicket -and $sidewayTicket) {
  throw "Ownership conflict: Trend and Sideway both have managed position state (Trend=$trendTicket Sideway=$sidewayTicket)."
}
if ($trendTicket -and $null -ne $sidewayPending) {
  throw "Ownership conflict: Trend has a managed ticket while Sideway has a durable pending entry."
}

$owner = "NONE"
if ($positions.Count -eq 1) {
  $position = $positions[0]
  $brokerTicket = [string]$position.ticket
  if ($trendTicket -eq $brokerTicket) {
    $owner = "TREND"
  } elseif ($sidewayTicket -eq $brokerTicket) {
    $owner = "SIDEWAY"
  } elseif ($null -ne $sidewayPending -and (Test-PendingMatchesPosition $sidewayPending $position $spec)) {
    $owner = "SIDEWAY_PENDING_RECOVERY"
  } else {
    throw "Orphan/unmanaged XAUUSD position $brokerTicket detected. Neither Trend nor Sideway state safely owns it."
  }
} elseif ($positions.Count -eq 0) {
  if ($trendTicket) {
    Write-Host "PHASE7C_VERIFY_TREND_STATE=STALE_MANAGED_TICKET_NO_BROKER_POSITION"
  }
  if ($sidewayTicket) {
    Write-Host "PHASE7C_VERIFY_SIDEWAY_STATE=STALE_MANAGED_TICKET_NO_BROKER_POSITION"
  }
  if ($null -ne $sidewayPending) {
    $pendingAgeMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - [long]$sidewayPending.createdAt
    Write-Host "PHASE7C_VERIFY_SIDEWAY_PENDING_AGE_MS=$pendingAgeMs"
    if ($pendingAgeMs -gt 300000) {
      throw "Sideway durable pending entry is older than 5 minutes but no broker position exists. Run the Sideway controller recovery cycle before arming."
    }
  }
}
Write-Host "PHASE7C_VERIFY_POSITION_OWNER=$owner"

$lockPath = Join-Path $RuntimeDir "phase7c-execution.lock"
Write-Host "PHASE7C_VERIFY_EXECUTION_LOCK_PRESENT=$(Test-Path $lockPath)"
Write-Host "PHASE7C_VERIFY_OWNERSHIP=PASS"
if ($telegramConfigured) {
  $telegramStatus = if ($pidStatuses["telegram-mode"].alive -and $pidStatuses["regime-notifier"].alive -and $telegramModeReady) { "PASS" } else { "DEGRADED_NON_FATAL" }
  Write-Host "PHASE7C_VERIFY_TELEGRAM_STATUS=$telegramStatus"
} else {
  Write-Host "PHASE7C_VERIFY_TELEGRAM_STATUS=NOT_CONFIGURED"
}
Write-Host "PHASE7C_VERIFY_STATUS=PASS"