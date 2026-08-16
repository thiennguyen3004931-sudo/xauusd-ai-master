param(
  [Parameter(Mandatory = $true)] [string]$WorkDir,
  [string]$ControlApiUrl = "http://127.0.0.1:3711",
  [string]$HostAddress = "127.0.0.1",
  [int]$Port = 5727,
  [int]$RefreshSeconds = 15
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Dashboard = Join-Path $PSScriptRoot "run-phase7c-forward-dashboard.mjs"

if (-not (Test-Path $Dashboard)) { throw "Phase 7C forward dashboard not found: $Dashboard" }
if (-not [System.IO.Path]::IsPathRooted($WorkDir)) { $WorkDir = Join-Path $ProjectRoot $WorkDir }
if (-not (Test-Path $WorkDir)) { throw "WorkDir not found: $WorkDir" }
$WorkDir = (Resolve-Path $WorkDir).Path

if ($HostAddress -notin @("127.0.0.1", "localhost", "::1")) {
  throw "Phase 7C forward dashboard is loopback-only. Refused HostAddress=$HostAddress"
}
if ($Port -lt 1 -or $Port -gt 65535) { throw "Port must be between 1 and 65535." }
if ($RefreshSeconds -lt 5 -or $RefreshSeconds -gt 300) { throw "RefreshSeconds must be between 5 and 300." }

$env:ZIQ_PHASE7C_DASHBOARD_WORK_DIR = $WorkDir
$env:ZIQ_PHASE7C_DASHBOARD_HOST = $HostAddress
$env:ZIQ_PHASE7C_DASHBOARD_PORT = [string]$Port
$env:ZIQ_PHASE7C_DASHBOARD_REFRESH_MS = [string]($RefreshSeconds * 1000)
$env:ZIQ_PHASE7C_CONTROL_API_URL = $ControlApiUrl.TrimEnd('/')

Write-Host "PHASE7C_FORWARD_DASHBOARD=STARTING"
Write-Host "PHASE7C_FORWARD_DASHBOARD_URL=http://${HostAddress}:${Port}/"
Write-Host "PHASE7C_FORWARD_DASHBOARD_WORK_DIR=$WorkDir"
Write-Host "PHASE7C_FORWARD_DASHBOARD_CONTROL_API=$($env:ZIQ_PHASE7C_CONTROL_API_URL)"
Write-Host "PHASE7C_FORWARD_DASHBOARD_REFRESH_SECONDS=$RefreshSeconds"
Write-Host "PHASE7C_FORWARD_DASHBOARD_READ_ONLY=TRUE"
Write-Host "PHASE7C_FORWARD_DASHBOARD_MT5_MUTATION=NONE"

Push-Location $ProjectRoot
try {
  node $Dashboard
  if ($LASTEXITCODE -ne 0) { throw "Phase 7C forward dashboard exited with code $LASTEXITCODE" }
}
finally {
  Pop-Location
}
