param(
  [Parameter(Mandatory = $true)] [string]$WorkDir
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not [System.IO.Path]::IsPathRooted($WorkDir)) {
  $WorkDir = Join-Path $ProjectRoot $WorkDir
}
if (-not (Test-Path $WorkDir)) {
  Write-Host "PHASE7C_EXECUTOR_STOP=NO_RUNTIME"
  exit 0
}
$WorkDir = (Resolve-Path $WorkDir).Path
$RuntimeDir = Join-Path $WorkDir "phase7c-executors"
if (-not (Test-Path $RuntimeDir)) {
  Write-Host "PHASE7C_EXECUTOR_STOP=NO_RUNTIME"
  exit 0
}

function Stop-ProcessTree([int]$ProcessId, [string]$Label) {
  if ($ProcessId -le 0) { return $false }
  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if ($null -eq $process) { return $false }

  try {
    $taskkill = Join-Path $env:SystemRoot "System32\taskkill.exe"
    if (Test-Path $taskkill) {
      & $taskkill /PID $ProcessId /T /F 2>$null | Out-Null
      Start-Sleep -Milliseconds 150
    } else {
      Stop-Process -Id $ProcessId -Force -ErrorAction Stop
    }
  } catch {
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  }

  return $null -eq (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

function Stop-PidFile([string]$Path, [string]$Label) {
  if (-not (Test-Path $Path)) {
    Write-Host "PHASE7C_${Label}_STOP=NO_PID_FILE"
    return
  }
  try {
    $pidValue = [int](Get-Content -LiteralPath $Path -Raw).Trim()
    if ($pidValue -gt 0) {
      $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
      if ($null -ne $process) {
        $stopped = Stop-ProcessTree $pidValue $Label
        if ($stopped) {
          Write-Host "PHASE7C_${Label}_STOP=PASS_TREE|PID=$pidValue"
        } else {
          Write-Warning "Process tree for $Label PID $pidValue may still be alive."
        }
      } else {
        Write-Host "PHASE7C_${Label}_STOP=ALREADY_EXITED|PID=$pidValue"
      }
    }
  } catch {
    Write-Warning "Could not stop $Label from PID file $Path. $($_.Exception.Message)"
  }
  Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
}

function Stop-OrphanNodeProcess([string]$ScriptName, [string]$Label) {
  try {
    $matches = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction Stop | Where-Object {
      -not [string]::IsNullOrWhiteSpace([string]$_.CommandLine) -and
      [string]$_.CommandLine -like "*$ScriptName*"
    })
    foreach ($match in $matches) {
      $pidValue = [int]$match.ProcessId
      if ($pidValue -le 0) { continue }
      $stopped = Stop-ProcessTree $pidValue $Label
      if ($stopped) {
        Write-Host "PHASE7C_${Label}_ORPHAN_STOP=PASS|PID=$pidValue"
      } else {
        Write-Warning "Could not fully stop orphan $Label Node process PID $pidValue."
      }
    }
  } catch {
    Write-Warning "Could not inspect orphan $Label Node processes. $($_.Exception.Message)"
  }
}

# Stop helper launchers as complete process trees so node.exe children cannot
# survive a supervisor/activation restart and compete for Telegram getUpdates.
Stop-PidFile (Join-Path $RuntimeDir "telegram-mode.pid") "TELEGRAM_MODE"
Stop-PidFile (Join-Path $RuntimeDir "regime-notifier.pid") "REGIME_NOTIFIER"

# Stop order-capable children before the supervisor.
Stop-PidFile (Join-Path $RuntimeDir "trend.pid") "TREND"
Stop-PidFile (Join-Path $RuntimeDir "sideway.pid") "SIDEWAY"
Stop-PidFile (Join-Path $RuntimeDir "supervisor.pid") "SUPERVISOR"

# Clean up Node children left by older versions that only killed the launcher PID.
Stop-OrphanNodeProcess "run-phase7c-telegram-mode-controller.mjs" "TELEGRAM_MODE"
Stop-OrphanNodeProcess "run-phase7c-regime-notifier.mjs" "REGIME_NOTIFIER"
Stop-OrphanNodeProcess "run-phase7c-trend-controller.mjs" "TREND"
Stop-OrphanNodeProcess "run-phase7c-sideway-locked.mjs" "SIDEWAY"
Stop-OrphanNodeProcess "run-phase7c-sideway-controller.mjs" "SIDEWAY"

Remove-Item -LiteralPath (Join-Path $RuntimeDir "phase7c-execution.lock") -Force -ErrorAction SilentlyContinue
Write-Host "PHASE7C_EXECUTOR_STOP=PASS"
