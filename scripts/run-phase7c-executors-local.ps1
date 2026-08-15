param(
  [Parameter(Mandatory = $true)] [string]$WorkDir,
  [string]$ControlApiUrl = "http://127.0.0.1:3711",
  [string]$EnvFile = "packages/mt5-broker/bridge/.env.phase7b-demo",
  [double]$SidewayRiskPercent = 0.25,
  [double]$SidewayMaxLot = 0.03,
  [switch]$Armed,
  [switch]$Once
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$TrendLauncher = Join-Path $PSScriptRoot "run-phase7c-trend-controller-local.ps1"
$SidewayLauncher = Join-Path $PSScriptRoot "run-phase7c-sideway-controller-local.ps1"

if (-not (Test-Path $TrendLauncher)) { throw "Trend launcher not found: $TrendLauncher" }
if (-not (Test-Path $SidewayLauncher)) { throw "Sideway launcher not found: $SidewayLauncher" }

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

$trend = $null
$sideway = $null
try {
  $trend = Start-Process -FilePath "powershell.exe" -ArgumentList ($common + $trendArgs) -WorkingDirectory $ProjectRoot -RedirectStandardOutput $TrendOut -RedirectStandardError $TrendErr -PassThru
  Set-Content -LiteralPath $TrendPidPath -Value $trend.Id -Encoding ascii
  Write-Host "PHASE7C_TREND_PID=$($trend.Id)"

  $sideway = Start-Process -FilePath "powershell.exe" -ArgumentList ($common + $sidewayArgs) -WorkingDirectory $ProjectRoot -RedirectStandardOutput $SidewayOut -RedirectStandardError $SidewayErr -PassThru
  Set-Content -LiteralPath $SidewayPidPath -Value $sideway.Id -Encoding ascii
  Write-Host "PHASE7C_SIDEWAY_PID=$($sideway.Id)"

  if ($Once -or -not $Armed) {
    $trend.WaitForExit()
    $sideway.WaitForExit()
    if ($trend.ExitCode -ne 0) { throw "Trend shadow/preflight exited with code $($trend.ExitCode). Check $TrendErr" }
    if ($sideway.ExitCode -ne 0) { throw "Sideway shadow/preflight exited with code $($sideway.ExitCode). Check $SidewayErr" }
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
