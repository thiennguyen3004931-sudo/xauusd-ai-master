$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$PSDefaultParameterValues['Get-Content:Encoding'] = 'UTF8'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Helper = Join-Path $ProjectRoot "scripts\lib\phase7c-runtime-source-attestation.ps1"
$Recovery = Join-Path $ProjectRoot "scripts\recover-phase7c-runtime-ready-stable-deploy-local.ps1"

function Assert-True([bool]$Value, [string]$Message) {
  if (-not $Value) { throw $Message }
}

function Write-ExactCanonicalAttestations {
  param(
    [Parameter(Mandatory = $true)] [string]$RuntimeRoot,
    [Parameter(Mandatory = $true)] [string]$LauncherPath,
    [Parameter(Mandatory = $true)] $ConfigIdentity
  )

  $components = @('api','lifecycle-broker','supervisor','trend','sideway','telegram','regime-notifier')
  $pid = 12000
  foreach ($component in $components) {
    $pid += 1
    [void](Write-Phase7CRuntimeSourceComponentAttestation `
      -RuntimeRoot $RuntimeRoot `
      -Component $component `
      -ProcessId $pid `
      -LauncherPath $LauncherPath `
      -ConfigIdentity $ConfigIdentity)
  }
}

function Read-ComponentRecord([string]$RuntimeRoot, [string]$Component) {
  $path = Join-Path $RuntimeRoot ("phase7c-source-attestation\components\" + $Component + ".json")
  return Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
}

function Write-ComponentRecord([string]$RuntimeRoot, [string]$Component, $Record) {
  $path = Join-Path $RuntimeRoot ("phase7c-source-attestation\components\" + $Component + ".json")
  Write-Phase7CRuntimeSourceAtomicJson -Path $path -Value $Record
}

if (-not (Test-Path -LiteralPath $Helper -PathType Leaf)) { throw "Missing attestation helper: $Helper" }
if (-not (Test-Path -LiteralPath $Recovery -PathType Leaf)) { throw "Missing recovery helper: $Recovery" }
. $Helper

$decisionCommand = Get-Command Get-Phase7CRuntimeSourceGenerationReloadDecision -ErrorAction SilentlyContinue
Assert-True ($null -ne $decisionCommand) "RED: runtime source generation reload decision helper is missing"

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("phase7c-stale-generation-reload-test-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
try {
  $runtimeRoot = Join-Path $tempRoot ".runtime"
  $launcher = Join-Path $tempRoot "launcher.ps1"
  [System.IO.File]::WriteAllText($launcher, "Write-Host 'launcher'`n", (New-Object System.Text.UTF8Encoding($false)))

  $configIdentity = Get-Phase7CRuntimeSourceConfigIdentity `
    -RuntimeRoot $runtimeRoot `
    -AccountMode LIVE `
    -LiveExecutionEnabled $true `
    -ControlApiUrl "http://127.0.0.1:3711"
  $deployment = Initialize-Phase7CRuntimeSourceDeployment `
    -RuntimeRoot $runtimeRoot `
    -SourceCommit "efc865c6922cc4994e86bffebc54e45ce95d3203" `
    -SourceTree "1111111111111111111111111111111111111111" `
    -Branch main `
    -ConfigIdentity $configIdentity

  # CASE_2: same deployment + every canonical SYSTEM component exact => no reload.
  Write-ExactCanonicalAttestations -RuntimeRoot $runtimeRoot -LauncherPath $launcher -ConfigIdentity $configIdentity
  $case2 = Get-Phase7CRuntimeSourceGenerationReloadDecision `
    -RuntimeRoot $runtimeRoot `
    -PreviousDeployment $deployment `
    -Deployment $deployment
  Assert-True (-not [bool]$case2.reloadRequired) "CASE_2 failed: exact same-generation attestations must not reload"
  Assert-True (-not [bool]$case2.deploymentIdChanged) "CASE_2 failed: deploymentId must be unchanged"
  Assert-True (-not [bool]$case2.canonicalSystemComponentAttestationMismatch) "CASE_2 failed: exact attestations must not mismatch"

  # CASE_1: deployment target is unchanged but lifecycle-broker source identity is stale.
  $broker = Read-ComponentRecord -RuntimeRoot $runtimeRoot -Component 'lifecycle-broker'
  $broker.sourceCommit = "0000000000000000000000000000000000000000"
  Write-ComponentRecord -RuntimeRoot $runtimeRoot -Component 'lifecycle-broker' -Record $broker
  $case1 = Get-Phase7CRuntimeSourceGenerationReloadDecision `
    -RuntimeRoot $runtimeRoot `
    -PreviousDeployment $deployment `
    -Deployment $deployment
  Assert-True ([bool]$case1.reloadRequired) "CASE_1 failed: stale lifecycle-broker attestation must require reload"
  Assert-True (-not [bool]$case1.deploymentIdChanged) "CASE_1 failed: deploymentId must remain target"
  Assert-True ([bool]$case1.canonicalSystemComponentAttestationMismatch) "CASE_1 failed: stale broker must be classified as attestation mismatch"
  $case1Broker = @($case1.componentMismatches | Where-Object { [string]$_.component -eq 'lifecycle-broker' })
  Assert-True ($case1Broker.Count -eq 1) "CASE_1 failed: lifecycle-broker mismatch record missing"
  Assert-True (@($case1Broker[0].reasonCodes) -contains 'SOURCE_COMMIT_MISMATCH') "CASE_1 failed: SOURCE_COMMIT_MISMATCH reason missing"

  # CASE_3: target deployment with a missing canonical component attestation => reload.
  Write-ExactCanonicalAttestations -RuntimeRoot $runtimeRoot -LauncherPath $launcher -ConfigIdentity $configIdentity
  $missingPath = Join-Path $runtimeRoot "phase7c-source-attestation\components\telegram.json"
  Remove-Item -LiteralPath $missingPath -Force
  $case3 = Get-Phase7CRuntimeSourceGenerationReloadDecision `
    -RuntimeRoot $runtimeRoot `
    -PreviousDeployment $deployment `
    -Deployment $deployment
  Assert-True ([bool]$case3.reloadRequired) "CASE_3 failed: missing canonical attestation must require reload"
  $case3Telegram = @($case3.componentMismatches | Where-Object { [string]$_.component -eq 'telegram' })
  Assert-True ($case3Telegram.Count -eq 1) "CASE_3 failed: telegram mismatch record missing"
  Assert-True (@($case3Telegram[0].reasonCodes) -contains 'ATTESTATION_MISSING') "CASE_3 failed: ATTESTATION_MISSING reason missing"

  # CASE_4: deployment identity changed => reload even when all current component attestations are exact.
  Write-ExactCanonicalAttestations -RuntimeRoot $runtimeRoot -LauncherPath $launcher -ConfigIdentity $configIdentity
  $previousChanged = [pscustomobject]@{ deploymentId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
  $case4 = Get-Phase7CRuntimeSourceGenerationReloadDecision `
    -RuntimeRoot $runtimeRoot `
    -PreviousDeployment $previousChanged `
    -Deployment $deployment
  Assert-True ([bool]$case4.reloadRequired) "CASE_4 failed: deploymentId change must require reload"
  Assert-True ([bool]$case4.deploymentIdChanged) "CASE_4 failed: deploymentId change flag missing"

  # Invariant: PID-only changes are process churn, not source-generation mismatch.
  Write-ExactCanonicalAttestations -RuntimeRoot $runtimeRoot -LauncherPath $launcher -ConfigIdentity $configIdentity
  $trend = Read-ComponentRecord -RuntimeRoot $runtimeRoot -Component 'trend'
  $trend.pid = [int]$trend.pid + 999
  Write-ComponentRecord -RuntimeRoot $runtimeRoot -Component 'trend' -Record $trend
  $pidOnly = Get-Phase7CRuntimeSourceGenerationReloadDecision `
    -RuntimeRoot $runtimeRoot `
    -PreviousDeployment $deployment `
    -Deployment $deployment
  Assert-True (-not [bool]$pidOnly.reloadRequired) "PID invariant failed: PID-only change must not require source-generation reload"

  # Identity classifier coverage: deploymentId and sourceTree are independent mismatch reasons.
  $trend = Read-ComponentRecord -RuntimeRoot $runtimeRoot -Component 'trend'
  $trend.deploymentId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  $trend.sourceTree = "2222222222222222222222222222222222222222"
  Write-ComponentRecord -RuntimeRoot $runtimeRoot -Component 'trend' -Record $trend
  $identityMismatch = Get-Phase7CRuntimeSourceGenerationReloadDecision `
    -RuntimeRoot $runtimeRoot `
    -PreviousDeployment $deployment `
    -Deployment $deployment
  $trendMismatch = @($identityMismatch.componentMismatches | Where-Object { [string]$_.component -eq 'trend' })
  Assert-True ([bool]$identityMismatch.reloadRequired) "Identity mismatch failed: source identity mismatch must reload"
  Assert-True (@($trendMismatch[0].reasonCodes) -contains 'DEPLOYMENT_ID_MISMATCH') "DEPLOYMENT_ID_MISMATCH reason missing"
  Assert-True (@($trendMismatch[0].reasonCodes) -contains 'SOURCE_TREE_MISMATCH') "SOURCE_TREE_MISMATCH reason missing"

  $recoveryText = (Get-Content -LiteralPath $Recovery -Raw).Replace("`r`n", "`n").Replace("`r", "`n")
  Assert-True ($recoveryText.Contains('Get-Phase7CRuntimeSourceGenerationReloadDecision')) "Recovery must use the canonical attestation reload decision helper"
  Assert-True ($recoveryText.Contains('$runtimeSourceGenerationReloadRequired = [bool]$runtimeSourceGenerationReloadDecision.reloadRequired')) "Recovery reload flag must come from the decision helper"
  Assert-True (-not $recoveryText.Contains('PID_CHANGE')) "Recovery must not make PID change a source-generation mismatch reason"
} finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "PHASE7C_STALE_BROKER_GENERATION_RELOAD_DECISION_SOURCE_TEST=PASS"
