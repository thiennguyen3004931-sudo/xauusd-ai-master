$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DeployScript = Join-Path $ProjectRoot "scripts\deploy-phase7c-web-ui-local.ps1"
$DashboardDeployScript = Join-Path $ProjectRoot "scripts\deploy-phase7c-mt5-dashboard-local.ps1"

foreach ($path in @($DeployScript, $DashboardDeployScript)) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Web UI deploy source not found: $path"
  }
}

$Source = Get-Content -LiteralPath $DeployScript -Raw
$DashboardSource = Get-Content -LiteralPath $DashboardDeployScript -Raw
[void][scriptblock]::Create($Source)
[void][scriptblock]::Create($DashboardSource)

function Assert-Contains([string]$Pattern, [string]$Label) {
  if ($Source -notmatch $Pattern) { throw "Missing web UI deploy safety marker: $Label" }
}
function Assert-Literal([string]$Text, [string]$Label) {
  if ($Source.IndexOf($Text, [System.StringComparison]::Ordinal) -lt 0) { throw "Missing web UI deploy literal: $Label" }
}
function Assert-NotContains([string]$Pattern, [string]$Label) {
  if ($Source -match $Pattern) { throw "Forbidden web UI deploy pattern detected: $Label" }
}
function Assert-DashboardLiteral([string]$Text, [string]$Label) {
  if ($DashboardSource.IndexOf($Text, [System.StringComparison]::Ordinal) -lt 0) { throw "Missing account-aware dashboard deploy literal: $Label" }
}
function Assert-DashboardNotContains([string]$Pattern, [string]$Label) {
  if ($DashboardSource -match $Pattern) { throw "Forbidden dashboard deploy pattern detected: $Label" }
}

Assert-Literal '[Parameter(Mandatory = $true)]' 'ExpectedCommit must be explicit'
Assert-Literal '[string]$ExpectedCommit' 'exact expected commit parameter'
Assert-Literal '$branch -ne "main"' 'main branch guard'
Assert-Literal '$head = (& $git.Source rev-parse HEAD).Trim()' 'exact HEAD resolution'
Assert-Literal '$head -ne $ExpectedCommit' 'exact SHA equality guard'
Assert-Literal 'PHASE7C_WEB_UI_DEPLOY_EXPECTED_COMMIT=$ExpectedCommit' 'expected SHA audit marker'
Assert-Literal 'PHASE7C_WEB_UI_DEPLOY_HEAD=$head' 'actual HEAD audit marker'
Assert-Literal 'git working tree' 'clean working tree guard'
Assert-Literal "--filter '@xauusd/web' build" 'web build before restart'
Assert-Literal 'deploy-phase7c-mt5-dashboard-local.ps1' 'reuse verified dashboard restart helper'
Assert-Literal '-SkipPanelInstall' 'web-only restart path'
Assert-Literal 'PHASE7C_WEB_UI_DEPLOY_BUILD=PASS' 'build pass marker'
Assert-Literal 'PHASE7C_WEB_UI_DEPLOY_RUNTIME_RESTART=PASS' 'runtime restart marker'
Assert-Literal 'PHASE7C_WEB_UI_DEPLOY_STATUS=PASS' 'final pass marker'
Assert-NotContains 'fix/phase7c-legacy-background-cleanup' 'legacy integration branch pin'
Assert-NotContains 'ecf784047b5c573cb3a2083df92714f3fdad1986' 'legacy required commit pin'
Assert-NotContains '\$RequiredCommit' 'legacy RequiredCommit contract'
Assert-NotContains 'merge-base\s+--is-ancestor' 'ancestry-only commit acceptance'
Assert-NotContains 'activate-phase7c-local\.ps1' 'must not run full activation'
Assert-NotContains 'run-phase7c-executors' 'must not start or stop executors directly'
Assert-NotContains 'switch-phase7c-account-mode' 'must not switch account mode'
Assert-NotContains 'git\s+(reset|clean|checkout)' 'must not mutate git working tree destructively'
Assert-NotContains 'git\s+pull' 'deploy helper must not self-update while running'
Assert-NotContains 'LIVE_EXECUTION|MT5_ALLOW_REAL_ACCOUNT' 'must not enable LIVE execution'

Assert-DashboardLiteral 'Read-UiAccountMode' 'derive selected DEMO/LIVE from read-only UI contract'
Assert-DashboardLiteral '$expectedAccountMode -notin @("DEMO", "LIVE")' 'only DEMO/LIVE accepted'
Assert-DashboardLiteral 'mt5OrderPermission=NONE' 'panel remains read-only'
Assert-DashboardLiteral 'PHASE7C_DASHBOARD_DEPLOY_ACCOUNT_MODE=$expectedAccountMode' 'selected account marker'
Assert-DashboardLiteral 'PHASE7C_DASHBOARD_DEPLOY_MODE_PRESERVED=$preservedMode' 'bot mode preservation'
Assert-DashboardLiteral 'PHASE7C_DASHBOARD_DEPLOY_EXECUTORS_UNCHANGED=PASS' 'executor PID preservation'
Assert-DashboardLiteral 'PHASE7C_DASHBOARD_DEPLOY_LIVE_ARM_FILE_PRESERVED=$armFileAfter' 'LIVE arm file preservation'
Assert-DashboardLiteral 'verify-phase7c-account-runtime-local.ps1' 'account-aware strict verifier'
Assert-DashboardLiteral '-ExpectedAccountMode $expectedAccountMode' 'strict verifier expected mode'
Assert-DashboardLiteral 'autoReason1=' 'new AUTO semantic reason contract'
Assert-DashboardLiteral 'trendWaitReason1=' 'new Trend wait reason contract'
Assert-DashboardLiteral 'sidewayWaitReason1=' 'new Sideway wait reason contract'
Assert-DashboardNotContains 'preflight requires DEMO account' 'legacy DEMO-only deploy guard'
Assert-DashboardNotContains '(?m)\^accountMode=DEMO\$' 'hard-coded DEMO readiness check'
Assert-DashboardNotContains 'switch-phase7c-account-mode' 'dashboard deploy must not switch accounts'
Assert-DashboardNotContains 'arm-phase7c-live|disarm-phase7c-live' 'dashboard deploy must not alter LIVE arm'

Write-Host "PHASE7C_WEB_UI_SAFE_DEPLOY_SOURCE_TEST=PASS"
