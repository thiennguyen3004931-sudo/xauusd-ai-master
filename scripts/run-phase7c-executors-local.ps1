param(
  [Parameter(Mandatory = $true)] [string]$WorkDir,
  [string]$ControlApiUrl = "http://127.0.0.1:3711",
  [string]$EnvFile = "packages/mt5-broker/bridge/.env.phase7b-demo",
  [string]$TelegramEnvFile = ".env.phase7b-telegram",
  [double]$SidewayRiskPercent = 0.25,
  [double]$SidewayMaxLot = 0.03,
  [int]$DependencyWaitSeconds = 120,
  [switch]$DisableTelegram,
  [switch]$Armed,
  [switch]$Once
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$TrendLauncher = Join-Path $PSScriptRoot "run-phase7c-trend-controller-local.ps1"
$SidewayLauncher = Join-Path $PSScriptRoot "run-phase7c-sideway-controller-local.ps1"
$TelegramModeLauncher = Join-Path $PSScriptRoot "run-phase7c-telegram-mode-controller-local.ps1"
$RegimeNotifierLauncher = Join-Path $PSScriptRoot "run-phase7c-regime-notifier-local.ps1"

if (-not (Test-Path $TrendLauncher)) { throw "Trend launcher not found: $TrendLauncher" }
if (-not (Test-Path $SidewayLauncher)) { throw "Sideway launcher not found: $SidewayLauncher" }
if (-not (Test-Path $TelegramModeLauncher)) { throw "Telegram mode launcher not found: $TelegramModeLauncher" }
if (-not (Test-Path $RegimeNotifierLauncher)) { throw "Regime notifier launcher not found: $RegimeNotifierLauncher" }
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

if (-not [System.IO.Path]::IsPathRooted($TelegramEnvFile)) {
  $TelegramEnvFile = Join-Path $ProjectRoot $TelegramEnvFile
}
if (Test-Path $TelegramEnvFile) {
  $TelegramEnvFile = (Resolve-Path $TelegramEnvFile).Path
}

$RuntimeDir = Join-Path $WorkDir "phase7c-executors"
$TrendWorkDir = Join-Path $WorkDir "phase7b-demo-forward"
$SidewayWorkDir = Join-Path $WorkDir "phase7c-sideway-forward"
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
New-Item -ItemType Directory -Force -Path $TrendWorkDir | Out-Null
New-Item -ItemType Directory -Force -Path $SidewayWorkDir | Out-Null

$env:ZIQ_PHASE7C_EXECUTION_LOCK = Join-Path $RuntimeDir "phase7c-execution.lock"
$env:ZIQ_PHASE7C_REGIME_STATE_FILE = Join-Path $RuntimeDir "regime-notifier-state.json"
$SupervisorPidPath = Join-Path $RuntimeDir "supervisor.pid"
$TrendPidPath = Join-Path $RuntimeDir "trend.pid"
$SidewayPidPath = Join-Path $RuntimeDir "sideway.pid"
$TelegramModePidPath = Join-Path $RuntimeDir "telegram-mode.pid"
$RegimeNotifierPidPath = Join-Path $RuntimeDir "regime-notifier.pid"
$TrendOut = Join-Path $RuntimeDir "trend.out.log"
$TrendErr = Join-Path $RuntimeDir "trend.err.log"
$SidewayOut = Join-Path $RuntimeDir "sideway.out.log"
$SidewayErr = Join-Path $RuntimeDir "sideway.err.log"
$TelegramModeOut = Join-Path $RuntimeDir "telegram-mode.out.log"
$TelegramModeErr = Join-Path $RuntimeDir "telegram-mode.err.log"
$RegimeNotifierOut = Join-Path $RuntimeDir "regime-notifier.out.log"
$RegimeNotifierErr = Join-Path $RuntimeDir "regime-notifier.err.log"

function Read-EnvValueFromFile([string]$Path, [string]$Name) {
  if (-not (Test-Path $Path)) { return "" }
  foreach ($raw in Get-Content -LiteralPath $Path) {
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

function Read-EnvValue([string]$Name) {
  return Read-EnvValueFromFile $EnvFile $Name
}

function Stop-ProcessTree([int]$ProcessId) {
  if ($ProcessId -le 0) { return }

  try {
    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($null -eq $process) { return }

    Write-Host "PHASE7C_STOP_PROCESS_TREE_PID=$ProcessId"

    & "$env:SystemRoot\System32\taskkill.exe" `
      /PID $ProcessId `
      /T `
      /F 2>$null | Out-Null
  } catch {
    Write-Warning "Could not stop process tree PID=$ProcessId : $($_.Exception.Message)"
  }
}

function Stop-Phase7CExecutorOrphans {
  $patterns = @(
    "run-phase7c-trend-controller-local.ps1",
    "run-phase7c-trend-controller.mjs",
    ".phase7c-trend-legacy-runtime-",
    "run-phase7c-sideway-controller-local.ps1",
    "run-phase7c-sideway-locked.mjs",
    "run-phase7c-telegram-mode-controller-local.ps1",
    "run-phase7c-telegram-mode-controller.mjs",
    "run-phase7c-regime-notifier-local.ps1",
    "run-phase7c-regime-notifier.mjs"
  )

  $targets = @(
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object {
        $commandLine = $_.CommandLine

        if ([string]::IsNullOrWhiteSpace($commandLine)) {
          return $false
        }

        foreach ($pattern in $patterns) {
          if ($commandLine -like "*$pattern*") {
            return $true
          }
        }

        return $false
      } |
      Sort-Object ProcessId -Unique
  )

  foreach ($target in ($targets | Sort-Object ProcessId -Descending)) {

    Write-Host "PHASE7C_ORPHAN_CLEANUP_PID=$($target.ProcessId)|NAME=$($target.Name)"

    try {
      & "$env:SystemRoot\System32\taskkill.exe" `
        /PID $target.ProcessId `
        /T `
        /F 2>$null | Out-Null
    } catch {}
  }

  Start-Sleep -Milliseconds 500
}

function Stop-PidFile([string]$Path) {
  if (-not (Test-Path $Path)) { return }

  try {
    $pidValue = [int](Get-Content -LiteralPath $Path -Raw).Trim()

    if ($pidValue -gt 0) {
      Stop-ProcessTree $pidValue
    }
  } catch {}

  Remove-Item `
    -LiteralPath $Path `
    -Force `
    -ErrorAction SilentlyContinue
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

$TelegramConfigured = $false
if (-not $DisableTelegram -and (Test-Path $TelegramEnvFile)) {
  $telegramToken = Read-EnvValueFromFile $TelegramEnvFile "ZIQ_TELEGRAM_BOT_TOKEN"
  $telegramChatId = Read-EnvValueFromFile $TelegramEnvFile "ZIQ_TELEGRAM_CHAT_ID"
  if (-not [string]::IsNullOrWhiteSpace($telegramToken) -and -not [string]::IsNullOrWhiteSpace($telegramChatId)) {
    $TelegramConfigured = $true
  } else {
    Write-Warning "Telegram env exists but ZIQ_TELEGRAM_BOT_TOKEN/ZIQ_TELEGRAM_CHAT_ID is incomplete. Telegram services will stay disabled."
  }
}

# Any prior detached child from a killed supervisor is explicitly cleaned up.
Stop-PidFile $TrendPidPath
Stop-PidFile $SidewayPidPath
Stop-PidFile $TelegramModePidPath
Stop-PidFile $RegimeNotifierPidPath

# PID wrappers may already have exited while Node descendants remain.
# Sweep all known Phase 7C executor command lines before relaunch.
Stop-Phase7CExecutorOrphans
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
$telegramModeArgs = @(
  "-File", ('"{0}"' -f $TelegramModeLauncher),
  "-EnvFile", ('"{0}"' -f $TelegramEnvFile),
  "-ControlApiUrl", ('"{0}"' -f $ControlApiUrl)
)
$regimeNotifierArgs = @(
  "-File", ('"{0}"' -f $RegimeNotifierLauncher),
  "-EnvFile", ('"{0}"' -f $TelegramEnvFile),
  "-ControlApiUrl", ('"{0}"' -f $ControlApiUrl),
  "-Symbol", "XAUUSD"
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
Write-Host "PHASE7C_TELEGRAM_CONFIGURED=$TelegramConfigured"
Write-Host "PHASE7C_TELEGRAM_MT5_ORDER_PERMISSION=NONE"

function Start-TelegramModeChild {
  $process = Start-Process -FilePath "powershell.exe" -ArgumentList ($common + $telegramModeArgs) -WorkingDirectory $ProjectRoot -RedirectStandardOutput $TelegramModeOut -RedirectStandardError $TelegramModeErr -PassThru
  Set-Content -LiteralPath $TelegramModePidPath -Value $process.Id -Encoding ascii
  Write-Host "PHASE7C_TELEGRAM_MODE_PID=$($process.Id)"
  return $process
}

function Start-RegimeNotifierChild {
  $process = Start-Process -FilePath "powershell.exe" -ArgumentList ($common + $regimeNotifierArgs) -WorkingDirectory $ProjectRoot -RedirectStandardOutput $RegimeNotifierOut -RedirectStandardError $RegimeNotifierErr -PassThru
  Set-Content -LiteralPath $RegimeNotifierPidPath -Value $process.Id -Encoding ascii
  Write-Host "PHASE7C_REGIME_NOTIFIER_PID=$($process.Id)"
  return $process
}

$trend = $null
$sideway = $null
$telegramMode = $null
$regimeNotifier = $null
try {
  Wait-Phase7CDependencies

  $trend = Start-Process -FilePath "powershell.exe" -ArgumentList ($common + $trendArgs) -WorkingDirectory $ProjectRoot -RedirectStandardOutput $TrendOut -RedirectStandardError $TrendErr -PassThru
  Set-Content -LiteralPath $TrendPidPath -Value $trend.Id -Encoding ascii
  Write-Host "PHASE7C_TREND_PID=$($trend.Id)"

  $sideway = Start-Process -FilePath "powershell.exe" -ArgumentList ($common + $sidewayArgs) -WorkingDirectory $ProjectRoot -RedirectStandardOutput $SidewayOut -RedirectStandardError $SidewayErr -PassThru
  Set-Content -LiteralPath $SidewayPidPath -Value $sideway.Id -Encoding ascii
  Write-Host "PHASE7C_SIDEWAY_PID=$($sideway.Id)"

  if ($Once) {
    $trend.WaitForExit()
    $sideway.WaitForExit()
    Assert-ShadowProcessSuccess $trend "TREND" $TrendOut $TrendErr "PHASE7B_DEMO_PREFLIGHT_STATUS=PASS"
    Assert-ShadowProcessSuccess $sideway "SIDEWAY" $SidewayOut $SidewayErr "PHASE7C_SIDEWAY_PREFLIGHT_STATUS=PASS"
    Write-Host "PHASE7C_TELEGRAM_ONCE=SKIPPED"
    Write-Host "PHASE7C_EXECUTOR_SHADOW_STATUS=PASS"
    return
  }

  if (-not $Armed) {
    $trend.WaitForExit()
    $sideway.WaitForExit()
    Assert-ShadowProcessSuccess $trend "TREND" $TrendOut $TrendErr "PHASE7B_DEMO_PREFLIGHT_STATUS=PASS"
    Assert-ShadowProcessSuccess $sideway "SIDEWAY" $SidewayOut $SidewayErr "PHASE7C_SIDEWAY_PREFLIGHT_STATUS=PASS"
    $trend = $null
    $sideway = $null
    Write-Host "PHASE7C_EXECUTOR_SHADOW_STATUS=PASS"
    Write-Host "PHASE7C_EXECUTOR_UNARMED_SUPERVISOR=TELEGRAM_MODE_ONLY"
  } else {
    Start-Sleep -Seconds 3
    $trend.Refresh()
    $sideway.Refresh()
    if ($trend.HasExited) { throw "Trend executor exited during startup with code $($trend.ExitCode). Check $TrendErr" }
    if ($sideway.HasExited) { throw "Sideway executor exited during startup with code $($sideway.ExitCode). Check $SidewayErr" }
    Write-Host "PHASE7C_EXECUTOR_ARMED_STATUS=RUNNING"
  }

  if ($TelegramConfigured) {
    $telegramMode = Start-TelegramModeChild
    if ($Armed) {
      $regimeNotifier = Start-RegimeNotifierChild
    }
    Start-Sleep -Seconds 3
    $telegramMode.Refresh()
    if ($telegramMode.HasExited) {
      Write-Warning "Telegram mode controller exited during startup. Supervisor will retry. Check $TelegramModeErr"
      Remove-Item -LiteralPath $TelegramModePidPath -Force -ErrorAction SilentlyContinue
      $telegramMode = $null
      Write-Host "PHASE7C_TELEGRAM_MODE_STATUS=RESTART_PENDING"
    } else {
      Write-Host "PHASE7C_TELEGRAM_MODE_STATUS=RUNNING"
    }
    if ($null -ne $regimeNotifier) {
      $regimeNotifier.Refresh()
      if ($regimeNotifier.HasExited) {
        Write-Warning "Regime notifier exited during startup. Supervisor will retry. Check $RegimeNotifierErr"
        Remove-Item -LiteralPath $RegimeNotifierPidPath -Force -ErrorAction SilentlyContinue
        $regimeNotifier = $null
        Write-Host "PHASE7C_REGIME_NOTIFIER_STATUS=RESTART_PENDING"
      } else {
        Write-Host "PHASE7C_REGIME_NOTIFIER_STATUS=RUNNING"
      }
    }
  } else {
    Write-Host "PHASE7C_TELEGRAM_STATUS=NOT_CONFIGURED_OR_DISABLED"
  }

  while ($true) {
    Start-Sleep -Seconds 2
    if ($null -ne $trend) {
      $trend.Refresh()
      if ($trend.HasExited) { throw "Trend executor stopped unexpectedly with code $($trend.ExitCode)." }
    }
    if ($null -ne $sideway) {
      $sideway.Refresh()
      if ($sideway.HasExited) { throw "Sideway executor stopped unexpectedly with code $($sideway.ExitCode)." }
    }

    if ($null -ne $telegramMode) {
      $telegramMode.Refresh()
      if ($telegramMode.HasExited) {
        Write-Warning "Telegram mode controller stopped unexpectedly. Supervisor will restart it. Check $TelegramModeErr"
        Remove-Item -LiteralPath $TelegramModePidPath -Force -ErrorAction SilentlyContinue
        $telegramMode = $null
        Write-Host "PHASE7C_TELEGRAM_MODE_STATUS=RESTART_PENDING"
      }
    } elseif ($TelegramConfigured) {
      try {
        $telegramMode = Start-TelegramModeChild
        Write-Host "PHASE7C_TELEGRAM_MODE_STATUS=RESTARTED"
      } catch {
        Write-Warning "Telegram mode controller restart failed: $($_.Exception.Message)"
      }
    }
    if ($null -ne $regimeNotifier) {
      $regimeNotifier.Refresh()
      if ($regimeNotifier.HasExited) {
        Write-Warning "Regime notifier stopped unexpectedly. Supervisor will restart it. Check $RegimeNotifierErr"
        Remove-Item -LiteralPath $RegimeNotifierPidPath -Force -ErrorAction SilentlyContinue
        $regimeNotifier = $null
        Write-Host "PHASE7C_REGIME_NOTIFIER_STATUS=RESTART_PENDING"
      }
    } elseif ($TelegramConfigured -and $Armed) {
      try {
        $regimeNotifier = Start-RegimeNotifierChild
        Write-Host "PHASE7C_REGIME_NOTIFIER_STATUS=RESTARTED"
      } catch {
        Write-Warning "Regime notifier restart failed: $($_.Exception.Message)"
      }
    }
  }
}
finally {
  if ($null -ne $telegramMode -and -not $telegramMode.HasExited) {
    Stop-ProcessTree $telegramMode.Id
  }

  if ($null -ne $regimeNotifier -and -not $regimeNotifier.HasExited) {
    Stop-ProcessTree $regimeNotifier.Id
  }

  if ($null -ne $trend -and -not $trend.HasExited) {
    Stop-ProcessTree $trend.Id
  }

  if ($null -ne $sideway -and -not $sideway.HasExited) {
    Stop-ProcessTree $sideway.Id
  }

  # Final fallback for children whose PowerShell wrapper already exited.
  Stop-Phase7CExecutorOrphans
  Remove-Item -LiteralPath $TelegramModePidPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $RegimeNotifierPidPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $TrendPidPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $SidewayPidPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $SupervisorPidPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $env:ZIQ_PHASE7C_EXECUTION_LOCK -Force -ErrorAction SilentlyContinue
}
