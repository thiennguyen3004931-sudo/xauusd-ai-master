param(
  [int]$RestartDelaySeconds = 15
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Supervisor = Join-Path $PSScriptRoot "run-phase7c-executors-local.ps1"
$GuardLibrary = Join-Path $PSScriptRoot "lib\phase7c-startup-runner-guard.ps1"
$AccountLibrary = Join-Path $PSScriptRoot "lib\phase7c-account-mode.ps1"
$ConfigPath = Join-Path $ProjectRoot ".runtime\phase7c-executor-task-config.json"

foreach ($required in @($Supervisor, $GuardLibrary, $AccountLibrary, $ConfigPath)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "Phase7C startup runner required file not found: $required" }
}
if ($RestartDelaySeconds -lt 5 -or $RestartDelaySeconds -gt 300) { throw "RestartDelaySeconds must be between 5 and 300." }
. $GuardLibrary
. $AccountLibrary

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$configVersion = [int]$config.version
if ($configVersion -notin @(1, 2)) { throw "Unsupported executor task config version: $configVersion" }
if (-not [bool]$config.armed) { throw "Executor task config must remain armed=true." }

if ($configVersion -eq 1) {
  if (-not [bool]$config.demoOnly) { throw "Legacy v1 executor task config must remain demoOnly=true." }
  $accountMode = "DEMO"
  $liveExecutionEnabled = $false
} else {
  $accountMode = ConvertTo-Phase7CAccountMode ([string]$config.accountMode)
  $liveExecutionEnabled = if ($null -ne $config.PSObject.Properties["liveExecutionEnabled"]) { [bool]$config.liveExecutionEnabled } else { $false }
  $demoOnly = if ($null -ne $config.PSObject.Properties["demoOnly"]) { [bool]$config.demoOnly } else { $accountMode -eq "DEMO" }
  if ($accountMode -eq "DEMO" -and -not $demoOnly) { throw "DEMO v2 task config must keep demoOnly=true." }
  if ($accountMode -eq "DEMO" -and $liveExecutionEnabled) { throw "DEMO v2 task config cannot enable liveExecutionEnabled." }
  if ($accountMode -eq "LIVE" -and $demoOnly) { throw "LIVE v2 task config must set demoOnly=false." }
  if ($accountMode -eq "LIVE" -and -not $liveExecutionEnabled) { throw "LIVE v2 task config requires liveExecutionEnabled=true." }
}

$workDir = [string]$config.workDir
$controlApiUrl = [string]$config.controlApiUrl
$envFile = [string]$config.envFile
$telegramEnvFile = [string]$config.telegramEnvFile
$nodePath = [string]$config.nodePath
$pnpmPath = [string]$config.pnpmPath
$trendFixedVolume = if ($null -ne $config.PSObject.Properties["trendFixedVolume"]) { [double]$config.trendFixedVolume } else { 0.03 }
$sidewayRiskPercent = [double]$config.sidewayRiskPercent
$sidewayMaxLot = [double]$config.sidewayMaxLot

if (-not (Test-Path $workDir)) { throw "Executor task WorkDir not found: $workDir" }
if (-not (Test-Path $telegramEnvFile)) { throw "Executor task TelegramEnvFile not found: $telegramEnvFile" }
if ([string]::IsNullOrWhiteSpace($nodePath) -or -not (Test-Path $nodePath -PathType Leaf)) { throw "Executor task nodePath is missing/invalid: $nodePath" }
if ([string]::IsNullOrWhiteSpace($pnpmPath) -or -not (Test-Path $pnpmPath -PathType Leaf)) { throw "Executor task pnpmPath is missing/invalid: $pnpmPath" }
$envInfo = Assert-Phase7CAccountEnv -EnvFile $envFile -AccountMode $accountMode -RequireTrading
$envFile = $envInfo.envFile

$lotSettingsPath = Join-Path $workDir "phase7c-lot-settings.json"
if (Test-Path $lotSettingsPath) {
  try {
    $lotSettings = Get-Content -LiteralPath $lotSettingsPath -Raw | ConvertFrom-Json
    [void](Assert-Phase7CRiskProfile $lotSettings "Executor task lot settings")
    $trendFixedVolume = [double]$lotSettings.trendFixedLot
    $sidewayRiskPercent = [double]$lotSettings.sidewayRiskPercent
    $sidewayMaxLot = [double]$lotSettings.sidewayMaxLot
  } catch {
    throw "Executor task lot settings are invalid at $lotSettingsPath. $($_.Exception.Message)"
  }
}
[void](Assert-Phase7CRiskProfile ([pscustomobject]@{
  version = 1
  trendFixedLot = $trendFixedVolume
  sidewayRiskPercent = $sidewayRiskPercent
  sidewayMaxLot = $sidewayMaxLot
}) "Executor task effective lot settings")

