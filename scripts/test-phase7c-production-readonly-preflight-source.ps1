$ErrorActionPreference = 'Stop'

$Preflight = Join-Path $PSScriptRoot 'check-phase7c-production-readonly-preflight-local.ps1'

function Assert-True([bool]$Value, [string]$Message) {
    if (-not $Value) { throw $Message }
}

function Assert-Contains([string]$Text, [string]$Needle, [string]$Message) {
    Assert-True ($Text.Contains($Needle)) $Message
}

Assert-True (Test-Path -LiteralPath $Preflight -PathType Leaf) "Missing production read-only preflight: $Preflight"

$tokens = $null
$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($Preflight, [ref]$tokens, [ref]$errors)
Assert-True ($errors.Count -eq 0) "PowerShell syntax error in ${Preflight}: $($errors[0].Message)"

$text = (Get-Content -LiteralPath $Preflight -Raw).Replace("`r`n", "`n").Replace("`r", "`n")

# Audit contract: this helper must be inspection-only.
foreach ($marker in @(
    'READ_ONLY=TRUE',
    'HTTP_METHODS=GET_ONLY',
    'GIT_MUTATION=NONE',
    'DEPLOYMENT_MANIFEST_MUTATION=NONE',
    'TASK_MUTATION=NONE',
    'PROCESS_MUTATION=NONE',
    'LIFECYCLE_MUTATION=NONE',
    'MODE_MUTATION=NONE',
    'ARM_MUTATION=NONE',
    'BRIDGE_RESTART=NONE',
    'EXECUTOR_RESTART=NONE',
    'ORDER_MUTATION=NONE',
    'POSITION_MUTATION=NONE',
    'LIVE_TEST_ORDER=NONE',
    'SECRET_VALUES_PRINTED=FALSE'
)) {
    Assert-Contains $text $marker "preflight must emit audit marker $marker"
}

# Git inspection must not mutate refs/worktree.
Assert-Contains $text 'git ls-remote' 'preflight must use git ls-remote for remote main inspection'
foreach ($forbidden in @('git fetch', 'git pull', 'git checkout', 'git reset', 'git clean')) {
    Assert-True (-not $text.Contains($forbidden)) "preflight must not contain mutating Git command: $forbidden"
}

# Runtime/API reads must stay GET-only and never invoke control mutations.
Assert-Contains $text '-Method Get' 'preflight must perform HTTP reads explicitly with GET'
foreach ($forbidden in @(
    '-Method Post', '-Method Put', '-Method Patch', '-Method Delete',
    'Start-ScheduledTask', 'Stop-ScheduledTask', 'Register-ScheduledTask', 'Unregister-ScheduledTask',
    'Stop-Process', 'Start-Process',
    '/lifecycle/start', '/lifecycle/stop',
    'ARM_LIVE', 'DISARM_LIVE'
)) {
    Assert-True (-not $text.Contains($forbidden)) "preflight must not contain mutation primitive: $forbidden"
}

# Evidence required before any later recovery decision.
foreach ($needle in @(
    'LOCAL_BRANCH=', 'LOCAL_HEAD=', 'LOCAL_TREE=', 'LOCAL_DIRTY_COUNT=', 'REMOTE_MAIN=',
    'DEPLOYMENT_COMMIT=', 'DEPLOYMENT_TREE=', 'DEPLOYMENT_ID=',
    'BOT_MODE=', 'ARM_STATUS=', 'LIFECYCLE_RUNNING=', 'LIFECYCLE_READY=',
    'XAUUSD_POSITIONS=', 'XAUUSD_PENDING_ORDERS=', 'UNRESOLVED_MUTATING_REQUESTS=',
    'BRIDGE_REACHABLE=', 'BRIDGE_SESSION_ID=', 'ACCOUNT_MODE=', 'ACCOUNT_LOGIN=', 'ACCOUNT_SERVER=',
    'LIVE_AUTHORIZATION_VALID=',
    'TASK_OWNERSHIP=', 'TASK_DRIFT=',
    'RUNTIME_SOURCE_API=', 'RUNTIME_SOURCE_SUPERVISOR=', 'RUNTIME_SOURCE_TREND=',
    'RUNTIME_SOURCE_SIDEWAY=', 'RUNTIME_SOURCE_TELEGRAM=', 'RUNTIME_SOURCE_REGIME_NOTIFIER=',
    'RUNTIME_SOURCE_LIFECYCLE_BROKER=',
    'PRODUCTION_ACCEPTANCE=', 'RECOVERY_MUTATION_ALLOWED=', 'BLOCKED_BY='
)) {
    Assert-Contains $text $needle "preflight must emit evidence field $needle"
}

# Fail closed: unknown/unsafe state must never be promoted to mutation eligibility.
Assert-Contains $text "RECOVERY_MUTATION_ALLOWED=FALSE" 'preflight must have an explicit fail-closed mutation verdict'
Assert-Contains $text "PRODUCTION_ACCEPTANCE=PASS" 'preflight must have an explicit exact-runtime acceptance verdict'
Assert-Contains $text "PRODUCTION_ACCEPTANCE=FAIL" 'preflight must have an explicit failed acceptance verdict'

Write-Host 'PHASE7C_PRODUCTION_READONLY_PREFLIGHT_SOURCE_TEST=PASS'
