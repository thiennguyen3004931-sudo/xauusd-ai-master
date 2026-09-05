param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$HelperPath = Join-Path $PSScriptRoot 'rollout-phase7c-production-source-transition-local.ps1'
$RecoveryPath = Join-Path $PSScriptRoot 'recover-phase7c-runtime-ready-stable-deploy-local.ps1'
$P3VerifierPath = Join-Path $PSScriptRoot 'verify-phase7c-p3-production-acceptance-local.ps1'
$P4VerifierPath = Join-Path $PSScriptRoot 'verify-phase7c-p4-production-acceptance-local.ps1'

foreach ($required in @($RecoveryPath, $P3VerifierPath, $P4VerifierPath)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
        throw "Required canonical rollout dependency is missing: $required"
    }
}

if (-not (Test-Path -LiteralPath $HelperPath -PathType Leaf)) {
    throw 'RED_TARGET: missing production source-transition rollout helper.'
}

$source = Get-Content -LiteralPath $HelperPath -Raw
$tokens = $null
$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($HelperPath, [ref]$tokens, [ref]$errors)
if (@($errors).Count -ne 0) {
    throw "Production source-transition rollout helper has PowerShell parse errors: $(@($errors | ForEach-Object Message) -join '; ')"
}

function Require-Source([string]$Pattern, [string]$Label) {
    if ($source -notmatch $Pattern) {
        throw "Production source-transition rollout source contract missing: $Label"
    }
}

function Forbid-Source([string]$Pattern, [string]$Label) {
    if ($source -match $Pattern) {
        throw "Production source-transition rollout source contract forbids: $Label"
    }
}

Require-Source '\[string\]\$ProjectRoot' 'external ProjectRoot parameter'
Require-Source '\[string\]\$ExpectedCurrentCommit' 'exact current commit parameter'
Require-Source '\[string\]\$TargetCommit' 'exact target commit parameter'
Require-Source '\[string\]\$ExpectedRemoteMainCommit' 'independent exact remote-main pin'
Require-Source '\[string\]\$ExpectedHelperBlobSha1' 'pinned external helper blob parameter'
Require-Source 'hash-object' 'external helper blob provenance proof'
Require-Source 'branch --show-current' 'main branch guard'
Require-Source 'status --porcelain' 'clean worktree guard'
Require-Source 'ls-remote' 'canonical remote main proof'
Require-Source 'remoteMain\s+-ne\s+\$ExpectedRemoteMainCommit' 'remote main must match independent pin'
Require-Source 'fetch.*refs/heads/main' 'pre-stage exact remote main before LIVE mutation'
Require-Source 'merge-base.*--is-ancestor\s+\$ExpectedCurrentCommit\s+\$TargetCommit' 'current-to-target fast-forward ancestry proof'
Require-Source 'merge-base.*--is-ancestor\s+\$TargetCommit\s+\$ExpectedRemoteMainCommit' 'target must remain reachable from pinned remote main'
Require-Source 'merge.*--ff-only' 'exact fast-forward transition'
Require-Source 'rev-parse HEAD' 'post-transition exact HEAD proof'
Require-Source 'runtime-source-attestation' 'runtime-source pre/post attestation'
Require-Source 'overall.*EXACT_MATCH|EXACT_MATCH.*overall' '8/8 exact runtime-source guard'
Require-Source 'bot-mode' 'canonical PAUSE control path'
Require-Source 'DISARM_LIVE' 'canonical LIVE disarm path'
Require-Source 'lifecycle/stop' 'lifecycle stop before source transition'
Require-Source 'recover-phase7c-runtime-ready-stable-deploy-local\.ps1' 'canonical recovery deploy delegation'
Require-Source 'verify-phase7c-p3-production-acceptance-local\.ps1' 'P3 production acceptance'
Require-Source 'verify-phase7c-p4-production-acceptance-local\.ps1' 'P4 production acceptance'
Require-Source 'ARM_LIVE' 'ARM restore only after acceptance'
Require-Source 'bridgeSessionId' 'Bridge session continuity proof'
Require-Source 'positions\?symbol=XAUUSD' 'flat-position proof'
Require-Source 'orders\?symbol=XAUUSD' 'flat-pending-order proof'
Require-Source 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_ORDER_MUTATION=NONE' 'no order mutation attestation'
Require-Source 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_POSITION_MUTATION=NONE' 'no position mutation attestation'
Require-Source 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_LIVE_TEST_ORDER=NONE' 'no LIVE test order attestation'
Require-Source 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_FINAL_MODE=PAUSE' 'final PAUSE contract'
Require-Source 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_FINAL_ARM=ARMED' 'final ARMED contract'
Require-Source 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_STATUS=PASS' 'terminal PASS marker'

Forbid-Source 'remoteMain\s+-ne\s+\$TargetCommit' 'self-referential remote-main equals rollout-target gate'
Forbid-Source 'git\s+pull|&\s*\$gitExe\s+pull' 'git pull'
Forbid-Source 'reset\s+--hard' 'git reset --hard'
Forbid-Source 'checkout\s+--force|checkout\s+-f' 'forced checkout'
Forbid-Source 'function\s+Invoke-Bridge(Post|Put|Patch|Delete)' 'Bridge mutation helper'
Forbid-Source '/v1/(orders?|positions?)[^"''\r\n]*(send|close|cancel|modify|delete)' 'direct Bridge order/position mutation route'

Write-Output 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_SOURCE_CONTRACT=PASS'
Write-Output 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_GIT_MODE=EXACT_FF_ONLY'
Write-Output 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_REMOTE_MAIN=INDEPENDENT_PIN'
Write-Output 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_EXTERNAL_HELPER_PROVENANCE=PINNED_BLOB'
Write-Output 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_LIVE_TEST_ORDER=NONE'