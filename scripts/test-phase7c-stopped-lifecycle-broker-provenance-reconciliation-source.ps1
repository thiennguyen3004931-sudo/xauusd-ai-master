$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ReconcilePath = Join-Path $PSScriptRoot 'reconcile-phase7c-stopped-lifecycle-broker-provenance-local.ps1'

if (-not (Test-Path -LiteralPath $ReconcilePath -PathType Leaf)) {
  throw "RED: broker-only provenance reconciliation entrypoint is missing: $ReconcilePath"
}

$tokens = $null
$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($ReconcilePath, [ref]$tokens, [ref]$errors)
if ($errors.Count -ne 0) {
  throw "PowerShell syntax error in ${ReconcilePath}: $($errors[0].Message)"
}

$source = (Get-Content -LiteralPath $ReconcilePath -Raw).Replace("`r`n", "`n").Replace("`r", "`n")

function Assert-ContainsLiteral {
  param([string]$Literal, [string]$Message)
  if ($source.IndexOf($Literal, [System.StringComparison]::Ordinal) -lt 0) {
    throw "RED: $Message missing=$Literal"
  }
}

function Assert-NotContainsLiteral {
  param([string]$Literal, [string]$Message)
  if ($source.IndexOf($Literal, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
    throw "RED: $Message forbidden=$Literal"
  }
}

# Exact operator inputs and source/deployment identity.
foreach ($literal in @(
  '[string]$TaskName = ''XAUUSD-Phase7C-Executors''',
  '[string]$ExpectedCommit',
  '[string]$ExpectedTree',
  '[string]$ExpectedDeploymentId',
  '[int]$TimeoutSeconds = 30',
  'PHASE7C_BROKER_RECONCILE_GIT_GUARD=PASS',
  'PHASE7C_BROKER_RECONCILE_DEPLOYMENT_GUARD=PASS'
)) {
  Assert-ContainsLiteral $literal 'Exact source/deployment contract'
}

# Reuse canonical trust primitives rather than inventing another ownership model.
foreach ($literal in @(
  'phase7c-scheduled-task-ownership.ps1',
  'phase7c-runtime-ownership-probe.ps1',
  'phase7c-runtime-source-attestation.ps1',
  'Get-Phase7CTrustedGitFileSha256',
  'Test-Phase7CExecutorTaskActionOwnership',
  'Get-Phase7CExecutorTaskDrift',
  'Get-Phase7CRuntimeGenerationSnapshot',
  'Read-Phase7CRuntimeSourceDeployment'
)) {
  Assert-ContainsLiteral $literal 'Canonical trust primitive'
}

# Preflight must be GET-only for application/bridge state and must prove the stopped/flat envelope.
foreach ($literal in @(
  '-Method Get',
  '/api/v1/phase7c/bot-mode',
  '/api/v1/phase7c-live-arm-control/capability',
  '/api/v1/phase7c/lifecycle',
  '/api/v1/phase7c/runtime-source-attestation',
  '/v1/positions?symbol=XAUUSD',
  '/v1/orders?symbol=XAUUSD',
  '/health',
  'PHASE7C_BROKER_RECONCILE_PREFLIGHT_MODE=PAUSE',
  'PHASE7C_BROKER_RECONCILE_PREFLIGHT_ARM=DISARMED',
  'PHASE7C_BROKER_RECONCILE_PREFLIGHT_LIFECYCLE=STOPPED',
  'PHASE7C_BROKER_RECONCILE_PREFLIGHT_POSITIONS=0',
  'PHASE7C_BROKER_RECONCILE_PREFLIGHT_PENDING_ORDERS=0',
  'PHASE7C_BROKER_RECONCILE_PREFLIGHT_BRIDGE=PASS'
)) {
  Assert-ContainsLiteral $literal 'Stopped-lifecycle safety preflight'
}

# Attestation classification must be exact: API/Web active exact, broker live provenance-only mismatch,
# and inactive lifecycle components stale/dead. Unknown or non-provenance broker mismatches must fail closed.
foreach ($literal in @(
  'API_ATTESTATION=EXACT_MATCH',
  'WEB_ATTESTATION=EXACT_MATCH',
  'BROKER_ATTESTATION=MISMATCH_PROVENANCE_ONLY',
  'SOURCE_COMMIT_MISMATCH',
  'SOURCE_TREE_MISMATCH',
  'DEPLOYMENT_ID_MISMATCH',
  'supervisor',
  'trend',
  'sideway',
  'telegram',
  'regime-notifier',
  'INACTIVE_ATTESTATIONS=STALE_DEAD'
)) {
  Assert-ContainsLiteral $literal 'Runtime-source attestation classification'
}

# Canonical task/generation proof before mutation.
foreach ($literal in @(
  'SYSTEM',
  'ServiceAccount',
  'Highest',
  'TASK_OWNERSHIP=CANONICAL',
  'TASK_DRIFT=NONE',
  'BROKER_HEARTBEAT_FRESH=TRUE',
  'STARTUP_RUNNER_LOCK=HELD'
)) {
  Assert-ContainsLiteral $literal 'Canonical Scheduled Task ownership/generation gate'
}

# The only intended mutation is stop/start of the same canonical Scheduled Task.
$stopLiteral = 'Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop'
$startLiteral = 'Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop'
Assert-ContainsLiteral $stopLiteral 'Canonical task stop'
Assert-ContainsLiteral $startLiteral 'Canonical task start'
Assert-ContainsLiteral 'BROKER_PREVIOUS_PID_EXIT=PASS' 'Previous broker exit proof'
Assert-ContainsLiteral 'BROKER_NEW_PID=PASS' 'Fresh broker PID proof'
Assert-ContainsLiteral 'ORPHAN_QUEUED_RETRY=ONCE' 'Bounded known-safe queued retry'

$stopIndex = $source.IndexOf($stopLiteral, [System.StringComparison]::Ordinal)
$startIndex = $source.IndexOf($startLiteral, [System.StringComparison]::Ordinal)
if ($stopIndex -lt 0 -or $startIndex -le $stopIndex) {
  throw 'RED: canonical Scheduled Task START must occur after STOP.'
}

# Postflight must prove the broker is exact at the accepted deployment and everything else stayed stopped/unchanged.
foreach ($literal in @(
  'BROKER_ATTESTATION=EXACT_MATCH',
  'API_PID_UNCHANGED=TRUE',
  'WEB_PID_UNCHANGED=TRUE',
  'BRIDGE_PID_UNCHANGED=TRUE',
  'BRIDGE_SESSION_UNCHANGED=TRUE',
  'POSTFLIGHT_LIFECYCLE=STOPPED',
  'POSTFLIGHT_MODE=PAUSE',
  'POSTFLIGHT_ARM=DISARMED',
  'POSTFLIGHT_POSITIONS=0',
  'POSTFLIGHT_PENDING_ORDERS=0',
  'WHOLE_RUNTIME_RECONCILED=True',
  'WHOLE_RUNTIME_EXACT=False',
  'WHOLE_RUNTIME_OVERALL=STALE',
  'EXECUTORS_STARTED=False',
  'MODE_MUTATION=NONE',
  'ARM_MUTATION=NONE',
  'ORDER_MUTATION=NONE',
  'POSITION_MUTATION=NONE',
  'LIVE_TEST_ORDER=NONE',
  'PHASE7C_BROKER_PROVENANCE_RECONCILIATION=PASS'
)) {
  Assert-ContainsLiteral $literal 'Broker-only postflight/result contract'
}

# Explicitly forbid broad recovery/deploy semantics and trading/control mutations.
foreach ($forbidden in @(
  '/api/v1/phase7c/lifecycle/start',
  '/api/v1/phase7c/lifecycle/restart',
  '/api/v1/phase7c/bot-mode'' -Method Post',
  '/api/v1/phase7c-live-arm-control',
  'Set-ScheduledTask',
  'Register-ScheduledTask',
  'Restart-Service',
  'Stop-Process',
  'taskkill',
  'run-phase7c-executors-local.ps1',
  'Start-Phase7CExecutorRuntime',
  'deploy-phase7c-web-ui-local.ps1',
  'deploy-phase7c-mt5-dashboard-local.ps1',
  '/v1/order',
  '/v1/position'
)) {
  Assert-NotContainsLiteral $forbidden 'Broker-only reconciliation must not broaden mutation scope'
}

Write-Host 'PHASE7C_STOPPED_LIFECYCLE_BROKER_PROVENANCE_RECONCILIATION_SOURCE_TEST=PASS'
