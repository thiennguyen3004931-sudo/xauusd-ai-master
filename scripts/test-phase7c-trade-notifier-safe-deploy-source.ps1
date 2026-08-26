$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Deploy = Join-Path $PSScriptRoot 'deploy-phase7c-trade-notifier-local.ps1'

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

Assert-True (Test-Path -LiteralPath $Deploy -PathType Leaf) 'Safe trade notifier deploy script is missing.'

$tokens = $null
$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($Deploy, [ref]$tokens, [ref]$errors)
if ($errors.Count -ne 0) { throw "Deploy script syntax error: $($errors[0].Message)" }

$source = Get-Content -LiteralPath $Deploy -Raw

Assert-True ($source.Contains('[ValidateSet("DEMO", "LIVE")]')) 'Deploy script must require an explicit DEMO/LIVE account mode.'
Assert-True ($source.Contains('phase7c-scheduled-task-ownership.ps1')) 'Deploy script must load Scheduled Task ownership helper.'
Assert-True ($source.Contains('Test-Phase7CExecutorTaskActionOwnership')) 'Deploy script must prove exact Scheduled Task ownership.'
Assert-True ($source.Contains('PHASE7C_TRADE_NOTIFIER_DEPLOY_ADMIN=PASS')) 'Deploy script must require Administrator context.'
Assert-True ($source.Contains('mode = "PAUSE"')) 'Deploy script must force PAUSE before restart.'
Assert-True ($source.Contains('PHASE7C_TRADE_NOTIFIER_DEPLOY_MODE=PAUSE')) 'Deploy script must verify persisted PAUSE.'
Assert-True ($source.Contains('/v1/positions?symbol=XAUUSD')) 'Deploy script must read XAUUSD positions before restart.'
Assert-True ($source.Contains('PHASE7C_TRADE_NOTIFIER_DEPLOY_XAUUSD_POSITIONS=0')) 'Deploy script must expose the zero-position safety marker.'
Assert-True ($source.Contains('supervisor.pid')) 'Deploy script must target the existing supervisor PID.'
Assert-True ($source -match '(?i)taskkill\.exe') 'Deploy script must terminate the supervisor process tree so children cannot be orphaned.'
Assert-True ($source.Contains('/T')) 'Supervisor termination must include the child process tree.'
Assert-True ($source.Contains('PHASE7C_TRADE_NOTIFIER_DEPLOY_NEW_SUPERVISOR_PID')) 'Deploy script must prove a new supervisor PID is running.'
Assert-True ($source.Contains('-DeploymentGate')) 'Deploy script must invoke the canonical deployment verifier gate.'
Assert-True ($source.Contains('-RequireMigratedTask')) 'Deploy script must require the owned startup-runner task.'
Assert-True ($source.Contains('-RequireTelegram')) 'Deploy script must require Telegram services after restart.'
Assert-True ($source.Contains('PHASE7C_TRADE_NOTIFIER_DEPLOY=PASS')) 'Deploy script must emit an explicit final PASS marker.'

Assert-True (-not ($source -match '(?i)Start-ScheduledTask|Stop-ScheduledTask|Register-ScheduledTask|Set-ScheduledTask')) 'Deploy script must not mutate or directly restart the Scheduled Task.'
Assert-True (-not ($source -match '(?i)/v1/orders(?:/|\?|"|`)')) 'Deploy script must not contain broker order endpoints.'
Assert-True (-not ($source -match '(?i)mode\s*=\s*["'']AUTO["'']')) 'Deploy script must never enable AUTO.'
Assert-True (-not ($source -match '(?i)sendMessage|ZIQ_TELEGRAM_SEND_TEST')) 'Deploy script must not send Telegram test messages.'

Write-Host 'PHASE7C_TRADE_NOTIFIER_SAFE_DEPLOY_SOURCE_TEST=PASS'
