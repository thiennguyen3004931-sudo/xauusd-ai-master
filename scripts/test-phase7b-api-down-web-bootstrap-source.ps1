$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Helper = Join-Path $PSScriptRoot "recover-phase7b-api-down-web-bootstrap-local.ps1"

function Assert-True([bool]$Value, [string]$Message) {
  if (-not $Value) { throw $Message }
}

Assert-True (Test-Path -LiteralPath $Helper -PathType Leaf) "RED_TARGET: missing API-down Web bootstrap helper."

$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($Helper, [ref]$tokens, [ref]$errors)
Assert-True (@($errors).Count -eq 0) "API-down Web bootstrap helper has PowerShell parse errors."
$text = (Get-Content -LiteralPath $Helper -Raw).Replace("`r`n", "`n").Replace("`r", "`n")

foreach ($required in @(
  '[Parameter(Mandatory = $true)] [string]$ExpectedCommit',
  'branch --show-current',
  'status --porcelain',
  'rev-parse HEAD',
  'ls-remote --heads origin refs/heads/main',
  'phase7c-bot-mode.json',
  'phase7c-account-mode.json',
  'phase7c-live-arm-control-request.json',
  'phase7c-account-switch-request.json',
  '/health',
  '/v1/positions?symbol=XAUUSD',
  '/v1/orders?symbol=XAUUSD',
  'XAUUSD-Phase7B-Web',
  'run-phase7b-web-autostart.ps1',
  'Get-ScheduledTask',
  'Get-NetTCPConnection',
  'Start-ScheduledTask -TaskName $WebTask',
  '/api/v1/phase7c/bot-mode',
  '/api/v1/phase7c-live-arm-control/capability',
  'FINAL_MODE=PAUSE',
  'FINAL_ARM=DISARMED',
  'ORDER_MUTATION=NONE',
  'POSITION_MUTATION=NONE',
  'BRIDGE_RESTART=NONE',
  'EXECUTOR_RESTART=NONE',
  'LIVE_TEST_ORDER=NONE'
)) {
  Assert-True ($text.Contains($required)) "Missing API-down bootstrap safety contract marker: $required"
}

foreach ($forbidden in @(
  'Stop-ScheduledTask',
  'Stop-Process',
  'taskkill',
  'Register-ScheduledTask',
  'Set-ScheduledTask',
  'Unregister-ScheduledTask',
  'ARM_LIVE',
  '@{ mode = "AUTO"',
  '/api/v1/phase7c/lifecycle/start',
  '/api/v1/phase7c/lifecycle/stop'
)) {
  Assert-True (-not $text.Contains($forbidden)) "API-down bootstrap contains forbidden mutation/path: $forbidden"
}

$commands = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] }, $true))
$startTasks = @($commands | Where-Object { $_.GetCommandName() -eq 'Start-ScheduledTask' })
Assert-True ($startTasks.Count -eq 1) "API-down bootstrap must contain exactly one Scheduled Task start."

Write-Host "PHASE7B_API_DOWN_WEB_BOOTSTRAP_SOURCE_CONTRACT=PASS"
