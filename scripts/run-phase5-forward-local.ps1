param(
  [Parameter(Mandatory = $true)]
  [string]$WorkDir,

  [int]$Days = 180,
  [decimal]$MaxRiskUsd = 10,
  [string]$PythonExe = "python",
  [string]$BridgeEnv = "",
  [string]$FrozenDir = ""
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WorkDir = (Resolve-Path $WorkDir).Path
$Exporter = Join-Path $WorkDir "extract_mt5_history.py"
$Runner = Join-Path $WorkDir "canonical_replay.ts"
$Merger = Join-Path $PSScriptRoot "merge-phase5-forward-dataset.mjs"
$RealCutoffUtc = "2026-08-12T12:45:00.000Z"
$PreRegisteredDatasetOffsetMs = 10800000 # +03:00 broker timestamp space on 2026-08-12
$AllowedObservedOffsetDeviationMs = 300000 # 5 minutes sanity tolerance

if ([string]::IsNullOrWhiteSpace($BridgeEnv)) {
  $bridgeEnvCandidates = @(
    $env:ZIQ_BRIDGE_ENV,
    (Join-Path $ProjectRoot "packages\mt5-broker\bridge\.env"),
    (Join-Path $ProjectRoot "packages\mt5-broker\bridge.env")
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

  $BridgeEnv = $bridgeEnvCandidates |
    Where-Object { Test-Path $_ } |
    Select-Object -First 1

  if ([string]::IsNullOrWhiteSpace($BridgeEnv)) {
    $searched = $bridgeEnvCandidates -join "; "
    throw "Required Phase 5 bridge env not found. Searched: $searched"
  }
}
$BridgeEnv = (Resolve-Path $BridgeEnv).Path

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

$FrozenM15 = Join-Path $FrozenDir "phase4-m15.json"
$FrozenM5 = Join-Path $FrozenDir "phase4-m5.json"
$FrozenMeta = Join-Path $FrozenDir "phase4-meta.json"

foreach ($required in @($Exporter, $Runner, $Merger, $BridgeEnv, $FrozenM15, $FrozenM5, $FrozenMeta)) {
  if (-not (Test-Path $required)) {
    throw "Required Phase 5 input not found: $required"
  }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $WorkDir "phase5-forward-runs\$stamp"
New-Item -ItemType Directory -Path $runDir -Force | Out-Null

$rawM15 = Join-Path $runDir "phase5-raw-m15.json"
$rawM5 = Join-Path $runDir "phase5-raw-m5.json"
$rawMeta = Join-Path $runDir "phase5-raw-meta.json"
$rawResult = Join-Path $runDir "phase5-raw-result.json"
$mergedM15 = Join-Path $runDir "phase5-forward-m15.json"
$mergedM5 = Join-Path $runDir "phase5-forward-m5.json"
$mergedMeta = Join-Path $runDir "phase5-forward-meta.json"
$mergedResult = Join-Path $runDir "phase5-forward-result.json"
$exportLog = Join-Path $runDir "phase5-forward-export.log"
$consoleLog = Join-Path $runDir "phase5-forward-console.log"

$env:ZIQ_BRIDGE_ENV = $BridgeEnv
$env:ZIQ_M15_JSON = $rawM15
$env:ZIQ_M5_JSON = $rawM5
$env:ZIQ_META_JSON = $rawMeta
$env:ZIQ_RESULT_JSON = $rawResult
$env:ZIQ_DAYS = [string]$Days
$env:ZIQ_MAX_RISK_USD = [string]$MaxRiskUsd

$realCutoffMs = [DateTimeOffset]::Parse($RealCutoffUtc).ToUnixTimeMilliseconds()
$datasetCutoffMs = $realCutoffMs + $PreRegisteredDatasetOffsetMs
$datasetCutoffIso = [DateTimeOffset]::FromUnixTimeMilliseconds($datasetCutoffMs).UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$env:ZIQ_PHASE5_DATASET_CUTOFF_MS = [string]$datasetCutoffMs

Write-Host "PHASE5_FORWARD_RUN_DIR=$runDir"
Write-Host "PHASE5_FORWARD_BRIDGE_ENV=$BridgeEnv"
Write-Host "PHASE5_FORWARD_FROZEN_DIR=$FrozenDir"
Write-Host "PHASE5_FORWARD_REAL_CUTOFF_UTC=$RealCutoffUtc"
Write-Host "PHASE5_FORWARD_DATASET_CUTOFF=$datasetCutoffIso"
Write-Host "PHASE5_FORWARD_DATASET_OFFSET_MS=$PreRegisteredDatasetOffsetMs"
Write-Host "PHASE5_FORWARD_CANDIDATE=CANONICAL_SELL"
Write-Host "PHASE5_FORWARD_DAYS=$Days"
Write-Host "PHASE5_FORWARD_MAX_RISK_USD=$MaxRiskUsd"
Write-Host "PHASE5_FORWARD_EXPORT_START"

& $PythonExe $Exporter 2>&1 | Tee-Object $exportLog
if ($LASTEXITCODE -ne 0) {
  throw "Phase 5 MT5 history export failed with exit code $LASTEXITCODE"
}

foreach ($output in @($rawM15, $rawM5, $rawMeta)) {
  if (-not (Test-Path $output)) {
    throw "Expected Phase 5 raw export missing: $output"
  }
}
Write-Host "PHASE5_FORWARD_EXPORT_STATUS=PASS"

$offsetLine = Select-String -Path $exportLog -Pattern "^BROKER_HOST_OFFSET_MS=" |
  Select-Object -Last 1
if ($null -eq $offsetLine) {
  throw "Exporter did not report BROKER_HOST_OFFSET_MS; cannot verify Phase 5 timestamp space."
}

$observedOffsetMs = [long](($offsetLine.Line -split "=", 2)[1])
$normalizedObservedOffsetMs = [long]([math]::Round($observedOffsetMs / 60000.0) * 60000)
$offsetDeviationMs = [math]::Abs($normalizedObservedOffsetMs - $PreRegisteredDatasetOffsetMs)
Write-Host "PHASE5_FORWARD_BROKER_HOST_OFFSET_MS=$observedOffsetMs"
Write-Host "PHASE5_FORWARD_NORMALIZED_OFFSET_MS=$normalizedObservedOffsetMs"
Write-Host "PHASE5_FORWARD_OFFSET_DEVIATION_MS=$offsetDeviationMs"
if ($offsetDeviationMs -gt $AllowedObservedOffsetDeviationMs) {
  Write-Host "PHASE5_FORWARD_TIMEBASE_STATUS=FAIL"
  throw "Observed broker timestamp offset does not match the pre-registered +03:00 dataset timebase."
}
Write-Host "PHASE5_FORWARD_TIMEBASE_STATUS=PASS"

Write-Host "PHASE5_FORWARD_MERGE_START"
& node $Merger `
  --frozenM15 $FrozenM15 `
  --frozenM5 $FrozenM5 `
  --freshM15 $rawM15 `
  --freshM5 $rawM5 `
  --freshMeta $rawMeta `
  --outM15 $mergedM15 `
  --outM5 $mergedM5 `
  --outMeta $mergedMeta `
  --realCutoff $RealCutoffUtc `
  --datasetCutoffMs $datasetCutoffMs
if ($LASTEXITCODE -ne 0) {
  throw "Phase 5 frozen-plus-forward merge failed with exit code $LASTEXITCODE"
}

$env:ZIQ_M15_JSON = $mergedM15
$env:ZIQ_M5_JSON = $mergedM5
$env:ZIQ_META_JSON = $mergedMeta
$env:ZIQ_RESULT_JSON = $mergedResult

Get-FileHash $mergedM15, $mergedM5, $mergedMeta -Algorithm SHA256 |
  ForEach-Object {
    Write-Host ("PHASE5_FORWARD_SHA256={0}|{1}" -f (Split-Path $_.Path -Leaf), $_.Hash)
  }

Write-Host "PHASE5_FORWARD_BUILD_START"
Push-Location $ProjectRoot
try {
  & pnpm --filter @xauusd/risk-engine build
  if ($LASTEXITCODE -ne 0) {
    throw "Phase 5 risk-engine build failed with exit code $LASTEXITCODE"
  }
  Write-Host "PHASE5_FORWARD_BUILD_STATUS=PASS"

  Write-Host "PHASE5_FORWARD_REPLAY_START"
  & pnpm exec tsx $Runner 2>&1 | Tee-Object $consoleLog
  if ($LASTEXITCODE -ne 0) {
    throw "Phase 5 canonical replay failed with exit code $LASTEXITCODE"
  }
}
finally {
  Pop-Location
}

Write-Host "PHASE5_FORWARD_REPLAY_STATUS=PASS"
Write-Host "PHASE5_FORWARD_LOG=$consoleLog"
Write-Host "PHASE5_FORWARD_STATUS_LINES_BEGIN"
Select-String -Path $consoleLog -Pattern "PHASE5_" | ForEach-Object { $_.Line }
Write-Host "PHASE5_FORWARD_STATUS_LINES_END"
Write-Host "PHASE5_FORWARD_RUN_STATUS=PASS"
