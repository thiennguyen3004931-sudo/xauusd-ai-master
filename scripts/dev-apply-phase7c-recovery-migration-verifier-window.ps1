$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Replace-ExactBlock {
  param(
    [Parameter(Mandatory = $true)] [string]$Path,
    [Parameter(Mandatory = $true)] [string]$Old,
    [Parameter(Mandatory = $true)] [string]$New,
    [Parameter(Mandatory = $true)] [string]$Marker
  )

  $text = [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n").Replace("`r", "`n")
  $oldNormalized = $Old.Replace("`r`n", "`n").Replace("`r", "`n")
  $newNormalized = $New.Replace("`r`n", "`n").Replace("`r", "`n")

  if ($text.Contains($newNormalized)) {
    Write-Host "PHASE7C_DEV_PATCH_${Marker}=ALREADY_APPLIED"
    return
  }

  $count = ([regex]::Matches($text, [regex]::Escape($oldNormalized))).Count
  if ($count -ne 1) {
    throw "Patch marker $Marker expected exactly one old block in $Path but found $count."
  }

  $updated = $text.Replace($oldNormalized, $newNormalized)
  [System.IO.File]::WriteAllText($Path, $updated, $Utf8NoBom)
  Write-Host "PHASE7C_DEV_PATCH_${Marker}=APPLIED"
}

$Verifier = Join-Path $PSScriptRoot "verify-phase7c-account-runtime-local.ps1"
$WebDeploy = Join-Path $PSScriptRoot "deploy-phase7c-web-ui-local.ps1"
$DashboardDeploy = Join-Path $PSScriptRoot "deploy-phase7c-mt5-dashboard-local.ps1"
$Recovery = Join-Path $PSScriptRoot "recover-phase7c-runtime-ready-stable-deploy-local.ps1"
$SourceTest = Join-Path $PSScriptRoot "test-phase7c-recovery-migration-verifier-window-source.ps1"

foreach ($path in @($Verifier, $WebDeploy, $DashboardDeploy, $Recovery, $SourceTest)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Dev patch required file missing: $path"
  }
}

Replace-ExactBlock -Path $Verifier -Marker "VERIFIER_PARAMS" -Old @'
  [string]$TelegramEnvFile = ".env.phase7b-telegram",
  [switch]$RequireTelegram
)
'@ -New @'
  [string]$TelegramEnvFile = ".env.phase7b-telegram",
  [switch]$RequireTelegram,
  [switch]$AllowOwnedTaskProvenanceMigration,
  [string]$ExpectedRunnerSha256 = ""
)
'@

Replace-ExactBlock -Path $Verifier -Marker "VERIFIER_MIGRATION_HASH" -Old @'
$ExpectedAccountMode = ConvertTo-Phase7CAccountMode $ExpectedAccountMode
$ExpectedBrokerMode = if ($ExpectedAccountMode -eq "LIVE") { "real" } else { "demo" }
'@ -New @'
$ExpectedAccountMode = ConvertTo-Phase7CAccountMode $ExpectedAccountMode
$ExpectedBrokerMode = if ($ExpectedAccountMode -eq "LIVE") { "real" } else { "demo" }
$expectedMigrationRunnerSha256 = ""
if ($AllowOwnedTaskProvenanceMigration) {
  if ($ExpectedAccountMode -ne "LIVE") {
    throw "Owned task provenance migration verification is LIVE-only."
  }
  if ([string]::IsNullOrWhiteSpace($ExpectedRunnerSha256)) {
    throw "Owned task provenance migration verification requires ExpectedRunnerSha256."
  }
  $expectedMigrationRunnerSha256 = Normalize-Phase7CRunnerSha256 -Sha256 $ExpectedRunnerSha256
} elseif (-not [string]::IsNullOrWhiteSpace($ExpectedRunnerSha256)) {
  throw "ExpectedRunnerSha256 is only valid with AllowOwnedTaskProvenanceMigration."
}
'@

