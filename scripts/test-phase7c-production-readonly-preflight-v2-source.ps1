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
    'RUNTIME_ROOT=',
    'ACCOUNT_MODE=',
    'ACCOUNT_LOGIN=',
    'ACCOUNT_SERVER=',
    'CANONICAL_ACCOUNT_LOGIN=',
    'CANONICAL_ACCOUNT_SERVER=',
    'ACCOUNT_ENV_FILE_BINDING_VALID=',
    'BRIDGE_ACCOUNT_IDENTITY_MATCH=',
    'LIVE_AUTHORIZATION_VALID=',
    'TASK_OWNERSHIP=',
    'TASK_DRIFT=',
    'RUNTIME_SOURCE_OVERALL=',
    'RECOVERY_MUTATION_ALLOWED=',
    'BLOCKED_BY=',
    'ENDPOINT_BOT_MODE=',
    'ENDPOINT_LIFECYCLE=',
    'ENDPOINT_ARM_CAPABILITY=',
    'ENDPOINT_SAME_MODE_READINESS=',
    'ENDPOINT_ACCOUNT_SWITCH_STATUS=',
    'ENDPOINT_LIVE_ARM_STATUS=',
    'ENDPOINT_RUNTIME_SOURCE_ATTESTATION=',
    'ENDPOINT_BRIDGE_HEALTH=',
    'ENDPOINT_BRIDGE_POSITIONS=',
    'ENDPOINT_BRIDGE_ORDERS='
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

$componentNames = @('api','web','supervisor','trend','sideway','telegram','regime-notifier','lifecycle-broker')
foreach ($component in $componentNames) {
    if (-not $source.Contains($component)) { throw "Missing runtime-source component coverage: $component" }
}

foreach ($runtimeRootMarker in @('PHASE7C_RUNTIME_ROOT','PHASE7B_DEMO_WORK_DIR')) {
    if (-not $source.Contains($runtimeRootMarker)) {
        throw "Runtime-root resolution must mirror API precedence. Missing=$runtimeRootMarker"
    }
}
foreach ($identityEnvMarker in @('MT5_LOGIN','MT5_SERVER')) {
    if (-not $source.Contains($identityEnvMarker)) {
        throw "Exact canonical account identity must be read from the selected account env. Missing=$identityEnvMarker"
    }
}
if ($source -notmatch '(?i)bridgeAccountIdentityMatch') {
    throw 'Exact broker login/server identity comparison is required.'
}
if ($source -notmatch '(?i)accountEnvFileBindingValid') {
    throw 'Selected account-state envFile must be bound to the executor task config envFile.'
}

# A production probe must survive a stale API generation that does not expose
# one or more newer GET routes. Missing/unreachable evidence is BLOCKED evidence,
# not a reason to crash before printing the rest of the read-only snapshot.
foreach ($functionName in @('Get-HttpStatusCode','Invoke-ControlApiGetEvidence','Invoke-BridgeGetEvidence','Read-BridgeArrayEvidence')) {
    if ($source -notmatch ("(?m)^function\s+{0}\b" -f [regex]::Escape($functionName))) {
        throw "Missing non-throwing read-only evidence wrapper: $functionName"
    }
}
foreach ($gateMarker in @('CONTROL_API_EVIDENCE_AMBIGUOUS','BRIDGE_EXPOSURE_EVIDENCE_AMBIGUOUS')) {
    if (-not $source.Contains($gateMarker)) {
        throw "Route-missing/unreachable evidence must fail closed. Missing gate=$gateMarker"
    }
}
if ($source -match '(?m)^function\s+Invoke-ApiGet\b') {
    throw 'Mandatory control API evidence must not use the old throwing Invoke-ApiGet wrapper.'
}
if ($source -notmatch '(?i)HTTP_404') {
    throw 'Endpoint evidence must distinguish HTTP_404 route absence from successful reads.'
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
$gitInvocationLines = @($source -split "`r?`n" | Where-Object { $_ -match '\$gitExe|(?:^|\s)git(?:\.exe)?(?:\s|$)' })
foreach ($line in $gitInvocationLines) {
    if ($line -match '(?i)\b(?:fetch|pull|checkout|reset|switch|restore|clean)\b') {
        throw "Strict production read-only preflight contains mutating Git verb: $line"
    }
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
