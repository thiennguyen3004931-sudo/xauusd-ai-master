$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RecoveryPath = Join-Path $PSScriptRoot "recover-phase7c-runtime-ready-stable-deploy-local.ps1"
$WebDeployPath = Join-Path $PSScriptRoot "deploy-phase7c-web-ui-local.ps1"

foreach ($required in @($RecoveryPath, $WebDeployPath)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Required stale-broker migration source not found: $required"
  }
}

function Assert-PowerShellSyntax([string]$Path) {
  $tokens = $null
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors)
  if ($errors.Count -ne 0) {
    throw "PowerShell syntax error in ${Path}: $($errors[0].Message)"
  }
}

function Assert-Contains {
  param(
    [Parameter(Mandatory = $true)] [string]$Text,
    [Parameter(Mandatory = $true)] [string]$Pattern,
    [Parameter(Mandatory = $true)] [string]$Message
  )
  if ($Text -notmatch $Pattern) { throw $Message }
}

function Assert-Order {
  param(
    [Parameter(Mandatory = $true)] [string]$Text,
    [Parameter(Mandatory = $true)] [string]$Before,
    [Parameter(Mandatory = $true)] [string]$After,
    [Parameter(Mandatory = $true)] [string]$Message
  )
  $beforeIndex = $Text.IndexOf($Before, [System.StringComparison]::Ordinal)
  $afterIndex = $Text.IndexOf($After, [System.StringComparison]::Ordinal)
  if ($beforeIndex -lt 0 -or $afterIndex -lt 0 -or $beforeIndex -ge $afterIndex) {
    throw $Message
  }
}

Assert-PowerShellSyntax $RecoveryPath
Assert-PowerShellSyntax $WebDeployPath
$recovery = Get-Content -LiteralPath $RecoveryPath -Raw
$webDeploy = Get-Content -LiteralPath $WebDeployPath -Raw

# RED production reproduction: after a guarded source fast-forward, the still-running
# lifecycle broker can be older than source. Ordinary Web/API deploy must keep its
# stale-source block, but the already-proven owned-task provenance repair path needs
# one PID-bound migration window so canonical recovery can reach STOP -> repair -> START.
Assert-Contains $webDeploy '\[switch\]\$AllowStaleBrokerSourceMigration' `
  'RED: Web/API deploy is missing the narrow stale-broker source migration switch.'
Assert-Contains $webDeploy '\[int\]\$ExpectedStaleBrokerPid' `
  'Stale-broker migration must bind to the exact broker PID proven by recovery.'
Assert-Contains $webDeploy 'AllowStaleBrokerSourceMigration[\s\S]*AllowOwnedTaskProvenanceMigration' `
  'Stale-broker source migration must be legal only inside the owned-task provenance migration window.'
Assert-Contains $webDeploy 'ExpectedStaleBrokerPid\s+-le\s+0' `
  'Stale-broker migration must reject a missing or non-positive expected broker PID.'
Assert-Contains $webDeploy '\$brokerPid\s+-ne\s+\$ExpectedStaleBrokerPid' `
  'Stale-broker migration must fail closed if the live broker PID changed from the recovery preflight PID.'
Assert-Contains $webDeploy 'PHASE7C_WEB_UI_DEPLOY_BROKER_SOURCE_STALE_MIGRATION=ALLOWED_OWNED_TASK_REPAIR' `
  'Stale-broker migration must emit an explicit narrow audit marker.'
Assert-Contains $webDeploy 'Web UI deploy blocked: lifecycle broker process is stale relative to source loaded at broker startup' `
  'Ordinary Web/API deploy must preserve the existing stale-broker fail-closed error.'

# Recovery must capture the current broker generation before Web deploy and forward
# the stale-source exception only when task provenance is already proven owned +
# repair-required. Because taskRepairRequired remains true, stable old executors can
# never take the SKIPPED_ALREADY_STABLE branch after this exception is used.
Assert-Contains $recovery '\$staleBrokerMigrationPid\s*=\s*Get-Phase7CBrokerPidFromHeartbeat' `
  'Recovery must capture the current lifecycle broker PID before opening the stale-source migration window.'
Assert-Contains $recovery 'AllowStaleBrokerSourceMigration' `
  'Recovery must explicitly request the stale-broker migration window.'
Assert-Contains $recovery 'ExpectedStaleBrokerPid[\s\S]*\$staleBrokerMigrationPid' `
  'Recovery must pass the exact preflight broker PID to Web/API deploy.'
Assert-Contains $recovery 'if \(\$taskProvenanceRepairRequired\)[\s\S]*AllowStaleBrokerSourceMigration' `
  'Recovery may request stale-broker migration only for proven task provenance repair.'
Assert-Contains $recovery '\$taskRepairRequired\s*=\s*\$taskProvenanceRepairRequired\s+-or\s+\$taskBatterySettingsRepairRequired' `
  'Provenance repair must remain a mandatory lifecycle recovery reason.'
Assert-Contains $recovery '\$stableBeforeRecovery\s+-and\s+-not\s+\$taskRepairRequired' `
  'A provenance-repair rollout must remain ineligible for SKIPPED_ALREADY_STABLE.'

Assert-Order $recovery '$staleBrokerMigrationPid = Get-Phase7CBrokerPidFromHeartbeat' '& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WebApiDeploy' `
  'Recovery must bind the stale broker PID before Web/API deploy.'
Assert-Order $recovery '& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WebApiDeploy' '"/api/v1/phase7c/lifecycle/stop"' `
  'This bounded fix must preserve the established Web/API-before-lifecycle-STOP ordering.'

Write-Host "PHASE7C_STALE_BROKER_OWNED_REPAIR_MIGRATION_SOURCE_TEST=PASS"