Replace-ExactBlock -Path $Verifier -Marker "VERIFIER_PRINCIPAL_HELPER" -Old @'
$task = $null
$taskTopologyVerified = $false
$taskLookupClassification = "FOUND"
'@ -New @'
function Test-Phase7CSystemTaskPrincipal($Principal) {
  if ($null -eq $Principal) { return $false }
  $user = ([string]$Principal.UserId).Trim()
  $systemUser = $user -in @('SYSTEM', 'NT AUTHORITY\SYSTEM', 'S-1-5-18')
  return $systemUser -and ([string]$Principal.LogonType) -eq 'ServiceAccount' -and ([string]$Principal.RunLevel) -eq 'Highest'
}

$task = $null
$taskTopologyVerified = $false
$taskLookupClassification = "FOUND"
$migrationWindowAllowed = $false
'@

Replace-ExactBlock -Path $Verifier -Marker "VERIFIER_OWNERSHIP" -Old @'
  $ownership = `
    Test-Phase7CExecutorTaskActionOwnership `
      -Actions $task.Actions `
      -ExpectedRunnerPath $expectedRunnerPath

  Write-Host "PHASE7C_ACCOUNT_VERIFY_TASK_STATE=$($task.State)"
  Write-Host "PHASE7C_ACCOUNT_VERIFY_TASK_OWNED=$($ownership.owned)"
  Write-Host "PHASE7C_ACCOUNT_VERIFY_TASK_OWNERSHIP_REASON=$($ownership.reason)"

  if (-not [bool]$ownership.owned) {
    throw "Executor Scheduled Task ownership verification failed. Reason=$($ownership.reason)"
  }

  if ([string]$task.State -ne "Running") {
'@ -New @'
  $ownership = if ($AllowOwnedTaskProvenanceMigration) {
    Test-Phase7CExecutorTaskActionOwnership `
      -Actions $task.Actions `
      -ExpectedRunnerPath $expectedRunnerPath `
      -ExpectedRunnerSha256 $expectedMigrationRunnerSha256
  } else {
    Test-Phase7CExecutorTaskActionOwnership `
      -Actions $task.Actions `
      -ExpectedRunnerPath $expectedRunnerPath
  }

  Write-Host "PHASE7C_ACCOUNT_VERIFY_TASK_STATE=$($task.State)"
  Write-Host "PHASE7C_ACCOUNT_VERIFY_TASK_OWNED=$($ownership.owned)"
  Write-Host "PHASE7C_ACCOUNT_VERIFY_TASK_OWNERSHIP_REASON=$($ownership.reason)"

  if (-not [bool]$ownership.owned) {
    throw "Executor Scheduled Task ownership verification failed. Reason=$($ownership.reason)"
  }

  if ($AllowOwnedTaskProvenanceMigration) {
    $migrationPrincipalValid = Test-Phase7CSystemTaskPrincipal $task.Principal
    $migrationWindowAllowed = [bool]$ownership.owned -and `
      [bool]$ownership.repairRequired -and `
      -not [bool]$ownership.canonical -and `
      $migrationPrincipalValid
    Write-Host "PHASE7C_ACCOUNT_VERIFY_TASK_MIGRATION_PRINCIPAL_VALID=$migrationPrincipalValid"
    Write-Host "PHASE7C_ACCOUNT_VERIFY_TASK_MIGRATION_REPAIR_REQUIRED=$($ownership.repairRequired)"
  }

  if ([string]$task.State -ne "Running") {
'@

Replace-ExactBlock -Path $Verifier -Marker "VERIFIER_FAIL_CLOSED" -Old @'
else {
  Write-Host "PHASE7C_ACCOUNT_VERIFY_TASK_STATE=MISSING"
  Write-Host "PHASE7C_ACCOUNT_VERIFY_TASK_OWNED=False"
}

if (-not (Test-Path $TaskConfigPath)) { throw "Executor task config not found: $TaskConfigPath" }
'@ -New @'
else {
  Write-Host "PHASE7C_ACCOUNT_VERIFY_TASK_STATE=MISSING"
  Write-Host "PHASE7C_ACCOUNT_VERIFY_TASK_OWNED=False"
}

if ($AllowOwnedTaskProvenanceMigration -and -not $migrationWindowAllowed) {
  throw "Owned task provenance migration verification failed closed: task must be owned, repair-required, non-canonical, and SYSTEM + ServiceAccount + Highest."
}

if (-not (Test-Path $TaskConfigPath)) { throw "Executor task config not found: $TaskConfigPath" }
'@

Replace-ExactBlock -Path $Verifier -Marker "VERIFIER_LOCK_WINDOW" -Old @'
Write-Host "PHASE7C_ACCOUNT_VERIFY_STARTUP_RUNNER_LOCK_HELD=$lockHeld"
if (-not $lockHeld) { throw "SYSTEM lifecycle broker singleton lock is not held." }
'@ -New @'
Write-Host "PHASE7C_ACCOUNT_VERIFY_STARTUP_RUNNER_LOCK_HELD=$lockHeld"
if (-not $lockHeld -and $migrationWindowAllowed) {
  Write-Host "PHASE7C_ACCOUNT_VERIFY_STARTUP_RUNNER_LOCK_MIGRATION_WINDOW=ALLOWED_OWNED_REPAIR_REQUIRED"
}
if (-not $lockHeld -and -not $migrationWindowAllowed) {
  throw "SYSTEM lifecycle broker singleton lock is not held."
}
'@

Replace-ExactBlock -Path $WebDeploy -Marker "WEB_PARAMS" -Old @'
  [int]$StartupTimeoutSeconds = 90,
  [Parameter(Mandatory = $true)]
'@ -New @'
  [int]$StartupTimeoutSeconds = 90,
  [switch]$AllowOwnedTaskProvenanceMigration,
  [string]$ExpectedRunnerSha256 = "",
  [Parameter(Mandatory = $true)]
'@

Replace-ExactBlock -Path $WebDeploy -Marker "WEB_MIGRATION_VALIDATION" -Old @'
$LifecycleBrokerLibrary = Join-Path $PSScriptRoot "lib\phase7c-lifecycle-broker.ps1"

foreach ($required in @(
'@ -New @'
$LifecycleBrokerLibrary = Join-Path $PSScriptRoot "lib\phase7c-lifecycle-broker.ps1"

if ($AllowOwnedTaskProvenanceMigration) {
  if ($ExpectedRunnerSha256 -notmatch '^[0-9a-fA-F]{64}$') {
    throw "Owned task provenance migration Web deploy requires an exact 64-character ExpectedRunnerSha256."
  }
} elseif (-not [string]::IsNullOrWhiteSpace($ExpectedRunnerSha256)) {
  throw "ExpectedRunnerSha256 is only valid with AllowOwnedTaskProvenanceMigration."
}

foreach ($required in @(
'@

Replace-ExactBlock -Path $WebDeploy -Marker "WEB_FORWARD" -Old @'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $DashboardDeploy `
    -WorkDir $WorkDir `
    -WebTask $WebTask `
    -ApiPort $ApiPort `
    -WebPort $WebPort `
    -StartupTimeoutSeconds $StartupTimeoutSeconds `
    -SkipPanelInstall
'@ -New @'
  $dashboardDeployArgs = @()
  if ($AllowOwnedTaskProvenanceMigration) {
    $dashboardDeployArgs += @(
      '-AllowOwnedTaskProvenanceMigration',
      '-ExpectedRunnerSha256', $ExpectedRunnerSha256
    )
  }

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $DashboardDeploy `
    -WorkDir $WorkDir `
    -WebTask $WebTask `
    -ApiPort $ApiPort `
    -WebPort $WebPort `
    -StartupTimeoutSeconds $StartupTimeoutSeconds `
    -SkipPanelInstall `
    @dashboardDeployArgs
'@

Replace-ExactBlock -Path $DashboardDeploy -Marker "DASHBOARD_PARAMS" -Old @'
  [int]$StartupTimeoutSeconds = 90,
  [switch]$SkipPanelInstall
)
'@ -New @'
  [int]$StartupTimeoutSeconds = 90,
  [switch]$SkipPanelInstall,
  [switch]$AllowOwnedTaskProvenanceMigration,
  [string]$ExpectedRunnerSha256 = ""
)
'@

