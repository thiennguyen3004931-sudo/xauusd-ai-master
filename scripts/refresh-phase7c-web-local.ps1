param(
  [int]$ApiPort = 3711,
  [int]$WebPort = 5717,
  [string]$WebTaskName = "XAUUSD-Phase7B-Web"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "PHASE7C_WEB_REFRESH=START"
Write-Host "PHASE7C_WEB_REFRESH_SCOPE=WEB_API_ONLY"
Write-Host "PHASE7C_WEB_REFRESH_BOT_MUTATION=false"
Write-Host "PHASE7C_WEB_REFRESH_BRIDGE_MUTATION=false"
Write-Host "PHASE7C_WEB_REFRESH_TELEGRAM_MUTATION=false"

Write-Host "PHASE7C_WEB_REFRESH_API_BUILD=START"
pnpm --filter @xauusd/api build
if ($LASTEXITCODE -ne 0) { throw "Phase 7C API build failed." }
Write-Host "PHASE7C_WEB_REFRESH_API_BUILD=PASS"

Write-Host "PHASE7C_WEB_REFRESH_WEB_BUILD=START"
pnpm --filter @xauusd/web build
if ($LASTEXITCODE -ne 0) { throw "Phase 7C Web build failed." }
Write-Host "PHASE7C_WEB_REFRESH_WEB_BUILD=PASS"

$task = Get-ScheduledTask -TaskName $WebTaskName -ErrorAction SilentlyContinue
if (-not $task) { throw "Scheduled Task '$WebTaskName' was not found." }

Stop-ScheduledTask -TaskName $WebTaskName -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$listenerPids = Get-NetTCPConnection -LocalPort @($ApiPort, $WebPort) -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
foreach ($processId in $listenerPids) {
  if ($processId -gt 0) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
}

Start-ScheduledTask -TaskName $WebTaskName

$apiReady = $false
$webReady = $false
for ($attempt = 1; $attempt -le 40; $attempt++) {
  Start-Sleep -Milliseconds 500
  if (-not $apiReady) {
    try {
      $demo = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/v1/phase7b-demo" -Method Get -TimeoutSec 2
      if ($demo) { $apiReady = $true }
    } catch {}
  }
  if (-not $webReady) {
    try {
      $response = Invoke-WebRequest -Uri "http://127.0.0.1:$WebPort/" -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) { $webReady = $true }
    } catch {}
  }
  if ($apiReady -and $webReady) { break }
}

if (-not $apiReady -or -not $webReady) {
  throw "Phase 7C web refresh self-test failed. API=$apiReady WEB=$webReady"
}

$risk = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/v1/phase7c/account-risk?riskPercent=0.25&maxLot=0.03" -Method Get -TimeoutSec 5
$preview = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/v1/phase7c/auto-lot-preview?stopDistance=8&riskPercent=0.25&maxLot=0.03" -Method Get -TimeoutSec 5
$demo = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/api/v1/phase7b-demo" -Method Get -TimeoutSec 5

$toDate = (Get-Date).ToString("yyyy-MM-dd")
$fromDate = (Get-Date).AddDays(-6).ToString("yyyy-MM-dd")
$compareBody = @{
  from = $fromDate
  to = $toDate
  fixedVolume = 0.03
  riskPercent = 0.25
  maxAutoLot = 0.03
} | ConvertTo-Json
$autoCompare = Invoke-RestMethod `
  -Uri "http://127.0.0.1:$ApiPort/api/v1/phase7c/auto-lot-backtest" `
  -Method Post `
  -ContentType "application/json" `
  -Body $compareBody `
  -TimeoutSec 90

if ($autoCompare.source -ne "PHASE7C_AUTO_LOT_SHADOW_COMPARISON") {
  throw "Phase 7C Auto Lot comparison self-test returned an unexpected source."
}
if ($autoCompare.safety.executionMutation -ne $false) {
  throw "Phase 7C Auto Lot comparison unexpectedly allows execution mutation."
}

Write-Host "PHASE7C_WEB_REFRESH_API=PASS"
Write-Host "PHASE7C_WEB_REFRESH_WEB=PASS"
Write-Host "PHASE7C_WEB_REFRESH_BOT_STATUS=$($demo.botStatus)"
Write-Host "PHASE7C_WEB_REFRESH_ACCOUNT_LOGIN=$($risk.account.accountLogin)"
Write-Host "PHASE7C_WEB_REFRESH_SERVER=$($risk.account.server)"
Write-Host "PHASE7C_WEB_REFRESH_AUTO_LOT_MODE=$($preview.safety.mode)"
Write-Host "PHASE7C_WEB_REFRESH_AUTO_LOT_EXECUTION_MUTATION=$($preview.safety.executionMutation)"
Write-Host "PHASE7C_WEB_REFRESH_FIXED_VOLUME_UNCHANGED=$($preview.safety.phase7bFixedVolumeUnchanged)"
Write-Host "PHASE7C_WEB_REFRESH_AUTO_LOT_BACKTEST=PASS"
Write-Host "PHASE7C_WEB_REFRESH_AUTO_LOT_ATTEMPTED=$($autoCompare.autoLot.attemptedTrades)"
Write-Host "PHASE7C_WEB_REFRESH_AUTO_LOT_EXECUTED=$($autoCompare.autoLot.executedTrades)"
Write-Host "PHASE7C_WEB_REFRESH_AUTO_LOT_BLOCKED=$($autoCompare.autoLot.blockedTrades)"
Write-Host "PHASE7C_WEB_REFRESH_CONTROL_CENTER=http://127.0.0.1:$WebPort/"
Write-Host "PHASE7C_WEB_REFRESH_BACKTEST=http://127.0.0.1:$WebPort/phase7c-backtest"
Write-Host "PHASE7C_WEB_REFRESH_AUTO_LOT_COMPARE=http://127.0.0.1:$WebPort/phase7c-auto-lot"
Write-Host "PHASE7C_WEB_REFRESH_RISK=http://127.0.0.1:$WebPort/phase7c-risk"
Write-Host "PHASE7C_WEB_REFRESH_STATUS=PASS"
