$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Recovery = Join-Path $PSScriptRoot "recover-phase7c-runtime-ready-stable-deploy-local.ps1"
$WebDeploy = Join-Path $PSScriptRoot "deploy-phase7c-web-ui-local.ps1"
$DashboardDeploy = Join-Path $PSScriptRoot "deploy-phase7c-mt5-dashboard-local.ps1"

foreach ($path in @($Recovery, $WebDeploy, $DashboardDeploy)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Required stopped-lifecycle dashboard deploy source missing: $path"
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

function Assert-ContainsLiteral([string]$Text, [string]$Literal, [string]$Message) {
  if ($Text.IndexOf($Literal, [System.StringComparison]::Ordinal) -lt 0) {
    throw $Message
  }
}

foreach ($path in @($Recovery, $WebDeploy, $DashboardDeploy)) {
  Assert-PowerShellSyntax $path
}

$recoveryText = (Get-Content -LiteralPath $Recovery -Raw).Replace("`r`n", "`n").Replace("`r", "`n")
$webText = (Get-Content -LiteralPath $WebDeploy -Raw).Replace("`r`n", "`n").Replace("`r", "`n")
$dashboardText = (Get-Content -LiteralPath $DashboardDeploy -Raw).Replace("`r`n", "`n").Replace("`r", "`n")

# Dashboard deploy remains strict by default. The exception is a named, narrow
# canonical-recovery window for an already STOPPED lifecycle with zero executor
# processes; it must not be a generic skip-executor-safety switch.
Assert-ContainsLiteral $dashboardText '[switch]$AllowStoppedLifecycleCanonicalRecovery' 'dashboard deploy must expose a narrow stopped-lifecycle canonical recovery switch'
Assert-ContainsLiteral $dashboardText '$LifecycleUrl = "$ApiBase/api/v1/phase7c/lifecycle"' 'dashboard deploy must use the canonical lifecycle endpoint for the stopped-lifecycle proof'
Assert-ContainsLiteral $dashboardText 'if ($AllowStoppedLifecycleCanonicalRecovery)' 'dashboard deploy must gate the stopped-lifecycle exception explicitly'
Assert-ContainsLiteral $dashboardText 'PHASE7C_DASHBOARD_DEPLOY_STOPPED_LIFECYCLE_EXECUTOR_ABSENCE=PASS' 'dashboard deploy must audit the stopped-lifecycle zero-executor proof'
Assert-ContainsLiteral $dashboardText '$protectedPids = @()' 'dashboard deploy may use an empty protected PID set only inside the proven stopped-lifecycle window'
Assert-ContainsLiteral $dashboardText '$supervisorPid = Read-AlivePid "supervisor"' 'ordinary dashboard deploy must retain the supervisor PID liveness guard'
Assert-ContainsLiteral $dashboardText '$trendPid = Read-AlivePid "trend"' 'ordinary dashboard deploy must retain the trend PID liveness guard'
Assert-ContainsLiteral $dashboardText '$sidewayPid = Read-AlivePid "sideway"' 'ordinary dashboard deploy must retain the sideway PID liveness guard'
Assert-ContainsLiteral $dashboardText 'run-phase7c-executors|trend-executor|sideway-executor' 'dashboard core-tree cleanup must retain executor command-line rejection'

# Web deploy only propagates the explicit window to the dashboard helper; broker
# freshness remains an independent, unchanged guard.
Assert-ContainsLiteral $webText '[switch]$AllowStoppedLifecycleCanonicalRecovery' 'Web deploy must accept the stopped-lifecycle canonical recovery window'
Assert-ContainsLiteral $webText 'Assert-LifecycleBrokerSourceFresh -WorkDir $WorkDir' 'Web deploy must preserve lifecycle-broker freshness enforcement'
Assert-ContainsLiteral $webText '-AllowStoppedLifecycleCanonicalRecovery:$AllowStoppedLifecycleCanonicalRecovery' 'Web deploy must propagate the stopped-lifecycle window only to dashboard deploy'

# Recovery may open the window only after a fresh proof that lifecycle is stopped,
# executors are absent, task ownership/principal is exact canonical, broker/lock are
# healthy, and the existing PAUSE/DISARMED/Bridge/flat invariants still hold.
Assert-ContainsLiteral $recoveryText 'PHASE7C_RUNTIME_READY_STABLE_RECOVERY_STOPPED_LIFECYCLE_DASHBOARD_WINDOW=ENABLED' 'recovery must audit when the stopped-lifecycle dashboard window is opened'
Assert-ContainsLiteral $recoveryText 'Assert-LifecycleExecutorsStopped -Stage "PRE_WEB_STOPPED_LIFECYCLE_WINDOW"' 'recovery must prove executor absence before opening the dashboard window'
Assert-ContainsLiteral $recoveryText 'Assert-PauseDisarmed -Stage "PRE_WEB_STOPPED_LIFECYCLE_WINDOW"' 'recovery must re-prove PAUSE and DISARMED before opening the dashboard window'
Assert-ContainsLiteral $recoveryText 'Assert-BridgeSession -ExpectedSession $bridgeSessionId -Stage "PRE_WEB_STOPPED_LIFECYCLE_WINDOW"' 'recovery must re-prove Bridge identity before opening the dashboard window'
Assert-ContainsLiteral $recoveryText 'Assert-FlatBroker -Stage "PRE_WEB_STOPPED_LIFECYCLE_WINDOW"' 'recovery must re-prove flat XAUUSD state before opening the dashboard window'
Assert-ContainsLiteral $recoveryText '-AllowStoppedLifecycleCanonicalRecovery' 'recovery must pass the explicit stopped-lifecycle window to canonical Web deploy only after proof'

Write-Host "PHASE7C_STOPPED_LIFECYCLE_DASHBOARD_DEPLOY_SOURCE_TEST=PASS"
