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
if (-not (Test-Path $BridgeEnv)) { throw "Phase 7B WEB autostart bridge env missing: $BridgeEnv" }
$BridgeEnv = (Resolve-Path $BridgeEnv).Path

if ($ApiPort -lt 1024 -or $ApiPort -gt 65535) { throw "ApiPort is invalid." }
if ($WebPort -lt 1024 -or $WebPort -gt 65535) { throw "WebPort is invalid." }
if ($ApiPort -eq $WebPort) { throw "ApiPort and WebPort must be different." }

function Test-PortListening([int]$Port) {
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  return $null -ne $listener
}

$apiListening = Test-PortListening $ApiPort
$webListening = Test-PortListening $WebPort
if ($apiListening -and $webListening) {
  Write-Host "PHASE7B_WEB_AUTOSTART=ALREADY_RUNNING"
  Write-Host "PHASE7B_WEB_API=http://127.0.0.1:$ApiPort/api/v1/phase7b-demo"
  Write-Host "PHASE7B_WEB_UI=http://127.0.0.1:$WebPort/phase7b-demo"
  exit 0
}
if ($apiListening -or $webListening) {
  throw "Phase 7B WEB autostart found a partial port conflict. API=$apiListening WEB=$webListening"
}

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
  throw "Phase 7B WEB autostart requires a valid MT5_API_KEY."
}

$systemMagic = [string]$values["MT5_MAGIC_NUMBER"]
if ([string]::IsNullOrWhiteSpace($systemMagic)) { $systemMagic = "270713" }
$systemMagicNumber = 0
if (-not [int]::TryParse($systemMagic, [ref]$systemMagicNumber) -or $systemMagicNumber -le 0) {
  throw "Phase 7B WEB autostart MT5_MAGIC_NUMBER is invalid."
}

$bridgeHost = if ([string]::IsNullOrWhiteSpace([string]$values["MT5_BRIDGE_HOST"])) { "127.0.0.1" } else { [string]$values["MT5_BRIDGE_HOST"] }
$bridgePort = if ([string]::IsNullOrWhiteSpace([string]$values["MT5_BRIDGE_PORT"])) { "8765" } else { [string]$values["MT5_BRIDGE_PORT"] }
$bridgeBase = "http://${bridgeHost}:${bridgePort}"
$demoDir = Join-Path $WorkDir "phase7b-demo-forward"
New-Item -ItemType Directory -Path $demoDir -Force | Out-Null

$apiUrl = "http://127.0.0.1:${ApiPort}"
$webUrl = "http://127.0.0.1:${WebPort}"

$env:MT5_BRIDGE_ENABLED = "true"
$env:MT5_BRIDGE_BASE_URL = $bridgeBase
$env:MT5_BRIDGE_API_KEY = $apiKey
$env:MT5_BRIDGE_REQUEST_TIMEOUT_MS = "3000"
$env:MT5_BRIDGE_HEALTH_TIMEOUT_MS = "1500"
$env:MT5_MAGIC_NUMBER = [string]$systemMagicNumber
$env:PHASE7B_DEMO_WORK_DIR = $demoDir
$env:PHASE7B_LOCAL_CONTROL_ENABLED = "true"
$env:HOST = "127.0.0.1"
$env:PORT = [string]$ApiPort
$env:WEB_ORIGIN = $webUrl

$apiCommand = "Set-Location '$ProjectRoot'; pnpm --filter @xauusd/api dev"
$apiProcess = Start-Process powershell.exe -WindowStyle Hidden -PassThru -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-Command", $apiCommand
)

Remove-Item Env:MT5_BRIDGE_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:MT5_MAGIC_NUMBER -ErrorAction SilentlyContinue
$env:VITE_API_BASE_URL = $apiUrl
$webCommand = "Set-Location '$ProjectRoot'; pnpm --filter @xauusd/web dev -- --host 127.0.0.1 --port $WebPort --strictPort"
$webProcess = Start-Process powershell.exe -WindowStyle Hidden -PassThru -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-Command", $webCommand
)
Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue

Write-Host "PHASE7B_WEB_AUTOSTART=STARTING"
Write-Host "PHASE7B_WEB_API_PID=$($apiProcess.Id)"
Write-Host "PHASE7B_WEB_UI_PID=$($webProcess.Id)"
Write-Host "PHASE7B_WEB_API=$apiUrl/api/v1/phase7b-demo"
Write-Host "PHASE7B_WEB_UI=$webUrl/phase7b-demo"
Write-Host "PHASE7B_WEB_OPS=$webUrl/phase7b-ops"
Write-Host "PHASE7B_WEB_BROWSER_AUTO_OPEN=OFF"

$apiReady = $false
$webReady = $false
for ($attempt = 1; $attempt -le 40; $attempt++) {
  Start-Sleep -Milliseconds 500
  if (-not $apiReady) {
    try {
      $snapshot = Invoke-RestMethod -Uri "$apiUrl/api/v1/phase7b-demo" -Method Get -TimeoutSec 2
      if ($snapshot) { $apiReady = $true }
    } catch {}
  }
  if (-not $webReady) {
    try {
      $response = Invoke-WebRequest -Uri "$webUrl/phase7b-ops" -Method Get -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) { $webReady = $true }
    } catch {}
  }
  if ($apiReady -and $webReady) { break }
}

if (-not $apiReady -or -not $webReady) {
  try { Stop-Process -Id $apiProcess.Id -Force -ErrorAction SilentlyContinue } catch {}
  try { Stop-Process -Id $webProcess.Id -Force -ErrorAction SilentlyContinue } catch {}
  throw "Phase 7B WEB autostart self-test failed. API=$apiReady WEB=$webReady"
}

Write-Host "PHASE7B_WEB_AUTOSTART_API=PASS"
Write-Host "PHASE7B_WEB_AUTOSTART_UI=PASS"
Write-Host "PHASE7B_WEB_AUTOSTART_STATUS=RUNNING"

try {
  while ($true) {
    Start-Sleep -Seconds 5
    $apiProcess.Refresh()
    $webProcess.Refresh()
    if ($apiProcess.HasExited -or $webProcess.HasExited) {
      throw "Phase 7B WEB child process exited. API_EXITED=$($apiProcess.HasExited) WEB_EXITED=$($webProcess.HasExited)"
    }
  }
}
finally {
  try {
    $apiProcess.Refresh()
    if (-not $apiProcess.HasExited) { Stop-Process -Id $apiProcess.Id -Force -ErrorAction SilentlyContinue }
  } catch {}
  try {
    $webProcess.Refresh()
    if (-not $webProcess.HasExited) { Stop-Process -Id $webProcess.Id -Force -ErrorAction SilentlyContinue }
  } catch {}
}
