param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$HelperPath = Join-Path $PSScriptRoot 'rollout-phase7c-production-source-transition-local.ps1'
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

if ($source -notmatch '\[switch\]\$ReadOnlyPreflightOnly') {
    throw 'Production rollout helper must expose -ReadOnlyPreflightOnly.'
}

$attestationMarker = "Write-Host 'PHASE7C_PRODUCTION_SOURCE_TRANSITION_MUTATION_ORDER=STOP_THEN_DISARM'"
$attestationIndex = $source.IndexOf($attestationMarker, [System.StringComparison]::Ordinal)
if ($attestationIndex -lt 0) { throw 'Mutation-order preflight attestation marker is missing.' }

$mutationMarker = '$mutationStarted = $false'
$mutationIndex = $source.IndexOf($mutationMarker, $attestationIndex, [System.StringComparison]::Ordinal)
if ($mutationIndex -lt 0) { throw 'Mutation block marker is missing after preflight attestations.' }

$preMutationTail = $source.Substring($attestationIndex, $mutationIndex - $attestationIndex)
if ($preMutationTail -notmatch 'if\s*\(\$ReadOnlyPreflightOnly\)\s*\{') {
    throw 'Read-only preflight exit must occur after full production preflight attestations and before mutation starts.'
}
if ($preMutationTail -notmatch "PHASE7C_PRODUCTION_SOURCE_TRANSITION_PREFLIGHT_ONLY=PASS") {
    throw 'Read-only preflight terminal PASS attestation is missing.'
}
if ($preMutationTail -notmatch "PHASE7C_PRODUCTION_SOURCE_TRANSITION_READ_ONLY=TRUE") {
    throw 'Read-only preflight must attest READ_ONLY=TRUE.'
}
if ($preMutationTail -notmatch "PHASE7C_PRODUCTION_SOURCE_TRANSITION_HTTP_METHODS=GET_ONLY") {
    throw 'Read-only preflight must attest HTTP_METHODS=GET_ONLY.'
}
if ($preMutationTail -notmatch '(?m)^\s*return\s*$') {
    throw 'Read-only preflight must return before mutationStarted is set.'
}

$readonlyIfIndex = $preMutationTail.IndexOf('if ($ReadOnlyPreflightOnly)', [System.StringComparison]::Ordinal)
$returnIndex = $preMutationTail.IndexOf('return', $readonlyIfIndex, [System.StringComparison]::Ordinal)
if ($readonlyIfIndex -lt 0 -or $returnIndex -lt 0) {
    throw 'Read-only preflight guard/return ordering is invalid.'
}

Write-Output 'PHASE7C_PRODUCTION_READONLY_PREFLIGHT_SOURCE_CONTRACT=PASS'
