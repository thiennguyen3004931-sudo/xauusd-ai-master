param(
  [string]$ControlApiUrl = "http://127.0.0.1:3711",
  [string]$EnvFile = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Controller = Join-Path $PSScriptRoot "run-phase7c-trend-controller.mjs"

if (-not (Test-Path $Controller)) {
  throw "Phase 7C Trend controller not found: $Controller"
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

$env:ZIQ_PHASE7C_CONTROL_API_URL = $ControlApiUrl.TrimEnd('/')

Write-Host "PHASE7C_TREND_CONTROLLER=STARTING"
Write-Host "PHASE7C_CONTROL_API=$($env:ZIQ_PHASE7C_CONTROL_API_URL)"
Write-Host "PHASE7C_GATE_SCOPE=NEW_TREND_ENTRIES_ONLY"
Write-Host "PHASE7C_POSITION_MANAGEMENT=PASS_THROUGH"
Write-Host "PHASE7C_FAIL_CLOSED=TRUE"
if (-not [string]::IsNullOrWhiteSpace($EnvFile)) {
  Write-Host "PHASE7C_ENV_FILE=$EnvFile"
}

Push-Location $ProjectRoot
try {
  pnpm exec tsx $Controller
  if ($LASTEXITCODE -ne 0) {
    throw "Phase 7C Trend controller exited with code $LASTEXITCODE"
  }
}
finally {
  Pop-Location
}
