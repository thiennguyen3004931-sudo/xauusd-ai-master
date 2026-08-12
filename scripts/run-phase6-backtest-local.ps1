param(
  [Parameter(Mandatory = $true)]
  [string]$WorkDir,

  [decimal]$MaxRiskUsd = 10,
  [string]$FrozenDir = ""
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WorkDir = (Resolve-Path $WorkDir).Path
$Runner = Join-Path $WorkDir "canonical_replay.ts"
$Hook = Join-Path $PSScriptRoot "apply-phase6-m15-trend-engulfing-hook.mjs"

if (-not (Test-Path $Runner)) {
  throw "Canonical replay runner not found: $Runner"
}
if (-not (Test-Path $Hook)) {
  throw "Phase 6 hook not found: $Hook"
}

if ([string]::IsNullOrWhiteSpace($FrozenDir)) {
  $latestFrozen = Get-ChildItem $WorkDir -Directory -Filter "frozen-*" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($null -eq $latestFrozen) {
    throw "No frozen Phase 4 dataset found under $WorkDir."
  }
  $FrozenDir = $latestFrozen.FullName
}
$FrozenDir = (Resolve-Path $FrozenDir).Path

$m15 = Join-Path $FrozenDir "phase4-m15.json"
$m5 = Join-Path $FrozenDir "phase4-m5.json"
$meta = Join-Path $FrozenDir "phase4-meta.json"
foreach ($required in @($m15, $m5, $meta)) {
  if (-not (Test-Path $required)) {
    throw "Required frozen Phase 6 input not found: $required"
  }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $WorkDir "phase6-backtests\$stamp"
New-Item -ItemType Directory -Path $runDir -Force | Out-Null
$consoleLog = Join-Path $runDir "phase6-console.log"
$resultJson = Join-Path $runDir "phase6-replay-result.json"

$env:ZIQ_M15_JSON = $m15
$env:ZIQ_M5_JSON = $m5
$env:ZIQ_META_JSON = $meta
$env:ZIQ_RESULT_JSON = $resultJson
$env:ZIQ_DAYS = "180"
$env:ZIQ_MAX_RISK_USD = [string]$MaxRiskUsd

Write-Host "PHASE6_BACKTEST_RUN_DIR=$runDir"
Write-Host "PHASE6_BACKTEST_FROZEN_DIR=$FrozenDir"
Write-Host "PHASE6_BACKTEST_MAX_RISK_USD=$MaxRiskUsd"
Write-Host "PHASE6_BACKTEST_HOOK_START"

& node $Hook $Runner
$hookExit = $LASTEXITCODE
if ($hookExit -ne 0) {
  $runnerText = Get-Content $Runner -Raw
  $phase6AlreadyInserted =
    $runnerText.Contains("const phase6M15TrendEngulfingService = new Phase6M15TrendEngulfingService();") -and
    $runnerText.Contains("phase6M15TrendEngulfingService.format(phase6M15TrendEngulfingResult)")

  if ($phase6AlreadyInserted) {
    Write-Host "PHASE6_BACKTEST_HOOK_RECOVERY=PASS"
    Write-Host "PHASE6_BACKTEST_HOOK_NOTE=HOOK_EXIT_NONZERO_BUT_PHASE6_BLOCK_ALREADY_PRESENT"
  }
  else {
    throw "Phase 6 replay hook failed with exit code $hookExit and Phase 6 block is not present in canonical_replay.ts"
  }
}
else {
  Write-Host "PHASE6_BACKTEST_HOOK_STATUS=PASS"
}

Push-Location $ProjectRoot
try {
  Write-Host "PHASE6_BACKTEST_BUILD_START"
  & pnpm --filter @xauusd/risk-engine build
  if ($LASTEXITCODE -ne 0) {
    throw "Phase 6 risk-engine build failed with exit code $LASTEXITCODE"
  }
  Write-Host "PHASE6_BACKTEST_BUILD_STATUS=PASS"

  Write-Host "PHASE6_BACKTEST_REPLAY_START"
  & pnpm exec tsx $Runner 2>&1 | Tee-Object $consoleLog | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Phase 6 canonical replay failed with exit code $LASTEXITCODE"
  }
}
finally {
  Pop-Location
}

Write-Host "PHASE6_BACKTEST_REPLAY_STATUS=PASS"
Write-Host "PHASE6_BACKTEST_LOG=$consoleLog"
Write-Host "PHASE6_BACKTEST_RESULT_BEGIN"
$phase6Lines = Select-String -Path $consoleLog -Pattern "^PHASE6_" | ForEach-Object { $_.Line }
if ($phase6Lines.Count -eq 0) {
  throw "Replay completed but emitted no PHASE6_* lines."
}
$phase6Lines | ForEach-Object { Write-Host $_ }
Write-Host "PHASE6_BACKTEST_RESULT_END"
Write-Host "PHASE6_BACKTEST_STATUS=PASS"
