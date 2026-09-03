$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RecoveryPath = Join-Path $PSScriptRoot "recover-phase7c-runtime-ready-stable-deploy-local.ps1"
$WebDeployPath = Join-Path $PSScriptRoot "deploy-phase7c-web-ui-local.ps1"
$DashboardDeployPath = Join-Path $PSScriptRoot "deploy-phase7c-mt5-dashboard-local.ps1"
$VerifierPath = Join-Path $PSScriptRoot "verify-phase7c-account-runtime-local.ps1"
$OwnershipPath = Join-Path $PSScriptRoot "lib\phase7c-scheduled-task-ownership.ps1"

foreach ($required in @($RecoveryPath, $WebDeployPath, $DashboardDeployPath, $VerifierPath, $OwnershipPath)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Required battery migration source not found: $required"
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

foreach ($sourcePath in @($RecoveryPath, $WebDeployPath, $DashboardDeployPath, $VerifierPath, $OwnershipPath)) {
  Assert-PowerShellSyntax $sourcePath
}

$recovery = Get-Content -LiteralPath $RecoveryPath -Raw
$webDeploy = Get-Content -LiteralPath $WebDeployPath -Raw
$dashboardDeploy = Get-Content -LiteralPath $DashboardDeployPath -Raw
$verifier = Get-Content -LiteralPath $VerifierPath -Raw
$ownershipSource = Get-Content -LiteralPath $OwnershipPath -Raw

function Assert-Contains {
  param(
    [Parameter(Mandatory = $true)] [string]$Text,
    [Parameter(Mandatory = $true)] [string]$Pattern,
    [Parameter(Mandatory = $true)] [string]$Message
  )
  if ($Text -notmatch $Pattern) { throw $Message }
}

function Assert-NotContains {
  param(
    [Parameter(Mandatory = $true)] [string]$Text,
    [Parameter(Mandatory = $true)] [string]$Pattern,
    [Parameter(Mandatory = $true)] [string]$Message
  )
  if ($Text -match $Pattern) { throw $Message }
}

# One canonical classifier must define the exact settings drift that may use the
# battery migration window. Recovery and verifier must reuse it rather than copy
# an independently drifting allow-list.
Assert-Contains $ownershipSource 'function\s+Test-Phase7CBatteryOnlyTaskDrift' `
  'RED: canonical ownership helper must expose an exact battery-only task drift classifier.'
Assert-Contains $ownershipSource 'DISALLOW_START_IF_ON_BATTERIES' `
  'Battery-only drift classifier must include the start-on-battery restriction.'
Assert-Contains $ownershipSource 'STOP_IF_GOING_ON_BATTERIES' `
  'Battery-only drift classifier must include the stop-on-battery restriction.'

. $OwnershipPath

$canonicalBatteryDrift = @('DISALLOW_START_IF_ON_BATTERIES', 'STOP_IF_GOING_ON_BATTERIES')
if (-not (Test-Phase7CBatteryOnlyTaskDrift -Drift $canonicalBatteryDrift)) {
  throw 'Battery-only classifier must accept the exact two canonical battery restrictions.'
}
if (-not (Test-Phase7CBatteryOnlyTaskDrift -Drift @('DISALLOW_START_IF_ON_BATTERIES'))) {
  throw 'Battery-only classifier must accept a single canonical battery restriction.'
}
if (Test-Phase7CBatteryOnlyTaskDrift -Drift @()) {
  throw 'Battery-only classifier must reject empty drift.'
}
if (Test-Phase7CBatteryOnlyTaskDrift -Drift @('DISALLOW_START_IF_ON_BATTERIES', 'TRIGGER')) {
  throw 'Battery-only classifier must reject mixed battery + unrelated task drift.'
}

# Recovery must elevate canonical-action battery settings drift into the same
# controlled repair phase without weakening action provenance ownership.
Assert-Contains $recovery 'Get-Phase7CExecutorTaskDrift\s+-Task\s+\$task' `
  'Recovery must inspect canonical task definition drift before deciding repair scope.'
Assert-Contains $recovery 'Test-Phase7CBatteryOnlyTaskDrift\s+-Drift\s+\$taskDefinitionDrift' `
  'Recovery must use the canonical battery-only drift classifier.'
Assert-Contains $recovery '\$taskBatterySettingsRepairRequired\s*=' `
  'Recovery must track battery-settings repair separately from action provenance repair.'
Assert-Contains $recovery '\$taskRepairRequired\s*=\s*\$taskProvenanceRepairRequired\s+-or\s+\$taskBatterySettingsRepairRequired' `
  'Recovery must enter controlled task repair for either trusted provenance drift or battery-only settings drift.'
Assert-Contains $recovery 'Get-Phase7CRuntimeGenerationSnapshot\s+-WorkDir\s+\$WorkDir' `
  'Battery outage migration must prove runtime generation state read-only before opening its verifier window.'
Assert-Contains $recovery 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_BATTERY_MIGRATION_WINDOW=ENABLED' `
  'Recovery must emit an explicit audit marker only when the battery outage migration window is opened.'
Assert-Contains $recovery 'AllowOwnedTaskBatterySettingsMigration' `
  'Recovery must request a dedicated battery-settings migration window rather than reusing the provenance window.'
Assert-Contains $recovery 'if \(\$taskRepairRequired\)[\s\S]*-Repair' `
  'Controlled repair block must execute for battery-only settings repair as well as provenance repair.'

# The dedicated flag and exact runner hash must be explicit through every layer.
foreach ($source in @($webDeploy, $dashboardDeploy, $verifier)) {
  Assert-Contains $source '\[switch\]\$AllowOwnedTaskBatterySettingsMigration' `
    'Web/dashboard/verifier must expose the explicit battery-settings migration switch.'
  Assert-Contains $source '\[string\]\$ExpectedRunnerSha256' `
    'Battery-settings migration must remain bound to the exact trusted runner SHA256.'
}
Assert-Contains $webDeploy '\$dashboardDeployArgs\s*\+=\s*@\([\s\S]*AllowOwnedTaskBatterySettingsMigration[\s\S]*ExpectedRunnerSha256' `
  'Web deploy must explicitly propagate battery migration switch + trusted runner SHA to dashboard deploy.'
Assert-Contains $dashboardDeploy '\$accountVerifierArgs\s*\+=\s*@\([\s\S]*AllowOwnedTaskBatterySettingsMigration[\s\S]*ExpectedRunnerSha256' `
  'Dashboard deploy must explicitly propagate battery migration switch + trusted runner SHA to account verifier.'

# The verifier may accept the outage only for an already-canonical trusted action,
# canonical SYSTEM principal, and battery-only definition drift. It must not treat
# non-canonical action provenance as a battery migration.
Assert-Contains $verifier 'Test-Phase7CBatteryOnlyTaskDrift\s+-Drift\s+\$taskDefinitionDrift' `
  'Verifier must independently prove exact battery-only definition drift.'
Assert-Contains $verifier '\[bool\]\$ownership\.owned[\s\S]*\[bool\]\$ownership\.canonical[\s\S]*-not\s+\[bool\]\$ownership\.repairRequired' `
  'Battery migration must require owned + canonical + no action-provenance repair.'
Assert-Contains $verifier 'SYSTEM[\s\S]*ServiceAccount[\s\S]*Highest' `
  'Battery migration must preserve SYSTEM + ServiceAccount + Highest principal proof.'
Assert-Contains $verifier 'PHASE7C_ACCOUNT_VERIFY_BATTERY_MIGRATION_CONTROLLED_OUTAGE=PASS' `
  'Verifier must emit an explicit marker after proving the controlled pre-repair outage.'
Assert-Contains $verifier 'PHASE7C_ACCOUNT_VERIFY_BATTERY_MIGRATION_TASK_DRIFT=PASS' `
  'Verifier must emit explicit proof that task drift is battery-only.'

# Dashboard may restart only Web/API during the controlled outage. It must prove
# executor processes are stopped before and remain stopped after that restart,
# and must not require Telegram readiness until lifecycle recovery is complete.
Assert-Contains $dashboardDeploy 'PHASE7C_DASHBOARD_DEPLOY_BATTERY_MIGRATION_EXECUTORS_STOPPED=PASS' `
  'Dashboard battery migration path must prove executors are stopped before Web/API restart.'
Assert-Contains $dashboardDeploy 'PHASE7C_DASHBOARD_DEPLOY_BATTERY_MIGRATION_EXECUTORS_STILL_STOPPED=PASS' `
  'Dashboard battery migration path must prove executors remain stopped after Web/API restart.'
Assert-Contains $dashboardDeploy 'if \(-not \$AllowOwnedTaskBatterySettingsMigration\)[\s\S]*Wait-TelegramRecoveryAfterApiRestart' `
  'Telegram recovery wait must remain mandatory on normal deploys and be deferred only during battery outage migration.'

# Battery and provenance migration windows are distinct proof modes. Accidentally
# enabling both would make the verifier contract ambiguous and must fail closed.
foreach ($source in @($webDeploy, $dashboardDeploy, $verifier)) {
  Assert-Contains $source 'AllowOwnedTaskProvenanceMigration[\s\S]*AllowOwnedTaskBatterySettingsMigration[\s\S]*throw' `
    'Provenance and battery migration windows must be mutually exclusive.'
}
Assert-NotContains $recovery 'AllowOwnedTaskProvenanceMigration[\s\S]*AllowOwnedTaskBatterySettingsMigration[\s\S]*@webApiDeployArgs' `
  'Recovery must never request both migration windows in the same Web/API deploy invocation.'

Write-Host 'PHASE7C_BATTERY_SETTINGS_RECOVERY_MIGRATION_SOURCE=PASS'
