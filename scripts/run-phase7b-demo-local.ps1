param(
  [Parameter(Mandatory = $true)] [string]$WorkDir,
  [decimal]$FixedVolume = 0.03,
  [int]$IntervalSeconds = 5,
  [string]$BridgeEnv = "",
  [switch]$ArmDemoTrading,
  [switch]$Once
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WorkDir = (Resolve-Path $WorkDir).Path

if ([string]::IsNullOrWhiteSpace($BridgeEnv)) {
  $BridgeEnv = Join-Path $ProjectRoot "packages\mt5-broker\bridge\.env.phase7b-demo"
}

$BridgeExample = Join-Path $ProjectRoot "packages\mt5-broker\bridge\.env.phase7b-demo.example"
if (-not (Test-Path $BridgeEnv)) {
  if (Test-Path $BridgeExample) {
    Copy-Item $BridgeExample $BridgeEnv
    Write-Host "PHASE7B_DEMO_ENV_CREATED=$BridgeEnv" -ForegroundColor Yellow
    Write-Host "Edit MT5_API_KEY and, after preflight shows the DEMO login, set MT5_ALLOWED_LOGINS to that exact login." -ForegroundColor Yellow
  } else {
    Write-Host "Phase 7B DEMO env file missing: $BridgeEnv" -ForegroundColor Red
  }
  exit 1
}

if ($FixedVolume -le 0) { throw "FixedVolume must be positive." }
if ($IntervalSeconds -lt 1) { throw "IntervalSeconds must be >= 1." }

$DemoWorkDir = Join-Path $WorkDir "phase7b-demo-forward"
New-Item -ItemType Directory -Path $DemoWorkDir -Force | Out-Null

$env:ZIQ_BRIDGE_ENV = (Resolve-Path $BridgeEnv).Path
$env:ZIQ_DEMO_WORK_DIR = $DemoWorkDir
$env:ZIQ_FIXED_VOLUME = [string]$FixedVolume
$env:ZIQ_DEMO_INTERVAL_SECONDS = [string]$IntervalSeconds
$env:ZIQ_DEMO_ARMED = if ($ArmDemoTrading) { "true" } else { "false" }
$env:ZIQ_DEMO_ONCE = if ($Once) { "true" } else { "false" }
$env:ZIQ_DEMO_SYMBOL = "XAUUSD"

Write-Host "PHASE7B_DEMO_WORK_DIR=$DemoWorkDir"
Write-Host "PHASE7B_DEMO_BRIDGE_ENV=$($env:ZIQ_BRIDGE_ENV)"
Write-Host "PHASE7B_DEMO_FIXED_VOLUME=$FixedVolume"
Write-Host "PHASE7B_DEMO_INTERVAL_SECONDS=$IntervalSeconds"
Write-Host "PHASE7B_DEMO_ARM_REQUESTED=$($ArmDemoTrading.IsPresent)"
Write-Host "PHASE7B_DEMO_REAL_ACCOUNT_ALLOWED=false"

Push-Location $ProjectRoot
try {
  Write-Host "PHASE7B_DEMO_BUILD_START"
  & pnpm --filter @xauusd/risk-engine build
  if ($LASTEXITCODE -ne 0) { throw "Phase 7B DEMO risk-engine build failed with exit code $LASTEXITCODE" }
  Write-Host "PHASE7B_DEMO_BUILD_STATUS=PASS"

  & pnpm exec tsx ".\scripts\run-phase7b-demo-controller.ts"
  if ($LASTEXITCODE -ne 0) { throw "Phase 7B DEMO controller exited with code $LASTEXITCODE" }
}
finally {
  Pop-Location
}
