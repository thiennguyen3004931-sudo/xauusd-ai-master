$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Helper = Join-Path $PSScriptRoot "reconcile-phase7c-runtime-source-generation-local.ps1"

if (-not (Test-Path -LiteralPath $Helper -PathType Leaf)) {
  throw "Missing runtime source generation reconciliation helper: $Helper"
}

$source = Get-Content -LiteralPath $Helper -Raw

function Require-Text([string]$Needle, [string]$Message) {
  if (-not $source.Contains($Needle)) { throw $Message }
}

function Forbid-Text([string]$Needle, [string]$Message) {
  if ($source.Contains($Needle)) { throw $Message }
}

Require-Text '[string]$ExpectedCommit' 'helper must require exact ExpectedCommit input'
Require-Text 'branch --show-current' 'helper must require canonical main branch'
Require-Text 'status --porcelain' 'helper must require a clean worktree'
Require-Text 'rev-parse HEAD' 'helper must pin the exact local commit'
Require-Text 'XAUUSD-Phase7C-Executors' 'helper must target only the canonical executor Scheduled Task'
Require-Text 'Get-Phase7CTrustedGitFileSha256' 'helper must verify the trusted Scheduled Task runner hash'
Require-Text 'Test-Phase7CExecutorTaskActionOwnership' 'helper must prove Scheduled Task action ownership before mutation'
Require-Text 'SYSTEM + ServiceAccount + Highest' 'helper must prove canonical SYSTEM task principal'
Require-Text '/api/v1/phase7c/runtime-source-attestation' 'helper must read canonical runtime source attestation'
Require-Text 'API_WEB_EXACT_PREFLIGHT=PASS' 'helper must require API and Web EXACT before generation mutation'
Require-Text 'SYSTEM_GENERATION_MISMATCH_PREFLIGHT=PASS' 'helper must require the six SYSTEM components to be generation-only mismatches'
Require-Text 'SOURCE_COMMIT_MISMATCH' 'helper must classify source generation mismatch explicitly'
Require-Text 'SOURCE_TREE_MISMATCH' 'helper must classify source tree mismatch explicitly'
Require-Text 'DEPLOYMENT_ID_MISMATCH' 'helper must classify deployment id mismatch explicitly'
Require-Text 'Assert-FlatBroker' 'helper must verify XAUUSD positions and pending orders are zero'
Require-Text 'bridgeSessionId' 'helper must preserve the Bridge session identity'
Require-Text 'DISARM_LIVE' 'helper must canonical-disarm before SYSTEM generation restart'
Require-Text '/api/v1/phase7c/lifecycle/stop' 'helper must stop the lifecycle before Scheduled Task restart'
Require-Text 'Stop-ScheduledTask' 'helper must stop the canonical SYSTEM broker task'
Require-Text 'Start-ScheduledTask' 'helper must restart the canonical SYSTEM broker task'
Require-Text 'lifecycle-broker.json' 'helper must verify fresh broker source attestation'
Require-Text '/api/v1/phase7c/lifecycle/start' 'helper must restart the executor lifecycle from the reconciled broker generation'
Require-Text 'READY_STABLE_MS=5000' 'helper must require stable lifecycle READY after restart'
Require-Text 'FULL_RUNTIME_SOURCE_ATTESTATION=PASS' 'helper must require final full runtime source attestation'
Require-Text 'RUNTIME_SOURCE_ATTESTATION_EXACT_COUNT=8/8' 'helper must require all eight components exact'
Require-Text 'ARM_LIVE' 'helper must restore canonical LIVE ARM only after full verification'
Require-Text 'FINAL_MODE=PAUSE' 'helper must finish in PAUSE'
Require-Text 'FINAL_ARM=ARMED' 'helper must finish ARMED when reconciliation succeeds'
Require-Text 'BRIDGE_RESTART=NONE' 'helper must preserve Bridge runtime'
Require-Text 'WEB_API_RESTART=NONE' 'helper must not restart Web/API during SYSTEM generation reconciliation'
Require-Text 'ORDER_MUTATION=NONE' 'helper must not submit or mutate orders'
Require-Text 'LIVE_TEST_ORDER=NONE' 'helper must never send a LIVE test order'
Require-Text 'FAIL_CLOSED_MODE=PAUSE' 'helper failure path must remain PAUSE'
Require-Text 'FAIL_CLOSED_ARM=DISARMED_BEST_EFFORT' 'helper failure path must remain DISARMED best effort'

Forbid-Text 'deploy-phase7c-web-ui-local.ps1' 'generation reconciliation must not create another Web/API deployment generation'
Forbid-Text 'Initialize-Phase7CRuntimeSourceDeployment' 'generation reconciliation must reuse the accepted deployment identity rather than minting a new one'

Write-Host 'PHASE7C_RUNTIME_SOURCE_GENERATION_RECONCILIATION_SOURCE_CONTRACT=PASS'