Replace-ExactBlock -Path $DashboardDeploy -Marker "DASHBOARD_VALIDATION" -Old @'
if ($StartupTimeoutSeconds -lt 30 -or $StartupTimeoutSeconds -gt 300) {
  throw "StartupTimeoutSeconds must be between 30 and 300."
}

$ApiBase = "http://127.0.0.1:$ApiPort"
'@ -New @'
if ($StartupTimeoutSeconds -lt 30 -or $StartupTimeoutSeconds -gt 300) {
  throw "StartupTimeoutSeconds must be between 30 and 300."
}
if ($AllowOwnedTaskProvenanceMigration) {
  if ($ExpectedRunnerSha256 -notmatch '^[0-9a-fA-F]{64}$') {
    throw "Owned task provenance migration dashboard deploy requires an exact 64-character ExpectedRunnerSha256."
  }
} elseif (-not [string]::IsNullOrWhiteSpace($ExpectedRunnerSha256)) {
  throw "ExpectedRunnerSha256 is only valid with AllowOwnedTaskProvenanceMigration."
}

$ApiBase = "http://127.0.0.1:$ApiPort"
'@

Replace-ExactBlock -Path $DashboardDeploy -Marker "DASHBOARD_FORWARD" -Old @'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $AccountVerifier `
  -WorkDir $WorkDir `
  -ExpectedAccountMode $expectedAccountMode `
  -RequireTelegram