$nodeDir = Split-Path -Parent $nodePath
$pnpmDir = Split-Path -Parent $pnpmPath
$currentPathParts = @($env:PATH -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
$prepend = @($pnpmDir, $nodeDir) | Select-Object -Unique
$remaining = @($currentPathParts | Where-Object { $prepend -notcontains $_ })
$env:PATH = (@($prepend) + @($remaining)) -join ';'
$env:PHASE7C_NODE_PATH = $nodePath
$env:PHASE7C_PNPM_PATH = $pnpmPath

$runtimeDir = Join-Path $workDir "phase7c-executors"
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$runnerStatusPath = Join-Path $runtimeDir "startup-runner-status.json"
$runnerErrLog = Join-Path $runtimeDir "startup-runner.err.log"
$supervisorOut = Join-Path $runtimeDir "startup-supervisor.out.log"
$supervisorErr = Join-Path $runtimeDir "startup-supervisor.err.log"
$runnerLockPath = Join-Path $runtimeDir "startup-runner.lock"

$runnerLock = $null
try {
  $runnerLock = Open-Phase7CStartupRunnerLock -Path $runnerLockPath
  Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_LOCK=ACQUIRED|PID=$PID"
} catch {
  Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_LOCK=BLOCKED|PID=$PID"
  throw
}

function Write-RunnerStatus(
  [string]$Status,
  [string]$Message,
  [int]$Attempt,
  [Nullable[int]]$SupervisorPid,
  [Nullable[int]]$ExitCode
) {
  $statusPayload = [pscustomobject]@{
    version = 2
    status = $Status
    runnerPid = $PID
    supervisorPid = if ($null -ne $SupervisorPid) { [int]$SupervisorPid } else { $null }
    attempt = $Attempt
    exitCode = if ($null -ne $ExitCode) { [int]$ExitCode } else { $null }
    accountMode = $accountMode
    demoOnly = $accountMode -eq "DEMO"
    liveExecutionEnabled = $accountMode -eq "LIVE" -and $liveExecutionEnabled
    armed = $true
    nodePath = $nodePath
    pnpmPath = $pnpmPath
    message = $Message
    updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  }
  Write-Phase7CJsonAtomic -Path $runnerStatusPath -Value $statusPayload -Depth 4
}

function Append-RunnerError([string]$Message) {
  $stamp = [DateTimeOffset]::Now.ToString("o")
  Add-Content -LiteralPath $runnerErrLog -Value "[$stamp] $Message" -Encoding utf8
}

Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER=RUNNING"
Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_ACCOUNT_MODE=$accountMode"
Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_LIVE_EXECUTION_ENABLED=$($accountMode -eq 'LIVE' -and $liveExecutionEnabled)"
Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_ARMED=TRUE"
Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_CONTROL_API=$controlApiUrl"
Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_NODE_PATH=$nodePath"
Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_PNPM_PATH=$pnpmPath"
Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_TREND_FIXED_LOT=$trendFixedVolume"
Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_SIDEWAY_RISK_PERCENT=$sidewayRiskPercent"
Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_SIDEWAY_MAX_LOT=$sidewayMaxLot"
Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_STATUS=$runnerStatusPath"
Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_LOCK_PATH=$runnerLockPath"

$attempt = 0
try {
  while ($true) {
    $attempt++
    $process = $null
    try {
      $arguments = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", ('"{0}"' -f $Supervisor),
        "-WorkDir", ('"{0}"' -f $workDir),
        "-ControlApiUrl", ('"{0}"' -f $controlApiUrl),
        "-EnvFile", ('"{0}"' -f $envFile),
        "-TelegramEnvFile", ('"{0}"' -f $telegramEnvFile),
        "-AccountMode", $accountMode,
        "-TrendFixedVolume", $trendFixedVolume.ToString([System.Globalization.CultureInfo]::InvariantCulture),
        "-SidewayRiskPercent", $sidewayRiskPercent.ToString([System.Globalization.CultureInfo]::InvariantCulture),
        "-SidewayMaxLot", $sidewayMaxLot.ToString([System.Globalization.CultureInfo]::InvariantCulture),
        "-Armed"
      )
      if ($accountMode -eq "LIVE" -and $liveExecutionEnabled) { $arguments += "-LiveExecutionEnabled" }

      Write-RunnerStatus "STARTING_SUPERVISOR" "Launching Phase 7C executor supervisor." $attempt $null $null
      $process = Start-Process `
        -FilePath "powershell.exe" `
        -ArgumentList $arguments `
        -WorkingDirectory $ProjectRoot `
        -RedirectStandardOutput $supervisorOut `
        -RedirectStandardError $supervisorErr `
        -PassThru

      Write-RunnerStatus "SUPERVISOR_RUNNING" "Phase 7C executor supervisor process is running." $attempt $process.Id $null
      while (-not $process.HasExited) {
        Start-Sleep -Seconds 10
        $process.Refresh()
        if (-not $process.HasExited) {
          Write-RunnerStatus "SUPERVISOR_RUNNING" "Phase 7C executor supervisor process is running." $attempt $process.Id $null
        }
      }

      $exitCode = $process.ExitCode
      $message = "Phase 7C executor supervisor exited with code $exitCode; restarting in $RestartDelaySeconds seconds."
      Append-RunnerError $message
      Write-RunnerStatus "ERROR_RETRYING" $message $attempt $process.Id $exitCode
    } catch {
      $message = "Phase 7C executor supervisor launch/monitor failed: $($_.Exception.Message). Restarting in $RestartDelaySeconds seconds."
      Append-RunnerError $message
      $pidValue = if ($null -ne $process) { [Nullable[int]]$process.Id } else { $null }
      Write-RunnerStatus "ERROR_RETRYING" $message $attempt $pidValue $null
    }
    Start-Sleep -Seconds $RestartDelaySeconds
  }
} finally {
  if ($null -ne $runnerLock) { $runnerLock.Dispose() }
}
