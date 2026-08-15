param(
  [string]$ControlApiUrl = "http://127.0.0.1:3711",
  [string]$EnvFile = "packages/mt5-broker/bridge/.env.phase7b-demo",
  [string]$WorkDir = "",
  [double]$RiskPercent = 0.25,
  [double]$MaxLot = 0.03,
  [int]$IntervalSeconds = 5,
  [switch]$Armed,
  [switch]$Once
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Controller = Join-Path $PSScriptRoot "run-phase7c-sideway-locked.mjs"

if (-not (Test-Path $Controller)) {
  throw "Phase 7C Sideway locked controller not found: $Controller"
}

if ($RiskPercent -le 0 -or $RiskPercent -gt 5) {
  throw "RiskPercent must be > 0 and <= 5."
}
if ($MaxLot -le 0) {
  throw "MaxLot must be positive."
}
if ($IntervalSeconds -lt 1) {
  throw "IntervalSeconds must be >= 1."
}

if (-not [string]::IsNullOrWhiteSpace($EnvFile)) {
  if (-not [System.IO.Path]::IsPathRooted($EnvFile)) {
    $EnvFile = Join-Path $ProjectRoot $EnvFile
  }
  if (-not (Test-Path $EnvFile)) {
    throw "Environment file not found: $EnvFile"
  }

  foreach ($raw in Get-Content $EnvFile) {
    $line = $raw.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { continue }
    $index = $line.IndexOf("=")
    $name = $line.Substring(0, $index).Trim().TrimStart([char]0xFEFF)
    $value = $line.Substring($index + 1).Trim().Trim('"').Trim("'")
    [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

if (-not [string]::IsNullOrWhiteSpace($WorkDir)) {
  if (-not [System.IO.Path]::IsPathRooted($WorkDir)) {
    $WorkDir = Join-Path $ProjectRoot $WorkDir
  }
  New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
  $env:ZIQ_PHASE7C_SIDEWAY_WORK_DIR = (Resolve-Path $WorkDir).Path
}

$env:ZIQ_PHASE7C_CONTROL_API_URL = $ControlApiUrl.TrimEnd('/')
$env:ZIQ_PHASE7C_SIDEWAY_RISK_PERCENT = $RiskPercent.ToString([System.Globalization.CultureInfo]::InvariantCulture)
$env:ZIQ_PHASE7C_SIDEWAY_MAX_LOT = $MaxLot.ToString([System.Globalization.CultureInfo]::InvariantCulture)
$env:ZIQ_PHASE7C_SIDEWAY_INTERVAL_SECONDS = $IntervalSeconds.ToString()
$env:ZIQ_PHASE7C_SIDEWAY_ARMED = if ($Armed) { "true" } else { "false" }
$env:ZIQ_PHASE7C_SIDEWAY_ONCE = if ($Once) { "true" } else { "false" }

# API-side Phase 7C services use MT5_BRIDGE_API_KEY while the Phase 7B bridge
# env historically used MT5_API_KEY. Mirror it in-process when necessary.
if ([string]::IsNullOrWhiteSpace($env:MT5_BRIDGE_API_KEY) -and -not [string]::IsNullOrWhiteSpace($env:MT5_API_KEY)) {
  $env:MT5_BRIDGE_API_KEY = $env:MT5_API_KEY
}

Write-Host "PHASE7C_SIDEWAY_CONTROLLER=STARTING"
Write-Host "PHASE7C_CONTROL_API=$($env:ZIQ_PHASE7C_CONTROL_API_URL)"
Write-Host "PHASE7C_SIDEWAY_RISK_PERCENT=$($env:ZIQ_PHASE7C_SIDEWAY_RISK_PERCENT)"
Write-Host "PHASE7C_SIDEWAY_MAX_LOT=$($env:ZIQ_PHASE7C_SIDEWAY_MAX_LOT)"
Write-Host "PHASE7C_SIDEWAY_ARMED=$($env:ZIQ_PHASE7C_SIDEWAY_ARMED)"
if (-not [string]::IsNullOrWhiteSpace($env:ZIQ_PHASE7C_SIDEWAY_WORK_DIR)) {
  Write-Host "PHASE7C_SIDEWAY_WORK_DIR=$($env:ZIQ_PHASE7C_SIDEWAY_WORK_DIR)"
}
Write-Host "PHASE7C_SIDEWAY_DEMO_ONLY=TRUE"
Write-Host "PHASE7C_SIDEWAY_NO_TRAILING=TRUE"
Write-Host "PHASE7C_SIDEWAY_SINGLE_POSITION_FAIL_CLOSED=TRUE"
Write-Host "PHASE7C_SIDEWAY_EXECUTION_LOCK=TRUE"
Write-Host "PHASE7C_SIDEWAY_EXISTING_POSITION_MANAGEMENT=PRESERVED_ACROSS_MODE_CHANGE"
Write-Host "PHASE7C_ENV_FILE=$EnvFile"

Push-Location $ProjectRoot
try {
  pnpm exec tsx $Controller
  if ($LASTEXITCODE -ne 0) {
    throw "Phase 7C Sideway controller exited with code $LASTEXITCODE"
  }
}
finally {
  Pop-Location
}
