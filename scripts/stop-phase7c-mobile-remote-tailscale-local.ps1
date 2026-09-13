param(
  [string]$WorkDir = ".runtime",
  [int]$WebPort = 5717,
  [int]$TailscaleHttpsPort = 8443
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$GatewayHost = "127.0.0.1"

if (-not [System.IO.Path]::IsPathRooted($WorkDir)) {
  $WorkDir = Join-Path $ProjectRoot $WorkDir
}
$RemoteRuntimeDir = Join-Path $WorkDir "phase7c-mobile-remote-m2"
$PidPath = Join-Path $RemoteRuntimeDir "gateway.pid"
$GatewayMarker = "run-phase7c-mobile-readonly-gateway.mjs"

foreach ($port in @($WebPort, $TailscaleHttpsPort)) {
  if ($port -lt 1024 -or $port -gt 65535) { throw "M2 port is invalid: $port" }
}

$tailscale = Get-Command tailscale -ErrorAction Stop

function Get-ProcessCommandLine([int]$ProcessId) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
  if ($null -eq $process) { return "" }
  return [string]$process.CommandLine
}

function Test-OwnedGatewayProcess([int]$ProcessId) {
  if ($ProcessId -le 0) { return $false }
  if ($null -eq (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) { return $false }
  $commandLine = Get-ProcessCommandLine -ProcessId $ProcessId
  if ([string]::IsNullOrWhiteSpace($commandLine)) { return $false }
  return (
    $commandLine.IndexOf($ProjectRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
    $commandLine.IndexOf($GatewayMarker, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
  )
}

$httpsArg = "--https=$TailscaleHttpsPort"
$serveDisableError = $null
try {
  & $tailscale.Source serve $httpsArg off
  if ($LASTEXITCODE -ne 0) {
    $serveDisableError = "Tailscale Serve disable returned exit code $LASTEXITCODE."
  } else {
    Write-Host "PHASE7C_MOBILE_REMOTE_M2_SERVE_DISABLE=PASS"
  }
} catch {
  $serveDisableError = $_.Exception.Message
}

$gatewayPid = 0
if (Test-Path -LiteralPath $PidPath -PathType Leaf) {
  $rawPid = (Get-Content -LiteralPath $PidPath -Raw).Trim()
  if (-not [int]::TryParse($rawPid, [ref]$gatewayPid) -or $gatewayPid -le 0) {
    throw "M2 gateway PID file is invalid. Refusing unbounded process cleanup."
  }

  $existing = Get-Process -Id $gatewayPid -ErrorAction SilentlyContinue
  if ($null -ne $existing) {
    if (-not (Test-OwnedGatewayProcess -ProcessId $gatewayPid)) {
      throw "M2 gateway PID=$gatewayPid does not match $GatewayMarker. Refusing to stop it."
    }
    Stop-Process -Id $gatewayPid -Force -ErrorAction Stop
    Write-Host "PHASE7C_MOBILE_REMOTE_M2_GATEWAY_STOP=PASS|PID=$gatewayPid"
  } else {
    Write-Host "PHASE7C_MOBILE_REMOTE_M2_GATEWAY_STOP=ALREADY_STOPPED|PID=$gatewayPid"
  }
  Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
} else {
  Write-Host "PHASE7C_MOBILE_REMOTE_M2_GATEWAY_STOP=NO_PID_FILE"
}

$localWebUrl = "http://${GatewayHost}:$WebPort/phase7c-mobile"
try {
  $web = Invoke-WebRequest -Uri $localWebUrl -Method Get -UseBasicParsing -TimeoutSec 8
  if ($web.StatusCode -lt 200 -or $web.StatusCode -ge 400) {
    throw "Unexpected status $($web.StatusCode)."
  }
  Write-Host "PHASE7C_MOBILE_REMOTE_M2_LOCAL_WEB_AFTER_ROLLBACK=PASS"
} catch {
  throw "Remote rollback completed but canonical localhost Web is not healthy: $($_.Exception.Message)"
}

Write-Host "PHASE7C_MOBILE_REMOTE_M2_ROLLBACK=PASS"
Write-Host "REMOTE_LAYER=DISABLED"
Write-Host "CANONICAL_WEB_MUTATION=NONE"
Write-Host "CANONICAL_TASK_MUTATION=NONE"
Write-Host "TRADING_PROCESS_MUTATION=NONE"
Write-Host "MODE_MUTATION=NONE"
Write-Host "ARM_MUTATION=NONE"
Write-Host "ORDER_MUTATION=NONE"
Write-Host "POSITION_MUTATION=NONE"

if (-not [string]::IsNullOrWhiteSpace([string]$serveDisableError)) {
  throw "M2 gateway is stopped, but Serve disable could not be attested: $serveDisableError"
}
