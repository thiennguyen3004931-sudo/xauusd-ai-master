$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DeployScript = Join-Path $ProjectRoot "scripts\deploy-phase7c-web-ui-local.ps1"

if (-not (Test-Path -LiteralPath $DeployScript)) {
  throw "Web UI deploy source not found: $DeployScript"
}

$Source = Get-Content -LiteralPath $DeployScript -Raw
[void][scriptblock]::Create($Source)

function Assert-Contains([string]$Pattern, [string]$Label) {
  if ($Source -notmatch $Pattern) { throw "Missing web UI deploy safety marker: $Label" }
}
function Assert-Literal([string]$Text, [string]$Label) {
  if ($Source.IndexOf($Text, [System.StringComparison]::Ordinal) -lt 0) { throw "Missing web UI deploy literal: $Label" }
}
function Assert-NotContains([string]$Pattern, [string]$Label) {
  if ($Source -match $Pattern) { throw "Forbidden web UI deploy pattern detected: $Label" }
}

Assert-Literal 'fix/phase7c-legacy-background-cleanup' 'integration branch guard'
Assert-Literal 'git working tree' 'clean working tree guard'
Assert-Literal 'merge-base --is-ancestor' 'required commit ancestry guard'
Assert-Literal "--filter '@xauusd/web' build" 'web build before restart'
Assert-Literal 'deploy-phase7c-mt5-dashboard-local.ps1' 'reuse verified dashboard restart helper'
Assert-Literal '-SkipPanelInstall' 'web-only restart path'
Assert-Literal 'PHASE7C_WEB_UI_DEPLOY_BUILD=PASS' 'build pass marker'
Assert-Literal 'PHASE7C_WEB_UI_DEPLOY_RUNTIME_RESTART=PASS' 'runtime restart marker'
Assert-Literal 'PHASE7C_WEB_UI_DEPLOY_STATUS=PASS' 'final pass marker'
Assert-NotContains 'activate-phase7c-local\.ps1' 'must not run full activation'
Assert-NotContains 'run-phase7c-executors' 'must not start or stop executors directly'
Assert-NotContains 'switch-phase7c-account-mode' 'must not switch account mode'
Assert-NotContains 'git\s+(reset|clean|checkout)' 'must not mutate git working tree destructively'
Assert-NotContains 'git\s+pull' 'deploy helper must not self-update while running'
Assert-NotContains 'LIVE_EXECUTION|MT5_ALLOW_REAL_ACCOUNT' 'must not enable LIVE execution'

Write-Host "PHASE7C_WEB_UI_SAFE_DEPLOY_SOURCE_TEST=PASS"
