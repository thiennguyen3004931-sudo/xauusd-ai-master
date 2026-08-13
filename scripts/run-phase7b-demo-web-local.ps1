param(
  [Parameter(Mandatory = $true)] [string]$WorkDir,
  [string]$BridgeEnv = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WorkDir = (Resolve-Path $WorkDir).Path

if ([string]::IsNullOrWhiteSpace($BridgeEnv)) {
  $BridgeEnv = Join-Path $ProjectRoot "packages\mt5-broker\bridge\.env.phase7b-demo"
}
if (-not (Test-Path $BridgeEnv)) {
  throw "Phase 7B DEMO bridge env not found: $BridgeEnv"
}
$BridgeEnv = (Resolve-Path $BridgeEnv).Path

$values = @{}
Get-Content $BridgeEnv | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
  $parts = $line -split "=", 2
  $name = $parts[0].Trim()
  $value = $parts[1].Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  $values[$name] = $value
}

$apiKey = [string]$values["MT5_API_KEY"]
if ([string]::IsNullOrWhiteSpace($apiKey) -or $apiKey.Length -lt 16) {
  throw "MT5_API_KEY in the DEMO bridge env is invalid."
}

$bridgeHost = if ([string]::IsNullOrWhiteSpace([string]$values["MT5_BRIDGE_HOST"])) { "127.0.0.1" } else { [string]$values["MT5_BRIDGE_HOST"] }
$bridgePort = if ([string]::IsNullOrWhiteSpace([string]$values["MT5_BRIDGE_PORT"])) { "8765" } else { [string]$values["MT5_BRIDGE_PORT"] }
$demoDir = Join-Path $WorkDir "phase7b-demo-forward"
New-Item -ItemType Directory -Path $demoDir -Force | Out-Null

# Pass broker credentials only to the API child process. The browser never receives
# MT5_BRIDGE_API_KEY; Vite only exposes variables prefixed with VITE_.
$env:MT5_BRIDGE_ENABLED = "true"
$env:MT5_BRIDGE_BASE_URL = "http://${bridgeHost}:${bridgePort}"
$env:MT5_BRIDGE_API_KEY = $apiKey
$env:MT5_BRIDGE_REQUEST_TIMEOUT_MS = "3000"
$env:MT5_BRIDGE_HEALTH_TIMEOUT_MS = "1500"
$env:PHASE7B_DEMO_WORK_DIR = $demoDir
$env:HOST = "127.0.0.1"
$env:PORT = "3001"
$env:WEB_ORIGIN = "http://127.0.0.1:5173,http://localhost:5173"

$apiCommand = "Set-Location '$ProjectRoot'; Write-Host 'PHASE7B_WEB_API=http://127.0.0.1:3001'; pnpm dev:api"
$apiProcess = Start-Process powershell.exe -PassThru -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-Command", $apiCommand
)

# Do not leave the bridge API key in the parent environment before launching web.
Remove-Item Env:MT5_BRIDGE_API_KEY -ErrorAction SilentlyContinue

$webCommand = "Set-Location '$ProjectRoot'; Write-Host 'PHASE7B_WEB_UI=http://127.0.0.1:5173/phase7b-demo'; pnpm dev:web"
$webProcess = Start-Process powershell.exe -PassThru -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-Command", $webCommand
)

Write-Host "PHASE7B_WEB_API_PID=$($apiProcess.Id)"
Write-Host "PHASE7B_WEB_UI_PID=$($webProcess.Id)"
Write-Host "PHASE7B_WEB_DEMO_DIR=$demoDir"
Write-Host "PHASE7B_WEB_API=http://127.0.0.1:3001/api/v1/phase7b-demo"
Write-Host "PHASE7B_WEB_UI=http://127.0.0.1:5173/phase7b-demo"
Write-Host "PHASE7B_WEB_READ_ONLY=PASS"

Start-Sleep -Seconds 2
Start-Process "http://127.0.0.1:5173/phase7b-demo"
