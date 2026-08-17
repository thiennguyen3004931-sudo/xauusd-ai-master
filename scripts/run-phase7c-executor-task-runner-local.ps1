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
$sidewayRiskPercent = [double]$config.sidewayRiskPercent
$sidewayMaxLot = [double]$config.sidewayMaxLot

if (-not (Test-Path $workDir)) { throw "Executor task WorkDir not found: $workDir" }
if (-not (Test-Path $envFile)) { throw "Executor task EnvFile not found: $envFile" }
if (-not (Test-Path $telegramEnvFile)) { throw "Executor task TelegramEnvFile not found: $telegramEnvFile" }
if ($sidewayRiskPercent -le 0 -or $sidewayRiskPercent -gt 5) { throw "Executor task sidewayRiskPercent is invalid: $sidewayRiskPercent" }
if ($sidewayMaxLot -le 0) { throw "Executor task sidewayMaxLot is invalid: $sidewayMaxLot" }

Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER=RUNNING"
Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_DEMO_ONLY=TRUE"
Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_ARMED=TRUE"
Write-Host "PHASE7C_EXECUTOR_TASK_RUNNER_CONTROL_API=$controlApiUrl"

while ($true) {
  try {
    & $Supervisor `
      -WorkDir $workDir `
      -ControlApiUrl $controlApiUrl `
      -EnvFile $envFile `
      -TelegramEnvFile $telegramEnvFile `
      -SidewayRiskPercent $sidewayRiskPercent `
      -SidewayMaxLot $sidewayMaxLot `
      -Armed

    Write-Warning "Phase 7C executor supervisor exited normally; restarting in $RestartDelaySeconds seconds."
  }
  catch {
    Write-Warning "Phase 7C executor supervisor failed: $($_.Exception.Message). Restarting in $RestartDelaySeconds seconds."
  }

  Start-Sleep -Seconds $RestartDelaySeconds
}
