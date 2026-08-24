$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DeployScript = Join-Path $ProjectRoot "scripts\deploy-phase7c-mt5-dashboard-local.ps1"

if (-not (Test-Path -LiteralPath $DeployScript)) {
  throw "Dashboard deploy source not found: $DeployScript"
}

$Source = Get-Content -LiteralPath $DeployScript -Raw
[void][scriptblock]::Create($Source)

function Assert-Contains([string]$Pattern, [string]$Label) {
  if ($Source -notmatch $Pattern) {
    throw "Missing dashboard deploy safety marker: $Label"
  }
}

function Assert-Literal([string]$Text, [string]$Label) {
  if ($Source.IndexOf($Text, [System.StringComparison]::Ordinal) -lt 0) {
    throw "Missing dashboard deploy literal: $Label"
  }
}

function Assert-NotContains([string]$Pattern, [string]$Label) {
  if ($Source -match $Pattern) {
    throw "Forbidden dashboard deploy pattern detected: $Label"
  }
}

Assert-Contains 'function\s+Test-ProjectCoreCommand' 'project process ownership check'
Assert-Contains 'function\s+Get-VerifiedCoreRoots' 'verified core root discovery'
Assert-Contains 'function\s+Test-DescendantOfRoot' 'protected executor tree check'
Assert-Contains 'Unrecognized owner for localhost port' 'fail closed on unknown listener'
Assert-Contains 'Safety block: core root PID=' 'executor ancestry safety block'
Assert-Contains 'run-phase7c-executors\|trend-executor\|sideway-executor' 'executor command marker block'
Assert-Contains 'PHASE7C_DASHBOARD_DEPLOY_EXECUTOR_TREE_ISOLATION=PASS' 'tree isolation marker'
Assert-Contains 'PHASE7C_DASHBOARD_DEPLOY_PORT_RELEASE=PASS' 'port release marker'
Assert-Contains 'PHASE7C_DASHBOARD_DEPLOY_MODE_PRESERVED=' 'mode preservation marker'
Assert-Contains 'PHASE7C_DASHBOARD_DEPLOY_EXECUTORS_UNCHANGED=PASS' 'executor PID preservation marker'
Assert-Contains 'PHASE7C_DASHBOARD_DEPLOY_STATUS=PASS' 'final deploy marker'
Assert-Literal '(?m)^accountMode=DEMO$' 'DEMO-only dashboard preflight'
Assert-Literal '(?m)^readOnly=true$' 'read-only dashboard contract'
Assert-Literal '(?m)^mt5OrderPermission=NONE$' 'no MT5 order permission'
Assert-Literal 'install-phase7c-mt5-decision-panel-local.ps1' 'panel installer call'
Assert-Literal 'verify-phase7c-executors-local.ps1' 'strict verifier call'
Assert-Literal '-RequireMigratedTask -RequireTelegram' 'strict verifier flags'
Assert-NotContains 'activate-phase7c-local\.ps1' 'full activation must not be used'
Assert-NotContains 'XAUUSD-Phase7C-Executors' 'executor scheduled task must not be touched'
Assert-NotContains '\[int\]\$Pid(?:\W|$)' 'reserved automatic PID variable parameter'

Write-Host "PHASE7C_DASHBOARD_SAFE_DEPLOY_SOURCE_TEST=PASS"
