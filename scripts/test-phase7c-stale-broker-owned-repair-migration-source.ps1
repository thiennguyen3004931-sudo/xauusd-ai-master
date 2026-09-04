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

# Production reproduction: after a guarded source fast-forward, the still-running
# lifecycle broker can be older than source. Ordinary Web/API deploy must keep its
# stale-source block. Canonical recovery already owns one deliberately narrow proof
# window: AllowOwnedTaskProvenanceMigration + exact trusted Git runner SHA. Reuse
# that existing window rather than introducing a second generic stale-source bypass.
Assert-Contains $webDeploy '\[switch\]\$AllowOwnedTaskProvenanceMigration' `
  'Web/API deploy must retain the explicit owned-task provenance migration switch.'
Assert-Contains $webDeploy '\[string\]\$ExpectedRunnerSha256' `
  'Owned-task migration must stay bound to the exact trusted runner SHA256.'
Assert-Contains $webDeploy 'PHASE7C_WEB_UI_DEPLOY_BROKER_SOURCE_STALE_MIGRATION=ALLOWED_OWNED_TASK_REPAIR' `
  'RED: Web/API deploy is missing the narrow stale-broker allowance inside the already-proven owned-task migration window.'
Assert-Contains $webDeploy 'if \(\$AllowOwnedTaskProvenanceMigration\)[\s\S]*PHASE7C_WEB_UI_DEPLOY_BROKER_SOURCE_STALE_MIGRATION=ALLOWED_OWNED_TASK_REPAIR[\s\S]*else[\s\S]*Web UI deploy blocked: lifecycle broker process is stale relative to source loaded at broker startup' `
  'Stale broker source may be tolerated only inside the existing owned-task migration window; ordinary deploy must still fail closed.'
Assert-Contains $webDeploy 'PHASE7C_WEB_UI_DEPLOY_BROKER_SOURCE_FRESH=PASS' `
  'Fresh broker source must keep the existing PASS marker.'
Assert-Contains $webDeploy 'Web UI deploy blocked: lifecycle broker process is stale relative to source loaded at broker startup' `
  'Ordinary Web/API deploy must preserve the existing stale-broker fail-closed error.'

# Recovery opens AllowOwnedTaskProvenanceMigration only after it has classified the
# task as owned + repair-required and validated the recorded API SID/principal. That
# same condition keeps taskRepairRequired=true, so old stable executors can never
# take SKIPPED_ALREADY_STABLE after the stale-source allowance is exercised.
Assert-Contains $recovery 'if \(\$taskProvenanceRepairRequired\)[\s\S]*AllowOwnedTaskProvenanceMigration[\s\S]*ExpectedRunnerSha256[\s\S]*\$trustedRunnerSha256' `
  'Recovery may open the migration window only for proven task provenance repair and exact trusted runner SHA.'
Assert-Contains $recovery 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_API_SID_PREFLIGHT=PASS' `
  'Recovery must validate the recorded API SID before building migration-window deploy arguments.'
Assert-Contains $recovery '\$taskRepairRequired\s*=\s*\$taskProvenanceRepairRequired\s+-or\s+\$taskBatterySettingsRepairRequired' `
  'Provenance repair must remain a mandatory lifecycle recovery reason.'
Assert-Contains $recovery '\$stableBeforeRecovery\s+-and\s+-not\s+\$taskRepairRequired' `
  'A provenance-repair rollout must remain ineligible for SKIPPED_ALREADY_STABLE.'

Assert-Order $recovery 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_TASK_API_SID_PREFLIGHT=PASS' '$webApiDeployArgs = @()' `
  'API SID/principal proof must precede construction of the Web/API migration window.'
Assert-Order $recovery '& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WebApiDeploy' '"/api/v1/phase7c/lifecycle/stop"' `
  'This bounded fix must preserve the established Web/API-before-lifecycle-STOP ordering.'
Assert-Order $recovery '"/api/v1/phase7c/lifecycle/stop"' 'Stop-ScheduledTask' `
  'Owned task stop must remain after lifecycle STOP.'
Assert-Order $recovery 'Stop-ScheduledTask' '-Repair `' `
  'Canonical task repair must remain after the owned task is stopped.'

Write-Host "PHASE7C_STALE_BROKER_OWNED_REPAIR_MIGRATION_SOURCE_TEST=PASS"
