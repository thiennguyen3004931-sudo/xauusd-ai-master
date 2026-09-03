$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Helper = Join-Path $PSScriptRoot "recover-phase7c-runtime-ready-stable-deploy-local.ps1"

function Assert-True([bool]$Value, [string]$Message) {
  if (-not $Value) { throw $Message }
}

function Assert-PowerShellSyntax([string]$Path) {
  $tokens = $null
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors)
  if ($errors.Count -ne 0) {
    throw "PowerShell syntax error in ${Path}: $($errors[0].Message)"
  }
}

Assert-True (Test-Path -LiteralPath $Helper -PathType Leaf) "Missing runtime-ready stable recovery deploy helper: $Helper"
Assert-PowerShellSyntax $Helper

$text = (Get-Content -LiteralPath $Helper -Raw).Replace("`r`n", "`n").Replace("`r", "`n")

# Exact-source + fail-closed LIVE state gates.
Assert-True ($text.Contains('[Parameter(Mandatory = $true)] [string]$ExpectedCommit')) "helper must require exact ExpectedCommit"
Assert-True ($text.Contains('requires branch main')) "helper must require branch main"
Assert-True ($text.Contains('requires a clean worktree')) "helper must require clean worktree"
Assert-True ($text.Contains('exact commit mismatch')) "helper must reject source SHA mismatch"
Assert-True ($text.Contains('current bot mode PAUSE')) "helper must require PAUSE before mutation"
Assert-True ($text.Contains('canonical LIVE ARM=DISARMED')) "helper must require canonical DISARMED before mutation"
Assert-True ($text.Contains('requires configured LIVE account mode')) "helper must require configured LIVE account mode"
Assert-True ($text.Contains('requires zero XAUUSD positions')) "helper must require zero XAUUSD positions"
Assert-True ($text.Contains('requires zero pending XAUUSD orders')) "helper must require zero pending XAUUSD orders"

# PR #236 is API code: deploy Web/API first so the new lifecycle readiness code is loaded.
Assert-True ($text.Contains('deploy-phase7c-web-ui-local.ps1')) "helper must reuse canonical Web/API deploy helper"
$deployIndex = $text.IndexOf('& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WebApiDeploy', [System.StringComparison]::Ordinal)
$stableProbeIndex = $text.IndexOf('$stableBeforeRecovery = Wait-LifecycleReadyStable', [System.StringComparison]::Ordinal)
$stopIndex = $text.IndexOf('"/api/v1/phase7c/lifecycle/stop"', [System.StringComparison]::Ordinal)
$startIndex = $text.IndexOf('"/api/v1/phase7c/lifecycle/start"', [System.StringComparison]::Ordinal)
Assert-True ($deployIndex -ge 0) "helper must invoke canonical Web/API deploy"
Assert-True ($stableProbeIndex -gt $deployIndex) "stable lifecycle probe must occur only after Web/API deploy"
Assert-True ($stopIndex -gt $deployIndex) "lifecycle STOP must never occur before Web/API deploy"
Assert-True ($startIndex -gt $stopIndex) "lifecycle START must occur only after STOP when recovery is needed"
Assert-True ($text.Contains('-ExpectedCommit $ExpectedCommit')) "Web/API deploy must use exact ExpectedCommit"
Assert-True ($text.Contains('READY_STABLE_MS=5000')) "helper must require explicit 5 second continuous READY stability"
Assert-True ($text.Contains('READY_STABLE_RESET')) "helper must reset stability window on any non-ready sample"
Assert-True ($text.Contains('LIFECYCLE_RECOVERY=SKIPPED_ALREADY_STABLE')) "helper must skip executor recovery when lifecycle is already stable"
Assert-True ($text.Contains('LIFECYCLE_RECOVERY=PERFORMED')) "helper must recover lifecycle only when stable readiness is absent"

