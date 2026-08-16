param(
  [Parameter(Mandatory = $true)] [string]$WorkDir,
  [string]$ControlApiUrl = "http://127.0.0.1:3711",
  [string]$EnvFile = "packages/mt5-broker/bridge/.env.phase7b-demo",
  [double]$SidewayRiskPercent = 0.25,
  [double]$SidewayMaxLot = 0.03,
  [int]$DependencyWaitSeconds = 120,
  [switch]$Armed,
  [switch]$Once
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$TrendLauncher = Join-Path $PSScriptRoot "run-phase7c-trend-controller-local.ps1"
$SidewayLauncher = Join-Path $PSScriptRoot "run-phase7c-sideway-controller-local.ps1"

if (-not (Test-Path $TrendLauncher)) { throw "Trend launcher not found: $TrendLauncher" }
if (-not (Test-Path $SidewayLauncher)) { throw "Sideway launcher not found: $SidewayLauncher" }
if ($DependencyWaitSeconds -lt 10) { throw "DependencyWaitSeconds must be >= 10." }

if (-not [System.IO.Path]::IsPathRooted($WorkDir)) {
  $WorkDir = Join-Path $ProjectRoot $WorkDir
}
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
$WorkDir = (Resolve-Path $WorkDir).Path

if (-not [System.IO.Path]::IsPathRooted($EnvFile)) {
  $EnvFile = Join-Path $ProjectRoot $EnvFile
}
if (-not (Test-Path $EnvFile)) { throw "Environment file not found: $EnvFile" }
$EnvFile = (Resolve-Path $EnvFile).Path

$RuntimeDir = Join-Path $WorkDir "phase7c-executors"
$TrendWorkDir = Join-Path $WorkDir "phase7b-demo-forward"
$SidewayWorkDir = Join-Path $WorkDir "phase7c-sideway-forward"
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
New-Item -ItemType Directory -Force -Path $TrendWorkDir | Out-Null
New-Item -ItemType Directory -Force -Path $SidewayWorkDir | Out-Null

$env:ZIQ_PHASE7C_EXECUTION_LOCK = Join-Path $RuntimeDir "phase7c-execution.lock"
$SupervisorPidPath = Join-Path $RuntimeDir "supervisor.pid"
$TrendPidPath = Join-Path $RuntimeDir "trend.pid"
$SidewayPidPath = Join-Path $RuntimeDir "sideway.pid"
$TrendOut = Join-Path $RuntimeDir "trend.out.log"
$TrendErr = Join-Path $RuntimeDir "trend.err.log"
$SidewayOut = Join-Path $RuntimeDir "sideway.out.log"
$SidewayErr = Join-Path $RuntimeDir "sideway.err.log"

function Read-EnvValue([string]$Name) {
  foreach ($raw in Get-Content -LiteralPath $EnvFile) {
    $line = $raw.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { continue }
    $index = $line.IndexOf("=")
    $key = $line.Substring(0, $index).Trim().TrimStart([char]0xFEFF)
    if ($key -ne $Name) { continue }
    $value = $line.Substring($index + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    return $value
  }
  return ""
}

function Stop-PidFile([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  try {
    $pidValue = [int](Get-Content -LiteralPath $Path -Raw).Trim()
    if ($pidValue -gt 0) {
      Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue
    }
  } catch {}
  Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
}

function Read-LogTail([string]$Path, [int]$Lines = 30) {
  if (-not (Test-Path $Path)) { return "<log not found: $Path>" }
  try {
    return ((Get-Content -LiteralPath $Path -Tail $Lines -ErrorAction Stop) -join [Environment]::NewLine)
  } catch {
    return "<could not read log: $Path>"
  }
}

function Assert-ShadowProcessSuccess($Process, [string]$Label, [string]$StdOut, [string]$StdErr, [string]$PassMarker) {
  $Process.Refresh()
  $exitCode = $Process.ExitCode
  $exitCodeKnown = $null -ne $exitCode
  $outText = if (Test-Path $StdOut) { Get-Content -LiteralPath $StdOut -Raw -ErrorAction SilentlyContinue } else { "" }
  $markerFound = -not [string]::IsNullOrWhiteSpace($outText) -and $outText.Contains($PassMarker)

  if (($exitCodeKnown -and [int]$exitCode -ne 0) -or -not $markerFound) {
    $exitText = if ($exitCodeKnown) { [string]$exitCode } else { "UNAVAILABLE" }
    $stderrTail = Read-LogTail $StdErr
    $stdoutTail = Read-LogTail $StdOut
    throw "$Label shadow/preflight failed. exitCode=$exitText markerFound=$markerFound`nSTDERR:`n$stderrTail`nSTDOUT:`n$stdoutTail"
  }

  $safeExitCode = if ($exitCodeKnown) { [string]$exitCode } else { "UNAVAILABLE" }
  Write-Host "PHASE7C_${Label}_SHADOW_EXIT_CODE=$safeExitCode"
  Write-Host "PHASE7C_${Label}_SHADOW_PREFLIGHT=PASS"
}

function Wait-Phase7CDependencies {
  $apiKey = Read-EnvValue "MT5_API_KEY"
  $bridgeHost = Read-EnvValue "MT5_BRIDGE_HOST"
  $bridgePort = Read-EnvValue "MT5_BRIDGE_PORT"
  if ([string]::IsNullOrWhiteSpace($apiKey)) { throw "MT5_API_KEY is missing from $EnvFile" }
  if ([string]::IsNullOrWhiteSpace($bridgeHost)) { $bridgeHost = "127.0.0.1" }
  if ([string]::IsNullOrWhiteSpace($bridgePort)) { $bridgePort = "8765" }
  $bridgeBase = "http://${bridgeHost}:${bridgePort}"
  $deadline = (Get-Date).AddSeconds($DependencyWaitSeconds)
  $lastBridgeError = "not checked"
  $lastApiError = "not checked"

  while ((Get-Date) -lt $deadline) {
    $bridgeReady = $false
    $apiReady = $false
    try {
      $health = Invoke-RestMethod -Uri "$bridgeBase/health" -Headers @{ "x-mt5-api-key" = $apiKey } -Method Get -TimeoutSec 4
      if ($health.connected -and $health.status -eq "ok" -and $health.accountMode -eq "demo") {
        $bridgeReady = $true
      } else {
        $lastBridgeError = "connected=$($health.connected);status=$($health.status);mode=$($health.accountMode)"
      }
    } catch {
      $lastBridgeError = $_.Exception.Message
    }

    try {
      $mode = Invoke-RestMethod -Uri "$($ControlApiUrl.TrimEnd('/'))/api/v1/phase7c/bot-mode" -Method Get -TimeoutSec 4
      if ($null -ne $mode.state.mode) {
        $apiReady = $true
      } else {
        $lastApiError = "bot-mode response missing state.mode"
      }
    } catch {
      $lastApiError = $_.Exception.Message
    }

    if ($bridgeReady -and $apiReady) {
      Write-Host "PHASE7C_DEPENDENCY_BRIDGE=PASS"
      Write-Host "PHASE7C_DEPENDENCY_CONTROL_API=PASS"
      Write-Host "PHASE7C_DEPENDENCY_ACCOUNT_MODE=demo"
      return
    }
    Start-Sleep -Seconds 2
  }

  throw "Phase 7C dependencies were not ready within $DependencyWaitSeconds seconds. Bridge=[$lastBridgeError] ControlAPI=[$lastApiError]"
}

# Any prior detached child from a killed supervisor is explicitly cleaned up.
Stop-PidFile $TrendPidPath
Stop-PidFile $SidewayPidPath
Remove-Item -LiteralPath $env:ZIQ_PHASE7C_EXECUTION_LOCK -Force -ErrorAction SilentlyContinue
Set-Content -LiteralPath $SupervisorPidPath -Value $PID -Encoding ascii

$common = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass"
)
$trendArgs = @(
  "-File", ('"{0}"' -f $TrendLauncher),
  "-ControlApiUrl", ('"{0}"' -f $ControlApiUrl),
  "-EnvFile", ('"{0}"' -f $EnvFile),
  "-WorkDir", ('"{0}"' -f $TrendWorkDir)
)
$sidewayArgs = @(
  "-File", ('"{0}"' -f $SidewayLauncher),
  "-ControlApiUrl", ('"{0}"' -f $ControlApiUrl),
  "-EnvFile", ('"{0}"' -f $EnvFile),
  "-WorkDir", ('"{0}"' -f $SidewayWorkDir),
  "-RiskPercent", $SidewayRiskPercent.ToString([System.Globalization.CultureInfo]::InvariantCulture),
  "-MaxLot", $SidewayMaxLot.ToString([System.Globalization.CultureInfo]::InvariantCulture)
)
if ($Armed) {
  $trendArgs += "-Armed"
  $sidewayArgs += "-Armed"
}
if ($Once) {
  $trendArgs += "-Once"
  $sidewayArgs += "-Once"
}

Write-Host "PHASE7C_EXECUTOR_SUPERVISOR=STARTING"
Write-Host "PHASE7C_EXECUTOR_WORK_DIR=$WorkDir"
Write-Host "PHASE7C_EXECUTOR_CONTROL_API=$ControlApiUrl"
Write-Host "PHASE7C_EXECUTOR_ARMED=$($Armed.IsPresent)"
Write-Host "PHASE7C_EXECUTOR_DEMO_ONLY=TRUE"
Write-Host "PHASE7C_EXECUTION_LOCK=$($env:ZIQ_PHASE7C_EXECUTION_LOCK)"
Write-Host "PHASE7C_TREND_RUNTIME=$TrendWorkDir"
Write-Host "PHASE7C_SIDEWAY_RUNTIME=$SidewayWorkDir"
Write-Host "PHASE7C_DEPENDENCY_WAIT_SECONDS=$DependencyWaitSeconds"

$trend = $null
$sideway = $null
try {
  Wait-Phase7CDependencies

  $trend = Start-Process -FilePath "powershell.exe" -ArgumentList ($common + $trendArgs) -WorkingDirectory $ProjectRoot -RedirectStandardOutput $TrendOut -RedirectStandardError $TrendErr -PassThru
  Set-Content -LiteralPath $TrendPidPath -Value $trend.Id -Encoding ascii
  Write-Host "PHASE7C_TREND_PID=$($trend.Id)"

  $sideway = Start-Process -FilePath "powershell.exe" -ArgumentList ($common + $sidewayArgs) -WorkingDirectory $ProjectRoot -RedirectStandardOutput $SidewayOut -RedirectStandardError $SidewayErr -PassThru
  Set-Content -LiteralPath $SidewayPidPath -Value $sideway.Id -Encoding ascii
  Write-Host "PHASE7C_SIDEWAY_PID=$($sideway.Id)"

  if ($Once -or -not $Armed) {
    $trend.WaitForExit()
    $sideway.WaitForExit()
    Assert-ShadowProcessSuccess $trend "TREND" $TrendOut $TrendErr "PHASE7B_DEMO_PREFLIGHT_STATUS=PASS"
    Assert-ShadowProcessSuccess $sideway "SIDEWAY" $SidewayOut $SidewayErr "PHASE7C_SIDEWAY_PREFLIGHT_STATUS=PASS"
    Write-Host "PHASE7C_EXECUTOR_SHADOW_STATUS=PASS"
    return
  }

  Start-Sleep -Seconds 3
  $trend.Refresh()
  $sideway.Refresh()
  if ($trend.HasExited) { throw "Trend executor exited during startup with code $($trend.ExitCode). Check $TrendErr" }
  if ($sideway.HasExited) { throw "Sideway executor exited during startup with code $($sideway.ExitCode). Check $SidewayErr" }
  Write-Host "PHASE7C_EXECUTOR_ARMED_STATUS=RUNNING"

  while ($true) {
    Start-Sleep -Seconds 2
    $trend.Refresh()
    $sideway.Refresh()
    if ($trend.HasExited) { throw "Trend executor stopped unexpectedly with code $($trend.ExitCode)." }
    if ($sideway.HasExited) { throw "Sideway executor stopped unexpectedly with code $($sideway.ExitCode)." }
  }
}
finally {
  if ($null -ne $trend -and -not $trend.HasExited) { Stop-Process -Id $trend.Id -Force -ErrorAction SilentlyContinue }
  if ($null -ne $sideway -and -not $sideway.HasExited) { Stop-Process -Id $sideway.Id -Force -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $TrendPidPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $SidewayPidPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $SupervisorPidPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $env:ZIQ_PHASE7C_EXECUTION_LOCK -Force -ErrorAction SilentlyContinue
}
