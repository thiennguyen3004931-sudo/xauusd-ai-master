param(
  [Parameter(Mandatory = $true)] [string]$WorkDir,
  [int]$IntervalMinutes = 30,
  [int]$Days = 180,
  [decimal]$MaxRiskUsd = 10,
  [string]$PythonExe = "python",
  [string]$BridgeEnv = "",
  [string]$FrozenDir = ""
)

$ErrorActionPreference = "Continue"
if ($IntervalMinutes -lt 1) { throw "IntervalMinutes must be >= 1." }

$Runner = Join-Path $PSScriptRoot "run-phase6d-forward-local.ps1"
$WatchLogDir = Join-Path $WorkDir "phase6d-forward-watch"
$WatchLog = Join-Path $WatchLogDir "phase6d-watch.log"
New-Item -ItemType Directory -Path $WatchLogDir -Force | Out-Null

Write-Host "PHASE6D_WATCH_STATUS=STARTED"
Write-Host "PHASE6D_WATCH_INTERVAL_MINUTES=$IntervalMinutes"
Write-Host "PHASE6D_WATCH_CANDIDATE=BASELINE_BUY_SELL"
Write-Host "PHASE6D_WATCH_WORK_DIR=$WorkDir"
Write-Host "PHASE6D_WATCH_LOG=$WatchLog"
Write-Host "PHASE6D_WATCH_STOP=CTRL+C"

$runNumber = 0
while ($true) {
  $runNumber += 1
  $started = Get-Date
  $header = "PHASE6D_WATCH_RUN_START=$runNumber|$($started.ToString('yyyy-MM-dd HH:mm:ss'))"
  Write-Host $header
  Add-Content -Path $WatchLog -Value $header

  $argsList = @(
    "-ExecutionPolicy", "Bypass",
    "-File", $Runner,
    "-WorkDir", $WorkDir,
    "-Days", [string]$Days,
    "-MaxRiskUsd", [string]$MaxRiskUsd,
    "-PythonExe", $PythonExe
  )
  if (-not [string]::IsNullOrWhiteSpace($BridgeEnv)) { $argsList += @("-BridgeEnv", $BridgeEnv) }
  if (-not [string]::IsNullOrWhiteSpace($FrozenDir)) { $argsList += @("-FrozenDir", $FrozenDir) }

  try {
    & powershell @argsList 2>&1 | Tee-Object -FilePath $WatchLog -Append
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0) {
      $result = "PHASE6D_WATCH_RUN_STATUS=PASS|RUN=$runNumber"
    }
    else {
      $result = "PHASE6D_WATCH_RUN_STATUS=FAIL|RUN=$runNumber|EXIT_CODE=$exitCode"
    }
  }
  catch {
    $result = "PHASE6D_WATCH_RUN_STATUS=ERROR|RUN=$runNumber|MESSAGE=$($_.Exception.Message)"
  }

  Write-Host $result
  Add-Content -Path $WatchLog -Value $result
  $nextRun = (Get-Date).AddMinutes($IntervalMinutes)
  $nextLine = "PHASE6D_WATCH_NEXT_RUN=$($nextRun.ToString('yyyy-MM-dd HH:mm:ss'))"
  Write-Host $nextLine
  Add-Content -Path $WatchLog -Value $nextLine
  Start-Sleep -Seconds ($IntervalMinutes * 60)
}
