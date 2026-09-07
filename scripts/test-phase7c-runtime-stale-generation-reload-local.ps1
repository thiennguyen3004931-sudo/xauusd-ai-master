$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$attestationLibrary = Join-Path $PSScriptRoot 'lib\phase7c-runtime-source-attestation.ps1'
$recoveryScript = Join-Path $PSScriptRoot 'recover-phase7c-runtime-ready-stable-deploy-local.ps1'

foreach ($required in @($attestationLibrary, $recoveryScript)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Required source missing: $required"
  }
}

. $attestationLibrary

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Assert-False([bool]$Condition, [string]$Message) {
  if ($Condition) { throw $Message }
}

function New-TestDeployment {
  return [pscustomobject][ordered]@{
    version = 1
    deploymentId = '11111111111111111111111111111111'
    sourceCommit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    sourceTree = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    branch = 'main'
    worktreeClean = $true
    createdAt = 1L
    configFingerprint = 'sha256:' + ('c' * 64)
  }
}

function New-TestBrokerAttestation {
  param(
    [string]$DeploymentId = '11111111111111111111111111111111',
    [string]$SourceCommit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    [string]$SourceTree = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  )

  return [pscustomobject][ordered]@{
    version = 1
    component = 'lifecycle-broker'
    deploymentId = $DeploymentId
    sourceCommit = $SourceCommit
    sourceTree = $SourceTree
    pid = 4242
    startedAt = 1L
    launcherSha256 = 'sha256:' + ('d' * 64)
    configFingerprint = 'sha256:' + ('c' * 64)
  }
}

$deployment = New-TestDeployment
$matchingBroker = New-TestBrokerAttestation
$matchingStatus = Get-Phase7CRuntimeSourceComponentDeploymentStatus `
  -Attestation $matchingBroker `
  -Deployment $deployment `
  -ExpectedComponent 'lifecycle-broker'
Assert-True ($matchingStatus -eq 'MATCH') 'Matching lifecycle-broker attestation must classify MATCH.'

$unchangedAndMatching = Get-Phase7CRuntimeSourceGenerationReloadDecision `
  -DeploymentChanged $false `
  -LifecycleBrokerSourceStatus $matchingStatus
Assert-False ([bool]$unchangedAndMatching.reloadRequired) 'Unchanged deployment + matching broker must not force generation reload.'
Assert-True ([string]$unchangedAndMatching.reason -eq 'NOT_REQUIRED') 'Matching generation should report NOT_REQUIRED.'

$deploymentChanged = Get-Phase7CRuntimeSourceGenerationReloadDecision `
  -DeploymentChanged $true `
  -LifecycleBrokerSourceStatus $matchingStatus
Assert-True ([bool]$deploymentChanged.reloadRequired) 'A changed deployment must require generation reload.'
Assert-True ([string]$deploymentChanged.reason -eq 'DEPLOYMENT_CHANGED') 'Deployment change must retain an explicit reason.'

$staleBroker = New-TestBrokerAttestation -DeploymentId '22222222222222222222222222222222'
$staleStatus = Get-Phase7CRuntimeSourceComponentDeploymentStatus `
  -Attestation $staleBroker `
  -Deployment $deployment `
  -ExpectedComponent 'lifecycle-broker'
Assert-True ($staleStatus -eq 'MISMATCH') 'Stale lifecycle-broker deployment identity must classify MISMATCH.'

$unchangedButStale = Get-Phase7CRuntimeSourceGenerationReloadDecision `
  -DeploymentChanged $false `
  -LifecycleBrokerSourceStatus $staleStatus
Assert-True ([bool]$unchangedButStale.reloadRequired) 'Unchanged deployment + stale broker must require generation reload.'
Assert-True ([string]$unchangedButStale.reason -eq 'LIFECYCLE_BROKER_SOURCE_MISMATCH') 'Stale broker must expose an explicit reload reason.'

$invalidBroker = New-TestBrokerAttestation
$invalidBroker.PSObject.Properties.Remove('sourceTree')
$invalidFailedClosed = $false
try {
  [void](Get-Phase7CRuntimeSourceComponentDeploymentStatus `
    -Attestation $invalidBroker `
    -Deployment $deployment `
    -ExpectedComponent 'lifecycle-broker')
} catch {
  $invalidFailedClosed = $true
}
Assert-True $invalidFailedClosed 'Malformed broker attestation must fail closed instead of being treated as a mismatch/reload hint.'

$recoverySource = Get-Content -LiteralPath $recoveryScript -Raw
if ($recoverySource -notmatch 'Get-Phase7CRuntimeSourceComponentDeploymentStatus') {
  throw 'Recovery must classify the current lifecycle-broker attestation before deciding source-generation reload.'
}
if ($recoverySource -notmatch 'Get-Phase7CRuntimeSourceGenerationReloadDecision') {
  throw 'Recovery must use the canonical reload decision helper instead of deployment-id-only logic.'
}

Write-Host 'PHASE7C_RUNTIME_STALE_GENERATION_RELOAD_CONTRACT=PASS'
Write-Host 'DEPLOYMENT_CHANGED_RELOAD=PASS'
Write-Host 'UNCHANGED_MATCHING_BROKER_NO_RELOAD=PASS'
Write-Host 'UNCHANGED_STALE_BROKER_RELOAD=PASS'
Write-Host 'MALFORMED_ATTESTATION_FAIL_CLOSED=PASS'
