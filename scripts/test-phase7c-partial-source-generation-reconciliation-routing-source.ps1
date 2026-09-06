$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RoutingLibrary = Join-Path $PSScriptRoot "lib\phase7c-runtime-source-generation-routing.ps1"
$RecoveryPath = Join-Path $PSScriptRoot "recover-phase7c-runtime-ready-stable-deploy-local.ps1"
$ExactBrokerContinuationPath = Join-Path $PSScriptRoot "continue-phase7c-runtime-source-generation-reconciliation-exact-broker-local.ps1"

function Assert-True([bool]$Value, [string]$Message) {
  if (-not $Value) { throw $Message }
}

function New-Component(
  [string]$Name,
  [string]$Verdict,
  [string]$SourceCommit,
  [string]$DeploymentId,
  [bool]$Alive,
  [int]$Pid,
  [string[]]$ReasonCodes = @()
) {
  return [pscustomobject]@{
    component = $Name
    verdict = $Verdict
    sourceCommit = $SourceCommit
    deploymentId = $DeploymentId
    alive = $Alive
    pid = $Pid
    reasonCodes = @($ReasonCodes)
  }
}

function New-Snapshot([object[]]$Components, [string]$Overall = "MISMATCH") {
  return [pscustomobject]@{
    overall = $Overall
    components = @($Components)
  }
}

function Assert-Throws([scriptblock]$Action, [string]$Message) {
  $threw = $false
  try { & $Action } catch { $threw = $true }
  if (-not $threw) { throw $Message }
}

foreach ($required in @($RecoveryPath, $ExactBrokerContinuationPath)) {
  Assert-True (Test-Path -LiteralPath $required -PathType Leaf) "Required source not found: $required"
}

# RED contract: partial rollout routing must be a pure, source-testable decision,
# not an ad-hoc process heuristic embedded in the LIVE mutation path.
Assert-True (Test-Path -LiteralPath $RoutingLibrary -PathType Leaf) `
  "RED: canonical partial source-generation routing library is missing: $RoutingLibrary"

. $RoutingLibrary
Assert-True ($null -ne (Get-Command Get-Phase7CRuntimeSourceGenerationRoute -ErrorAction SilentlyContinue)) `
  "RED: Get-Phase7CRuntimeSourceGenerationRoute is missing"

$targetCommit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
$targetDeployment = "deployment-target"
$oldCommit = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
$oldDeployment = "deployment-old"
$generationReasons = @("SOURCE_COMMIT_MISMATCH", "SOURCE_TREE_MISMATCH", "DEPLOYMENT_ID_MISMATCH")
$executorNames = @("supervisor", "trend", "sideway", "telegram", "regime-notifier")

$exactComponents = @(
  New-Component "api" "EXACT_MATCH" $targetCommit $targetDeployment $true 101 @("DEPLOYMENT_MATCH"),
  New-Component "web" "EXACT_MATCH" $targetCommit $targetDeployment $true 102 @("DEPLOYMENT_MATCH"),
  New-Component "lifecycle-broker" "EXACT_MATCH" $targetCommit $targetDeployment $true 103 @("DEPLOYMENT_MATCH")
)
foreach ($name in $executorNames) {
  $exactComponents += New-Component $name "EXACT_MATCH" $targetCommit $targetDeployment $true (200 + $exactComponents.Count) @("DEPLOYMENT_MATCH")
}
$exactSnapshot = New-Snapshot $exactComponents "EXACT_MATCH"
$exactRoute = Get-Phase7CRuntimeSourceGenerationRoute -Snapshot $exactSnapshot -ExpectedCommit $targetCommit -DeploymentId $targetDeployment
Assert-True ([string]$exactRoute.route -eq "NONE") `
  "Exact 8/8 runtime must remain a no-op. actual=$([string]$exactRoute.route)"

# Production regression: accepted deployment identity is unchanged, lifecycle broker
# is already exact/alive, but the five executor components still attest the previous
# generation. This MUST reconcile before Web/API deploy and MUST reuse the exact broker.
$partialComponents = @(
  New-Component "api" "EXACT_MATCH" $targetCommit $targetDeployment $true 101 @("DEPLOYMENT_MATCH"),
  New-Component "web" "EXACT_MATCH" $targetCommit $targetDeployment $true 102 @("DEPLOYMENT_MATCH"),
  New-Component "lifecycle-broker" "EXACT_MATCH" $targetCommit $targetDeployment $true 103 @("DEPLOYMENT_MATCH")
)
foreach ($name in $executorNames) {
  $partialComponents += New-Component $name "MISMATCH" $oldCommit $oldDeployment $false 0 $generationReasons
}
$partialSnapshot = New-Snapshot $partialComponents "MISMATCH"
$partialRoute = Get-Phase7CRuntimeSourceGenerationRoute -Snapshot $partialSnapshot -ExpectedCommit $targetCommit -DeploymentId $targetDeployment
Assert-True ([string]$partialRoute.route -eq "EXACT_BROKER_CONTINUATION") `
  "RED: partial rollout with exact broker must route to exact-broker continuation. actual=$([string]$partialRoute.route)"