'@ -New @'
$accountVerifierArgs = @()
if ($AllowOwnedTaskProvenanceMigration) {
  $accountVerifierArgs += @(
    '-AllowOwnedTaskProvenanceMigration',
    '-ExpectedRunnerSha256', $ExpectedRunnerSha256
  )
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $AccountVerifier `
  -WorkDir $WorkDir `
  -ExpectedAccountMode $expectedAccountMode `
  -RequireTelegram `
  @accountVerifierArgs
'@

Replace-ExactBlock -Path $Recovery -Marker "RECOVERY_RUNTIME_PROBE_LIBRARY" -Old @'
$AccountLibrary = Join-Path $PSScriptRoot "lib\phase7c-account-mode.ps1"
$OwnershipLibrary = Join-Path $PSScriptRoot "lib\phase7c-scheduled-task-ownership.ps1"
$WebApiDeploy = Join-Path $PSScriptRoot "deploy-phase7c-web-ui-local.ps1"
'@ -New @'
$AccountLibrary = Join-Path $PSScriptRoot "lib\phase7c-account-mode.ps1"
$OwnershipLibrary = Join-Path $PSScriptRoot "lib\phase7c-scheduled-task-ownership.ps1"
$RuntimeOwnershipLibrary = Join-Path $PSScriptRoot "lib\phase7c-runtime-ownership-probe.ps1"
$WebApiDeploy = Join-Path $PSScriptRoot "deploy-phase7c-web-ui-local.ps1"
'@

Replace-ExactBlock -Path $Recovery -Marker "RECOVERY_REQUIRED_FILES" -Old @'
foreach ($required in @($ConfigPath, $AccountLibrary, $OwnershipLibrary, $WebApiDeploy, $TaskInstaller)) {
'@ -New @'
foreach ($required in @($ConfigPath, $AccountLibrary, $OwnershipLibrary, $RuntimeOwnershipLibrary, $WebApiDeploy, $TaskInstaller)) {
'@

Replace-ExactBlock -Path $Recovery -Marker "RECOVERY_DOT_SOURCE" -Old @'
. $AccountLibrary
. $OwnershipLibrary
$ExpectedCommit = $ExpectedCommit.ToLowerInvariant()
'@ -New @'
. $AccountLibrary
. $OwnershipLibrary
. $RuntimeOwnershipLibrary
$ExpectedCommit = $ExpectedCommit.ToLowerInvariant()
'@

Replace-ExactBlock -Path $Recovery -Marker "RECOVERY_WEB_WINDOW" -Old @'
  # Load the exact accepted Web/API source before any executor or SYSTEM task stop.
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WebApiDeploy `
    -WorkDir $WorkDir `
    -ExpectedCommit $ExpectedCommit
'@ -New @'
  # Load the exact accepted Web/API source before any executor or SYSTEM task stop.
  # When an owned legacy/stale-hash task has already passed provenance, principal,
  # API SID, PAUSE/DISARMED, Bridge-session and flat-broker preflight, allow the
  # strict account verifier to exempt only the startup-runner lock until repair.
  $webApiDeployArgs = @()
  if ($taskProvenanceRepairRequired) {
    $webApiDeployArgs += @(
      '-AllowOwnedTaskProvenanceMigration',
      '-ExpectedRunnerSha256', $trustedRunnerSha256
    )
    Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_WEB_API_MIGRATION_WINDOW=ENABLED_OWNED_REPAIR_REQUIRED"
  } else {
    Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_WEB_API_MIGRATION_WINDOW=DISABLED_CANONICAL_TASK"
  }

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WebApiDeploy `
    -WorkDir $WorkDir `
    -ExpectedCommit $ExpectedCommit `
    @webApiDeployArgs
'@

Replace-ExactBlock -Path $Recovery -Marker "RECOVERY_POST_REPAIR_LOCK" -Old @'
      if (-not (Test-Phase7CBrokerHeartbeatFresh)) {
        throw "Scheduled Task provenance repair did not return a fresh lifecycle broker heartbeat."
      }

      Assert-PauseDisarmed -Stage "POST_TASK_REPAIR"
'@ -New @'
      if (-not (Test-Phase7CBrokerHeartbeatFresh)) {
        throw "Scheduled Task provenance repair did not return a fresh lifecycle broker heartbeat."
      }

      $postRepairLockPath = Join-Path $WorkDir "phase7c-executors\startup-runner.lock"
      $postRepairLockState = Get-Phase7CReadOnlyLockState -Path $postRepairLockPath
      if ($postRepairLockState -ne 'HELD') {
        throw "Scheduled Task provenance repair did not restore the startup-runner singleton lock. state=$postRepairLockState"
      }
      Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_POST_REPAIR_STARTUP_RUNNER_LOCK=HELD"

      Assert-PauseDisarmed -Stage "POST_TASK_REPAIR"
'@

# Refine the RED/GREEN source contract to require explicit argument splatting,
# which is portable when powershell.exe -File invokes switch parameters on PS5.1.
Replace-ExactBlock -Path $SourceTest -Marker "TEST_WEB_FORWARD" -Old @'
Assert-Contains $webDeploy '-AllowOwnedTaskProvenanceMigration:\$AllowOwnedTaskProvenanceMigration' `
  'Web deploy must forward the migration switch explicitly to dashboard deploy.'
Assert-Contains $webDeploy '-ExpectedRunnerSha256\s+\$ExpectedRunnerSha256' `
  'Web deploy must forward expected runner SHA256 to dashboard deploy.'
Assert-Contains $dashboardDeploy '-AllowOwnedTaskProvenanceMigration:\$AllowOwnedTaskProvenanceMigration' `
  'Dashboard deploy must forward the migration switch explicitly to strict account verifier.'
Assert-Contains $dashboardDeploy '-ExpectedRunnerSha256\s+\$ExpectedRunnerSha256' `
  'Dashboard deploy must forward expected runner SHA256 to strict account verifier.'
'@ -New @'
Assert-Contains $webDeploy '\$dashboardDeployArgs\s*=\s*@\(' `
  'Web deploy must build explicit migration-only dashboard arguments.'
Assert-Contains $webDeploy '\$dashboardDeployArgs\s*\+=\s*@\([\s\S]*AllowOwnedTaskProvenanceMigration[\s\S]*ExpectedRunnerSha256' `
  'Web deploy must forward migration switch + expected runner SHA256 only through explicit dashboard arguments.'
Assert-Contains $webDeploy '@dashboardDeployArgs' `
  'Web deploy must splat the explicit migration-only arguments into dashboard deploy.'
Assert-Contains $dashboardDeploy '\$accountVerifierArgs\s*=\s*@\(' `
  'Dashboard deploy must build explicit migration-only verifier arguments.'
Assert-Contains $dashboardDeploy '\$accountVerifierArgs\s*\+=\s*@\([\s\S]*AllowOwnedTaskProvenanceMigration[\s\S]*ExpectedRunnerSha256' `
  'Dashboard deploy must forward migration switch + expected runner SHA256 only through explicit verifier arguments.'
Assert-Contains $dashboardDeploy '@accountVerifierArgs' `
  'Dashboard deploy must splat the explicit migration-only arguments into strict account verifier.'
'@

Write-Host "PHASE7C_DEV_RECOVERY_MIGRATION_VERIFIER_PATCH=PASS"
