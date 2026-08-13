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

$ControllerTs = Join-Path $ProjectRoot "scripts\run-phase7b-demo-controller.ts"
$ControllerMts = Join-Path $ProjectRoot "scripts\.phase7b-demo-controller.mts"
$RiskEngineEsm = Join-Path $ProjectRoot "packages\risk-engine\dist\index.js"
if (-not (Test-Path $ControllerTs)) { throw "Phase 7B DEMO controller missing: $ControllerTs" }

Push-Location $ProjectRoot
try {
  Write-Host "PHASE7B_DEMO_BUILD_START"
  & pnpm --filter @xauusd/risk-engine build
  if ($LASTEXITCODE -ne 0) { throw "Phase 7B DEMO risk-engine build failed with exit code $LASTEXITCODE" }
  Write-Host "PHASE7B_DEMO_BUILD_STATUS=PASS"

  if (-not (Test-Path $RiskEngineEsm)) { throw "Phase 7B DEMO risk-engine ESM build missing: $RiskEngineEsm" }

  # The repository is CommonJS-oriented. Create a temporary .mts entrypoint so
  # tsx treats top-level await as ESM on Windows/Node 24. The root workspace does
  # not expose @xauusd/risk-engine to scripts/ as a resolvable package, so point
  # the temporary controller directly at the ESM artifact built immediately above.
  $ControllerText = Get-Content $ControllerTs -Raw
  $ControllerText = $ControllerText.Replace('from "@xauusd/risk-engine";', 'from "../packages/risk-engine/dist/index.js";')
  if ($ControllerText -match '@xauusd/risk-engine') {
    throw "Phase 7B DEMO temporary controller still contains unresolved @xauusd/risk-engine import."
  }
  Set-Content -Path $ControllerMts -Value $ControllerText -Encoding UTF8

  Write-Host "PHASE7B_DEMO_CONTROLLER_MODULE=ESM_MTS"
  Write-Host "PHASE7B_DEMO_RISK_ENGINE_IMPORT=../packages/risk-engine/dist/index.js"

  # Capture output so Windows/Node 24's known libuv shutdown assertion can be
  # distinguished from a real controller failure. This assertion can occur only
  # after the non-armed preflight has already printed both PASS markers and called
  # process.exit(0). It is never accepted for an armed run.
  $ControllerOutput = @(& pnpm exec tsx $ControllerMts 2>&1)
  $ControllerExitCode = $LASTEXITCODE
  $ControllerOutput | ForEach-Object { Write-Host $_ }

  if ($ControllerExitCode -ne 0) {
    $OutputText = ($ControllerOutput | Out-String)
    $KnownPreflightShutdownCrash = (
      (-not $ArmDemoTrading.IsPresent) -and
      $Once.IsPresent -and
      ($OutputText -match 'PHASE7B_DEMO_PREFLIGHT_STATUS=PASS') -and
      ($OutputText -match 'PHASE7B_DEMO_ORDER_SEND=DISABLED_NOT_ARMED') -and
      ($OutputText -match 'UV_HANDLE_CLOSING')
    )

    if ($KnownPreflightShutdownCrash) {
      Write-Host "PHASE7B_DEMO_PREFLIGHT_PROCESS_EXIT_WORKAROUND=PASS" -ForegroundColor Yellow
      Write-Host "PHASE7B_DEMO_PREFLIGHT_EFFECTIVE_STATUS=PASS"
    } else {
      throw "Phase 7B DEMO controller exited with code $ControllerExitCode"
    }
  }
}
finally {
  Remove-Item $ControllerMts -Force -ErrorAction SilentlyContinue
  Pop-Location
}
