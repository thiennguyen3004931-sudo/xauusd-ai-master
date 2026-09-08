param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProbePath = Join-Path $PSScriptRoot 'preflight-phase7c-production-readonly-local.ps1'
if (-not (Test-Path -LiteralPath $ProbePath -PathType Leaf)) {
    throw 'RED_TARGET: missing strict production read-only preflight helper.'
}

$source = Get-Content -LiteralPath $ProbePath -Raw
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($ProbePath, [ref]$tokens, [ref]$errors)
if (@($errors).Count -ne 0) {
    throw "Production read-only preflight has PowerShell parse errors: $(@($errors | ForEach-Object Message) -join '; ')"
}

$requiredMarkers = @(
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
)
foreach ($marker in $requiredMarkers) {
    if (-not $source.Contains($marker)) { throw "Missing strict read-only attestation marker: $marker" }
}

$requiredEvidence = @(
    'LOCAL_BRANCH=',
    'LOCAL_HEAD=',
    'LOCAL_TREE=',
    'LOCAL_DIRTY_COUNT=',
    'REMOTE_MAIN=',
    'DEPLOYMENT_SOURCE_COMMIT=',
    'DEPLOYMENT_SOURCE_TREE=',
    'DEPLOYMENT_ID=',
    'BOT_MODE=',
    'ARM=',
    'LIFECYCLE_RUNNING=',
    'LIFECYCLE_READY=',
    'XAUUSD_POSITIONS=',
    'XAUUSD_PENDING_ORDERS=',
    'UNRESOLVED_MUTATING_REQUESTS=',
    'ACCOUNT_MODE=',
    'ACCOUNT_LOGIN=',
    'ACCOUNT_SERVER=',
    'LIVE_AUTHORIZATION_VALID=',
    'TASK_OWNERSHIP=',
    'TASK_DRIFT=',
    'RUNTIME_SOURCE_OVERALL=',
    'RECOVERY_MUTATION_ALLOWED=',
    'BLOCKED_BY='
)
foreach ($marker in $requiredEvidence) {
    if (-not $source.Contains($marker)) { throw "Missing production preflight evidence output: $marker" }
}

$requiredEndpoints = @(
    '/api/v1/phase7c/bot-mode',
    '/api/v1/phase7c/lifecycle',
    '/api/v1/phase7c-live-arm-control/capability',
    '/api/v1/phase7c/account-switch/same-mode-readiness',
    '/api/v1/phase7c/account-switch/status',
    '/api/v1/phase7c-live-arm-control/status',
    '/api/v1/phase7c/runtime-source-attestation',
    '/v1/positions?symbol=XAUUSD',
    '/v1/orders?symbol=XAUUSD'
)
foreach ($endpoint in $requiredEndpoints) {
    if (-not $source.Contains($endpoint)) { throw "Missing required GET-only evidence endpoint: $endpoint" }
}

$componentNames = @('api','supervisor','trend','sideway','telegram','regime-notifier','lifecycle-broker')
foreach ($component in $componentNames) {
    if (-not $source.Contains($component)) { throw "Missing runtime-source component coverage: $component" }
}

$forbiddenCommands = @(
    'Set-Content','Add-Content','Out-File','New-Item','Remove-Item','Move-Item','Copy-Item','Rename-Item','Clear-Content','Set-Item',
    'Start-Process','Stop-Process','Start-ScheduledTask','Stop-ScheduledTask','Register-ScheduledTask','Set-ScheduledTask','Unregister-ScheduledTask',
    'Remove-Job','Start-Job'
)
$commands = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] }, $true))
foreach ($commandAst in $commands) {
    $name = $commandAst.GetCommandName()
    if (-not [string]::IsNullOrWhiteSpace($name) -and $forbiddenCommands -contains $name) {
        throw "Strict production read-only preflight contains forbidden command: $name"
    }
}

if ($source -match '(?im)-Method\s+(Post|Put|Patch|Delete)\b') {
    throw 'Strict production read-only preflight must use HTTP GET only.'
}
if ($source -match '(?im)\b(?:fetch|pull|checkout|reset|switch|restore|clean)\b' -and $source -match '(?i)(?:gitExe|git\s)') {
    throw 'Strict production read-only preflight must not contain mutating Git verbs.'
}
if ($source -match '(?i)\[System\.IO\.FileMode\]::(?:Create|CreateNew|OpenOrCreate|Append|Truncate)') {
    throw 'Strict production read-only preflight must not open files in a creating/writing mode.'
}
if ($source -match '(?i)(?:WriteAllText|WriteAllBytes|AppendAllText|CreateText|atomicWrite|unlinkSync|writeFileSync|renameSync)') {
    throw 'Strict production read-only preflight contains a forbidden file mutation primitive.'
}

$allowedTaskReads = @('Get-ScheduledTask','Get-ScheduledTaskInfo')
$taskCommands = @($commands | ForEach-Object { $_.GetCommandName() } | Where-Object { $_ -match 'ScheduledTask$' } | Sort-Object -Unique)
foreach ($name in $taskCommands) {
    if ($allowedTaskReads -notcontains $name) { throw "Scheduled Task command is not read-only: $name" }
}

if ($source -notmatch '(?m)&\s+\$gitExe\s+rev-parse\s+HEAD\b') { throw 'Missing local HEAD read through git rev-parse.' }
if ($source -notmatch '(?m)&\s+\$gitExe\s+rev-parse\s+HEAD\^\{tree\}') { throw 'Missing local tree read through git rev-parse HEAD^{tree}.' }
if ($source -notmatch '(?m)&\s+\$gitExe\s+status\s+--porcelain') { throw 'Missing worktree dirty-state read.' }
if ($source -notmatch '(?m)&\s+\$gitExe\s+ls-remote\s+--heads\s+origin\s+refs/heads/main') { throw 'Remote main must be read with git ls-remote only.' }

Write-Output 'PHASE7C_PRODUCTION_READONLY_PREFLIGHT_V2_SOURCE_CONTRACT=PASS'
