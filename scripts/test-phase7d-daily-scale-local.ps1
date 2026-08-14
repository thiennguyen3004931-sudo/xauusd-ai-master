param(
  [int]$ApiPort = 3711
)

$ErrorActionPreference = "Stop"
$toDate = (Get-Date).ToString("yyyy-MM-dd")
$fromDate = (Get-Date).AddDays(-6).ToString("yyyy-MM-dd")

$body = @{
  from = $fromDate
  to = $toDate
  fixedVolume = 0.03
  recoveryMinPrice = 6
  recoveryMaxPrice = 10
  profitBufferUsd = 3
  positiveLockFloorUsd = 0
  dayUtcOffsetHours = 7
} | ConvertTo-Json

$r = Invoke-RestMethod `
  -Uri "http://127.0.0.1:$ApiPort/api/v1/phase7d/daily-scale-backtest" `
  -Method Post -ContentType "application/json" -Body $body -TimeoutSec 180

if ($r.source -ne "PHASE7D_DAILY_RECOVERY_TREND_SCALE_RESEARCH") { throw "Unexpected Phase 7D daily scale source." }
if ($r.replayMode -ne "EXACT_PER_LANE_SIGNAL_CONTENTION_WITH_M5_APPROXIMATION") { throw "Exact per-lane replay is not active." }
if ($r.safety.executionMutation -ne $false -or $r.safety.phase7bStrategyMutation -ne $false) { throw "Daily scale research unexpectedly allows strategy/execution mutation." }
if ($r.decision.executionEligible -ne $false) { throw "Daily scale research execution must remain disabled." }
if (-not $r.current -or -not $r.recoveryLockCurrent -or -not $r.scaleBe6 -or -not $r.scaleBe10) { throw "Daily scale lanes are incomplete." }
if ($r.configuration.recoveryStopPolicy -ne "STRUCTURAL_SL_UNTIL_DYNAMIC_FULL_TP") { throw "Recovery must keep structural SL until dynamic full TP." }
if ($r.recoveryLockCurrent.metrics.recoveryBeExits -ne 0 -or $r.scaleBe6.metrics.recoveryBeExits -ne 0 -or $r.scaleBe10.metrics.recoveryBeExits -ne 0) { throw "Recovery lane unexpectedly contains BE exits." }
if ([math]::Abs($r.configuration.firstPartialVolume - 0.01) -gt 0.000001) { throw "Expected +10 partial 0.01 lot for fixed 0.03." }
if ([math]::Abs($r.configuration.secondPartialVolume - 0.01) -gt 0.000001) { throw "Expected +20 partial 0.01 lot for fixed 0.03." }
if ([math]::Abs($r.configuration.finalRunnerVolume - 0.01) -gt 0.000001) { throw "Expected final runner 0.01 lot for fixed 0.03." }

Write-Host "PHASE7D_DAILY_SCALE_TEST=PASS"
Write-Host "PHASE7D_DAILY_SCALE_REPLAY=$($r.replayMode)"
Write-Host "PHASE7D_DAILY_SCALE_RECOVERY_STOP_POLICY=$($r.configuration.recoveryStopPolicy)"
Write-Host "PHASE7D_DAILY_SCALE_RECOVERY_BE_EXITS=$($r.recoveryLockCurrent.metrics.recoveryBeExits)"
Write-Host "PHASE7D_DAILY_SCALE_SIGNALS=$($r.configuration.signals)"
Write-Host "PHASE7D_DAILY_SCALE_CANDIDATES=$($r.configuration.filledCandidates)"
Write-Host "PHASE7D_DAILY_SCALE_CURRENT_NET=$($r.current.metrics.netPnl)"
Write-Host "PHASE7D_DAILY_SCALE_RECOVERY_LOCK_NET=$($r.recoveryLockCurrent.metrics.netPnl)"
Write-Host "PHASE7D_DAILY_SCALE_BE6_NET=$($r.scaleBe6.metrics.netPnl)"
Write-Host "PHASE7D_DAILY_SCALE_BE10_NET=$($r.scaleBe10.metrics.netPnl)"
Write-Host "PHASE7D_DAILY_SCALE_BE6_PLUS20_RATE=$($r.scaleBe6.metrics.plus20RatePercent)"
Write-Host "PHASE7D_DAILY_SCALE_BE10_PLUS20_RATE=$($r.scaleBe10.metrics.plus20RatePercent)"
Write-Host "PHASE7D_DAILY_SCALE_VERDICT=$($r.decision.verdict)"
Write-Host "PHASE7D_DAILY_SCALE_PREFERRED=$($r.decision.preferredResearchLane)"
Write-Host "PHASE7D_DAILY_SCALE_EXECUTION_ELIGIBLE=$($r.decision.executionEligible)"
