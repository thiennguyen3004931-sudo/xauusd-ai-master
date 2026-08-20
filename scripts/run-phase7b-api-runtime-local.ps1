param(
  [Parameter(Mandatory = $true)] [string]$WorkDir,
  [Parameter(Mandatory = $true)] [string]$BridgeEnv,
  [int]$ApiPort = 3711,
  [string]$WebOrigin = "http://127.0.0.1:5717"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

if (-not [System.IO.Path]::IsPathRooted($WorkDir)) {
  $WorkDir = Join-Path $ProjectRoot $WorkDir
}
if (-not [System.IO.Path]::IsPathRooted($BridgeEnv)) {
  $BridgeEnv = Join-Path $ProjectRoot $BridgeEnv
}
if (-not (Test-Path -LiteralPath $WorkDir)) { throw "API runtime WorkDir not found: $WorkDir" }
if (-not (Test-Path -LiteralPath $BridgeEnv)) { throw "API bridge env not found: $BridgeEnv" }
$WorkDir = (Resolve-Path -LiteralPath $WorkDir).Path
$BridgeEnv = (Resolve-Path -LiteralPath $BridgeEnv).Path

function Read-EnvValue([string]$Name) {
  foreach ($raw in Get-Content -LiteralPath $BridgeEnv) {
    $line = $raw.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { continue }
    $index = $line.IndexOf("=")
    if ($line.Substring(0, $index).Trim().TrimStart([char]0xFEFF) -ne $Name) { continue }
    $value = $line.Substring($index + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    return $value
  }
  return ""
}

$apiKey = Read-EnvValue "MT5_API_KEY"
if ([string]::IsNullOrWhiteSpace($apiKey) -or $apiKey.Length -lt 16) {
  throw "MT5_API_KEY in the DEMO bridge env is invalid."
}
$systemMagic = Read-EnvValue "MT5_MAGIC_NUMBER"
if ([string]::IsNullOrWhiteSpace($systemMagic)) { $systemMagic = "270713" }
$systemMagicNumber = 0
if (-not [int]::TryParse($systemMagic, [ref]$systemMagicNumber) -or $systemMagicNumber -le 0) {
  throw "MT5_MAGIC_NUMBER in the DEMO bridge env is invalid."
}
$bridgeHost = Read-EnvValue "MT5_BRIDGE_HOST"
if ([string]::IsNullOrWhiteSpace($bridgeHost)) { $bridgeHost = "127.0.0.1" }
$bridgePort = Read-EnvValue "MT5_BRIDGE_PORT"
if ([string]::IsNullOrWhiteSpace($bridgePort)) { $bridgePort = "8765" }

$demoDir = Join-Path $WorkDir "phase7b-demo-forward"
New-Item -ItemType Directory -Force -Path $demoDir | Out-Null
$env:MT5_BRIDGE_ENABLED = "true"
$env:MT5_BRIDGE_BASE_URL = "http://${bridgeHost}:${bridgePort}"
$env:MT5_BRIDGE_API_KEY = $apiKey
$env:MT5_BRIDGE_REQUEST_TIMEOUT_MS = "3000"
$env:MT5_BRIDGE_HEALTH_TIMEOUT_MS = "1500"
$env:MT5_MAGIC_NUMBER = [string]$systemMagicNumber
$env:PHASE7B_DEMO_WORK_DIR = $demoDir
$env:PHASE7B_LOCAL_CONTROL_ENABLED = "true"
$env:PHASE7C_BOT_MODE_FILE = Join-Path $WorkDir "phase7c-bot-mode.json"
$env:PHASE7C_LOT_SETTINGS_FILE = Join-Path $WorkDir "phase7c-lot-settings.json"
$env:PHASE7C_ACTIVE_LOT_SETTINGS_FILE = Join-Path $WorkDir "phase7c-executors\active-lot-settings.json"
$env:PHASE7C_RUNTIME_ROOT = $WorkDir
$env:HOST = "127.0.0.1"
$env:PORT = [string]$ApiPort
$env:WEB_ORIGIN = $WebOrigin

Write-Host "PHASE7B_API_RUNTIME_ROOT=$WorkDir"
Write-Host "PHASE7B_API_LOT_SETTINGS_FILE=$($env:PHASE7C_LOT_SETTINGS_FILE)"
Write-Host "PHASE7B_API_ACTIVE_LOT_SETTINGS_FILE=$($env:PHASE7C_ACTIVE_LOT_SETTINGS_FILE)"
Write-Host "PHASE7B_API_BOT_MODE_FILE=$($env:PHASE7C_BOT_MODE_FILE)"

Push-Location $ProjectRoot
try {
  & pnpm --filter '@xauusd/api' dev
  if ($LASTEXITCODE -ne 0) { throw "Phase 7B API exited with code $LASTEXITCODE" }
} finally {
  Pop-Location
}
