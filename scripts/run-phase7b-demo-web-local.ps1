param(
  [Parameter(Mandatory = $true)] [string]$WorkDir,
  [string]$BridgeEnv = "",
  [int]$ApiPort = 3711,
  [int]$WebPort = 5717
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

if ($ApiPort -lt 1024 -or $ApiPort -gt 65535) { throw "ApiPort is invalid." }
if ($WebPort -lt 1024 -or $WebPort -gt 65535) { throw "WebPort is invalid." }
if ($ApiPort -eq $WebPort) { throw "ApiPort and WebPort must be different." }

$values = @{}
Get-Content $BridgeEnv | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
  $parts = $line -split "=", 2
  $name = $parts[0].Trim().TrimStart([char]0xFEFF)
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
$bridgeBase = "http://${bridgeHost}:${bridgePort}"
$demoDir = Join-Path $WorkDir "phase7b-demo-forward"
New-Item -ItemType Directory -Path $demoDir -Force | Out-Null

# Fail immediately if the exact key from .env.phase7b-demo cannot authenticate
# against the running bridge. Never print the key itself.
try {
  $bridgeHealth = Invoke-RestMethod -Uri "$bridgeBase/health" -Headers @{ "x-mt5-api-key" = $apiKey } -Method Get -TimeoutSec 5
} catch {
  throw "Phase 7B WEB bridge authentication failed before launch: $($_.Exception.Message)"
}
if (-not $bridgeHealth.connected) {
  throw "Phase 7B WEB bridge is reachable but MT5 terminal is disconnected."
}
Write-Host "PHASE7B_WEB_BRIDGE_AUTH=PASS"
Write-Host "PHASE7B_WEB_BRIDGE_ACCOUNT_MODE=$($bridgeHealth.accountMode)"
Write-Host "PHASE7B_WEB_BRIDGE_SERVER=$($bridgeHealth.server)"

# Dedicated Phase 7B ports isolate this monitor from any legacy dashboard/API
# process still listening or being respawned on 3001/5173.
$apiUrl = "http://127.0.0.1:${ApiPort}"
$webUrl = "http://127.0.0.1:${WebPort}"

foreach ($port in @($ApiPort, $WebPort)) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($listeners) {
    $pids = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
    throw "Phase 7B dedicated port $port is already in use by PID(s): $($pids -join ', '). Stop that process or choose another port."
  }
}

# Pass broker credentials only to the API child process. The browser never receives
# MT5_BRIDGE_API_KEY; Vite only exposes variables prefixed with VITE_.
$env:MT5_BRIDGE_ENABLED = "true"
$env:MT5_BRIDGE_BASE_URL = $bridgeBase
$env:MT5_BRIDGE_API_KEY = $apiKey
$env:MT5_BRIDGE_REQUEST_TIMEOUT_MS = "3000"
$env:MT5_BRIDGE_HEALTH_TIMEOUT_MS = "1500"
$env:PHASE7B_DEMO_WORK_DIR = $demoDir
$env:HOST = "127.0.0.1"
$env:PORT = [string]$ApiPort
$env:WEB_ORIGIN = $webUrl

$apiCommand = "Set-Location '$ProjectRoot'; Write-Host 'PHASE7B_WEB_API=$apiUrl'; pnpm dev:api"
$apiProcess = Start-Process powershell.exe -PassThru -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-Command", $apiCommand
)

# Do not leave the bridge API key in the parent environment before launching web.
Remove-Item Env:MT5_BRIDGE_API_KEY -ErrorAction SilentlyContinue

# Bypass Vite's legacy /api -> 3001 proxy. The DEMO page talks directly to the
# dedicated API port instead.
$env:VITE_API_BASE_URL = $apiUrl
$webCommand = "Set-Location '$ProjectRoot'; Write-Host 'PHASE7B_WEB_UI=$webUrl/phase7b-demo'; pnpm --filter @xauusd/web dev -- --host 127.0.0.1 --port $WebPort --strictPort"
$webProcess = Start-Process powershell.exe -PassThru -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-Command", $webCommand
)
Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue

Write-Host "PHASE7B_WEB_API_PID=$($apiProcess.Id)"
Write-Host "PHASE7B_WEB_UI_PID=$($webProcess.Id)"
Write-Host "PHASE7B_WEB_DEMO_DIR=$demoDir"
Write-Host "PHASE7B_WEB_API=$apiUrl/api/v1/phase7b-demo"
Write-Host "PHASE7B_WEB_UI=$webUrl/phase7b-demo"
Write-Host "PHASE7B_WEB_READ_ONLY=PASS"
Write-Host "PHASE7B_WEB_LEGACY_PORTS_3001_5173=BYPASSED"

# Give API enough time to enter watch mode, then verify the complete read-only
# endpoint before opening the browser.
$apiReady = $false
for ($attempt = 1; $attempt -le 12; $attempt++) {
  Start-Sleep -Milliseconds 750
  try {
    $snapshot = Invoke-RestMethod -Uri "$apiUrl/api/v1/phase7b-demo" -Method Get -TimeoutSec 3
    if ($snapshot) {
      $apiReady = $true
      Write-Host "PHASE7B_WEB_API_SELFTEST=PASS"
      Write-Host "PHASE7B_WEB_BOT_STATUS=$($snapshot.botStatus)"
      Write-Host "PHASE7B_WEB_MT5_REACHABLE=$($snapshot.mt5.reachable)"
      break
    }
  } catch {
    if ($attempt -eq 12) {
      Write-Warning "Phase 7B WEB API self-test did not pass yet: $($_.Exception.Message)"
    }
  }
}

if (-not $apiReady) {
  Write-Warning "Web processes were started, but API self-test is not PASS. Inspect the API child window before trusting the monitor."
}

Start-Process "$webUrl/phase7b-demo"
