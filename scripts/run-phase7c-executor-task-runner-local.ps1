param(
  [int]$RestartDelaySeconds = 15
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Supervisor = Join-Path $PSScriptRoot "run-phase7c-executors-local.ps1"
$ConfigPath = Join-Path $ProjectRoot ".runtime\phase7c-executor-task-config.json"

if (-not (Test-Path $Supervisor)) { throw "Phase 7C executor supervisor not found: $Supervisor" }
if (-not (Test-Path $ConfigPath)) { throw "Phase 7C executor task config not found: $ConfigPath" }
if ($RestartDelaySeconds -lt 5 -or $RestartDelaySeconds -gt 300) { throw "RestartDelaySeconds must be between 5 and 300." }

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
if ([int]$config.version -ne 1) { throw "Unsupported executor task config version: $($config.version)" }
if (-not [bool]$config.demoOnly) { throw "Executor task config must remain demoOnly=true." }
if (-not [bool]$config.armed) { throw "Executor task config must remain armed=true." }

$workDir = [string]$config.workDir
$controlApiUrl = [string]$config.controlApiUrl
$envFile = [string]$config.envFile
$telegramEnvFile = [string]$config.telegramEnvFile
$nodePath = [string]$config.nodePath
$pnpmPath = [string]$config.pnpmPath
$sidewayRiskPercent = [double]$config.sidewayRiskPercent
$sidewayMaxLot = [double]$config.sidewayMaxLot

if (-not (Test-Path $workDir)) { throw "Executor task WorkDir not found: $workDir" }
if (-not (Test-Path $envFile)) { throw "Executor task EnvFile not found: $envFile" }
if (-not (Test-Path $telegramEnvFile)) { throw "Executor task TelegramEnvFile not found: $telegramEnvFile" }
if ([string]::IsNullOrWhiteSpace($nodePath) -or -not (Test-Path $nodePath -PathType Leaf)) { throw "Executor task nodePath is missing/invalid: $nodePath" }
if ([string]::IsNullOrWhiteSpace($pnpmPath) -or -not (Test-Path $pnpmPath -PathType Leaf)) { throw "Executor task pnpmPath is missing/invalid: $pnpmPath" }
if ($sidewayRiskPercent -le 0 -or $sidewayRiskPercent -gt 5) { throw "Executor task sidewayRiskPercent is invalid: $sidewayRiskPercent" }
if ($sidewayMaxLot -le 0) { throw "Executor task sidewayMaxLot is invalid: $sidewayMaxLot" }

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

function Write-RunnerStatus(
  [string]$Status,
  [string]$Message,
  [int]$Attempt,
  [Nullable[int]]$SupervisorPid,
  [Nullable[int]]$ExitCode
) {
  [pscustomobject]@{
    version = 1
    status = $Status
    runnerPid = $PID
    supervisorPid = if ($null -ne $SupervisorPid) { [int]$SupervisorPid } else { $null }
    attempt = $Attempt
    exitCode = if ($null -ne $ExitCode) { [int]$ExitCode } else { $null }
    demoOnly = $true
    armed = $true
    nodePath = $nodePath
    pnpmPath = $pnpmPath
    message = $Message
    updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $runnerStatusPath -Encoding utf8
}

function Append-RunnerError([string]$Message) {
  $stamp = [DateTimeOffset]::Now.ToString("o")
  Add-Content -LiteralPath $runnerErrLog -Value "[$stamp] $Message" -Encoding utf8
}

Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER=RUNNING"
Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_DEMO_ONLY=TRUE"
Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_ARMED=TRUE"
Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_CONTROL_API=$controlApiUrl"
Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_NODE_PATH=$nodePath"
Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_PNPM_PATH=$pnpmPath"
Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_STATUS=$runnerStatusPath"

$attempt = 0
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
      "-SidewayRiskPercent", $sidewayRiskPercent.ToString([System.Globalization.CultureInfo]::InvariantCulture),
      "-SidewayMaxLot", $sidewayMaxLot.ToString([System.Globalization.CultureInfo]::InvariantCulture),
      "-Armed"
    )

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
  }
  catch {
    $message = "Phase 7C executor supervisor launch/monitor failed: $($_.Exception.Message). Restarting in $RestartDelaySeconds seconds."
    Append-RunnerError $message
    $pidValue = if ($null -ne $process) { [Nullable[int]]$process.Id } else { $null }
    Write-RunnerStatus "ERROR_RETRYING" $message $attempt $pidValue $null
  }

  Start-Sleep -Seconds $RestartDelaySeconds
}
