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
        Stop-Process -Id $pidValue -Force -ErrorAction Stop
        Write-Host "PHASE7C_${Label}_STOP=PASS|PID=$pidValue"
      } else {
        Write-Host "PHASE7C_${Label}_STOP=ALREADY_EXITED|PID=$pidValue"
      }
    }
  } catch {
    Write-Warning "Could not stop $Label from PID file $Path. $($_.Exception.Message)"
  }
  Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
}

# Stop children first, then supervisor, so a forced supervisor shutdown cannot
# leave live order executors behind.
Stop-PidFile (Join-Path $RuntimeDir "trend.pid") "TREND"
Stop-PidFile (Join-Path $RuntimeDir "sideway.pid") "SIDEWAY"
Stop-PidFile (Join-Path $RuntimeDir "supervisor.pid") "SUPERVISOR"
Remove-Item -LiteralPath (Join-Path $RuntimeDir "phase7c-execution.lock") -Force -ErrorAction SilentlyContinue
Write-Host "PHASE7C_EXECUTOR_STOP=PASS"