# PR #238 provenance enforcement must be reconciled by this deploy helper.
Assert-True ($text.Contains('lib\phase7c-scheduled-task-ownership.ps1')) "helper must load the canonical Scheduled Task ownership library"
Assert-True ($text.Contains('register-phase7c-executor-task-local.ps1')) "helper must reuse the canonical Scheduled Task installer for repair"
Assert-True ($text.Contains('Get-Phase7CTrustedGitFileSha256')) "helper must derive the trusted runner hash from accepted Git bytes"
Assert-True ($text.Contains('Test-Phase7CExecutorTaskActionOwnership')) "helper must inspect task action ownership before mutation"
Assert-True ($text.Contains('ExpectedRunnerSha256')) "helper must verify the task action against the expected runner SHA256"
Assert-True ($text.Contains('TASK_PROVENANCE=CANONICAL_HASH_GUARD')) "helper must report canonical hash-guard provenance"
Assert-True ($text.Contains('TASK_PROVENANCE_REPAIR=SKIPPED_ALREADY_CANONICAL')) "helper must skip broker-task restart when provenance is already canonical"
Assert-True ($text.Contains('TASK_PROVENANCE_REPAIR=PERFORMED')) "helper must report successful owned task provenance repair"
Assert-True ($text.Contains('TASK_PROVENANCE_REPAIR=BLOCKED_UNPROVEN_OWNERSHIP')) "helper must fail closed for foreign or unproven task ownership"
Assert-True ($text.Contains('Stop-ScheduledTask')) "helper must explicitly stop the owned SYSTEM task before repair"
Assert-True ($text.Contains('-Repair')) "helper must invoke the canonical installer in repair mode"
$taskStopIndex = $text.IndexOf('Stop-ScheduledTask', [System.StringComparison]::Ordinal)
$taskRepairIndex = $text.IndexOf('-Repair', [System.StringComparison]::Ordinal)
Assert-True ($taskStopIndex -gt $stopIndex) "Scheduled Task stop must occur only after lifecycle STOP"
Assert-True ($taskRepairIndex -gt $taskStopIndex) "task repair must occur only after the owned SYSTEM task is stopped"
Assert-True ($startIndex -gt $taskRepairIndex) "lifecycle START must occur only after provenance repair when repair is needed"

# Bridge identity and broker-flat invariants must hold throughout.
Assert-True ($text.Contains('bridge session changed')) "helper must fail if Bridge session changes"
Assert-True ($text.Contains('BRIDGE_SESSION_UNCHANGED=PASS')) "helper must report unchanged Bridge session"
Assert-True ($text.Contains('BRIDGE_RESTART=NONE')) "helper must explicitly forbid Bridge restart"
Assert-True ($text.Contains('WEB_API_DEPLOY=PASS')) "helper must report Web/API deployment"
Assert-True ($text.Contains('ORDER_MUTATION=NONE')) "helper must explicitly forbid order mutation"
Assert-True ($text.Contains('LIVE_TEST_ORDER=NONE')) "helper must explicitly forbid LIVE test orders"

# Normal success must remain PAUSE + DISARMED. Never ARM and never AUTO.
Assert-True ($text.Contains('FINAL_MODE=PAUSE')) "helper must finish in PAUSE"
Assert-True ($text.Contains('FINAL_ARM=DISARMED')) "helper must finish DISARMED"
Assert-True (-not $text.Contains('Invoke-LiveArmAction "ARM_LIVE"')) "helper must never invoke ARM_LIVE"
Assert-True (-not $text.Contains('confirmation = "ARM_LIVE"')) "helper must never execute canonical ARM_LIVE"
Assert-True (-not $text.Contains('@{ mode = "AUTO"')) "helper must never set AUTO"
Assert-True (-not $text.Contains('activate-phase7c-local.ps1')) "helper must never invoke legacy activation"
Assert-True (-not $text.Contains('activate-phase7c-safe-local.ps1')) "helper must never invoke broad safe activation"

# Failure after mutation must preserve/restore fail-closed PAUSE + DISARMED best effort.
Assert-True ($text.Contains('runtime-ready-stable-recovery-fail-closed')) "catch path must persist PAUSE"
Assert-True ($text.Contains('DISARM_LIVE')) "catch path may only use canonical DISARM as a safety action"
Assert-True ($text.Contains('FAIL_CLOSED_MODE=PAUSE')) "catch path must report PAUSE"
Assert-True ($text.Contains('FAIL_CLOSED_ARM=DISARMED_BEST_EFFORT')) "catch path must report DISARMED best effort"

Write-Host "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_DEPLOY_SOURCE_TEST=PASS"
