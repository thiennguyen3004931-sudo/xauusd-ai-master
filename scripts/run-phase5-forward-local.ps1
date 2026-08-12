param(
  [Parameter(Mandatory = $true)]
  [string]$WorkDir,

  [int]$Days = 180,
  [decimal]$MaxRiskUsd = 10,
  [string]$PythonExe = "python",
  [string]$BridgeEnv = ""
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WorkDir = (Resolve-Path $WorkDir).Path
$Exporter = Join-Path $WorkDir "extract_mt5_history.py"
$Runner = Join-Path $WorkDir "canonical_replay.ts"

if ([string]::IsNullOrWhiteSpace($BridgeEnv)) {
  $BridgeEnv = Join-Path $ProjectRoot "packages\mt5-broker\bridge.env"
}

foreach ($required in @($Exporter, $Runner, $BridgeEnv)) {
  if (-not (Test-Path $required)) {
    throw "Required Phase 5 input not found: $required"
  }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $WorkDir "phase5-forward-runs\$stamp"
New-Item -ItemType Directory -Path $runDir -Force | Out-Null

$env:ZIQ_BRIDGE_ENV = $BridgeEnv
$env:ZIQ_M15_JSON = Join-Path $runDir "phase5-forward-m15.json"
$env:ZIQ_M5_JSON = Join-Path $runDir "phase5-forward-m5.json"
$env:ZIQ_META_JSON = Join-Path $runDir "phase5-forward-meta.json"
$env:ZIQ_RESULT_JSON = Join-Path $runDir "phase5-forward-result.json"
$env:ZIQ_DAYS = [string]$Days
$env:ZIQ_MAX_RISK_USD = [string]$MaxRiskUsd

Write-Host "PHASE5_FORWARD_RUN_DIR=$runDir"
Write-Host "PHASE5_FORWARD_CUTOFF_UTC=2026-08-12T12:45:00.000Z"
Write-Host "PHASE5_FORWARD_CANDIDATE=CANONICAL_SELL"
Write-Host "PHASE5_FORWARD_DAYS=$Days"
Write-Host "PHASE5_FORWARD_MAX_RISK_USD=$MaxRiskUsd"
Write-Host "PHASE5_FORWARD_EXPORT_START"

& $PythonExe $Exporter
if ($LASTEXITCODE -ne 0) {
  throw "Phase 5 MT5 history export failed with exit code $LASTEXITCODE"
}

foreach ($output in @($env:ZIQ_M15_JSON, $env:ZIQ_M5_JSON, $env:ZIQ_META_JSON)) {
  if (-not (Test-Path $output)) {
    throw "Expected Phase 5 export missing: $output"
  }
}

Write-Host "PHASE5_FORWARD_EXPORT_STATUS=PASS"

Get-FileHash $env:ZIQ_M15_JSON, $env:ZIQ_M5_JSON, $env:ZIQ_META_JSON -Algorithm SHA256 |
  ForEach-Object {
    Write-Host ("PHASE5_FORWARD_SHA256={0}|{1}" -f (Split-Path $_.Path -Leaf), $_.Hash)
  }

$consoleLog = Join-Path $runDir "phase5-forward-console.log"
Write-Host "PHASE5_FORWARD_REPLAY_START"

Push-Location $ProjectRoot
try {
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