Assert-True ([bool]$partialRoute.reconciliationRequired) `
  "RED: partial rollout must require source-generation reconciliation"

# If every SYSTEM component is still the previous generation, full generation reload
# remains the safe route; the exact-broker continuation must not be selected.
$fullOldComponents = @(
  New-Component "api" "EXACT_MATCH" $targetCommit $targetDeployment $true 101 @("DEPLOYMENT_MATCH"),
  New-Component "web" "EXACT_MATCH" $targetCommit $targetDeployment $true 102 @("DEPLOYMENT_MATCH"),
  New-Component "lifecycle-broker" "MISMATCH" $oldCommit $oldDeployment $false 0 $generationReasons
)
foreach ($name in $executorNames) {
  $fullOldComponents += New-Component $name "MISMATCH" $oldCommit $oldDeployment $false 0 $generationReasons
}
$fullOldSnapshot = New-Snapshot $fullOldComponents "MISMATCH"
$fullOldRoute = Get-Phase7CRuntimeSourceGenerationRoute -Snapshot $fullOldSnapshot -ExpectedCommit $targetCommit -DeploymentId $targetDeployment
Assert-True ([string]$fullOldRoute.route -eq "FULL_GENERATION_RELOAD") `
  "All-SYSTEM previous generation must route to full generation reload. actual=$([string]$fullOldRoute.route)"

# Missing or ambiguous evidence is never a no-op and must fail closed instead of
# silently deploying Web/API on an unproven runtime generation.
$missingComponents = @($partialComponents | Where-Object { [string]$_.component -ne "trend" })
$missingSnapshot = New-Snapshot $missingComponents "MISMATCH"
Assert-Throws {
  Get-Phase7CRuntimeSourceGenerationRoute -Snapshot $missingSnapshot -ExpectedCommit $targetCommit -DeploymentId $targetDeployment | Out-Null
} "RED: missing attestation component must fail closed"

$unexpectedComponents = @($partialComponents | ForEach-Object {
  if ([string]$_.component -eq "trend") {
    New-Component "trend" "MISMATCH" $oldCommit $oldDeployment $false 0 @("SOURCE_COMMIT_MISMATCH", "PROCESS_ID_MISMATCH")
  } else { $_ }
})
$unexpectedSnapshot = New-Snapshot $unexpectedComponents "MISMATCH"
Assert-Throws {
  Get-Phase7CRuntimeSourceGenerationRoute -Snapshot $unexpectedSnapshot -ExpectedCommit $targetCommit -DeploymentId $targetDeployment | Out-Null
} "RED: non-generation mismatch evidence must fail closed"

# Integration contract: recovery must call the pure routing decision and, for the
# partial exact-broker route, invoke the existing canonical continuation BEFORE the
# canonical Web/API deployment helper.
$recovery = (Get-Content -LiteralPath $RecoveryPath -Raw).Replace("`r`n", "`n").Replace("`r", "`n")
$routeCall = "Get-Phase7CRuntimeSourceGenerationRoute"
$exactHelper = "continue-phase7c-runtime-source-generation-reconciliation-exact-broker-local.ps1"
$partialMarker = "PHASE7C_RUNTIME_READY_STABLE_RECOVERY_PARTIAL_SOURCE_GENERATION=EXACT_BROKER_CONTINUATION"
$webDeploy = "& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WebApiDeploy"

foreach ($literal in @($routeCall, $exactHelper, $partialMarker)) {
  Assert-True ($recovery.Contains($literal)) "RED: recovery integration missing: $literal"
}
$routeIndex = $recovery.IndexOf($routeCall, [System.StringComparison]::Ordinal)
$partialIndex = $recovery.IndexOf($partialMarker, [System.StringComparison]::Ordinal)
$exactHelperIndex = $recovery.IndexOf($exactHelper, [System.StringComparison]::Ordinal)
$webDeployIndex = $recovery.IndexOf($webDeploy, [System.StringComparison]::Ordinal)
Assert-True ($routeIndex -ge 0 -and $routeIndex -lt $webDeployIndex) `
  "RED: generation route must be resolved before Web/API deploy"
Assert-True ($partialIndex -gt $routeIndex -and $partialIndex -lt $webDeployIndex) `
  "RED: partial rollout must be audited before Web/API deploy"
Assert-True ($exactHelperIndex -gt $partialIndex -and $exactHelperIndex -lt $webDeployIndex) `
  "RED: exact-broker continuation must complete before Web/API deploy"
Assert-True (-not $recovery.Contains("PHASE7C_RUNTIME_READY_STABLE_RECOVERY_PARTIAL_SOURCE_GENERATION_BROKER_RESTART=PERFORMED")) `
  "Partial exact-broker reconciliation must never advertise broker restart"

Write-Host "PHASE7C_PARTIAL_SOURCE_GENERATION_RECONCILIATION_ROUTING_SOURCE_TEST=PASS"
